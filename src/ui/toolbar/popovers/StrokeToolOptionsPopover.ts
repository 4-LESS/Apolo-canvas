import { setIcon } from 'obsidian';
import { InkEngine } from '../../../engine/InkEngine';
import { BasePopover } from '../BasePopover';
import type { Toolbar } from '../../Toolbar';
import { PenProfileRegistry } from '../../../model/PenProfileRegistry';
import { buildSliderRow, SliderRowHandle } from '../components/controls';
import { configMatchesEngine, toggleFavorite, StrokeToolType } from '../pencilCasePresets';

export interface StrokeToolPopoverConfig {
    tool: StrokeToolType;
    cssClass: string;
    /** Profile assumed when the engine reports none (matches engine defaults). */
    fallbackProfileId: string;
    defaults: { thickness: number; smoothing: number };
    profileSettingsKey: 'activePenProfileId' | 'activeHighlighterProfileId';
    getSmoothing(engine: InkEngine): number | undefined;
    setSmoothing(engine: InkEngine, value: number): void;
    /** Optional tool-specific rows appended below the sliders. */
    extraContent?: (host: HTMLElement, popover: StrokeToolOptionsPopover) => void;
    /** Optional hook run during populate to sync the extra rows. */
    syncExtraContent?: (popover: StrokeToolOptionsPopover) => void;
}

export const PEN_OPTIONS_CONFIG: StrokeToolPopoverConfig = {
    tool: 'pen',
    cssClass: 'ink-pen-options-popover',
    fallbackProfileId: 'pen-rounded',
    defaults: { thickness: 4, smoothing: 0.25 },
    profileSettingsKey: 'activePenProfileId',
    getSmoothing: (engine) => engine.getPenSmoothing?.(),
    setSmoothing: (engine, v) => engine.setPenSmoothing?.(v)
};

export const HIGHLIGHTER_OPTIONS_CONFIG: StrokeToolPopoverConfig = {
    tool: 'highlighter',
    cssClass: 'ink-highlighter-options-popover',
    fallbackProfileId: 'highlighter-round',
    defaults: { thickness: 16, smoothing: 0.3 },
    profileSettingsKey: 'activeHighlighterProfileId',
    getSmoothing: (engine) => engine.getHighlighterSmoothing?.(),
    setSmoothing: (engine, v) => engine.setHighlighterSmoothing?.(v),
    extraContent: (host, popover) => popover.buildLinearToggle(host),
    syncExtraContent: (popover) => popover.syncLinearToggle()
};

/**
 * Options popover shared by the Pen and Highlighter tools: profile carousel,
 * thickness/smoothness sliders, and pencil-case favourite star. The two tools
 * differ only in the injected configuration.
 */
export class StrokeToolOptionsPopover extends BasePopover {
    private _activeEngine: InkEngine | null = null;
    private get activeEngine(): InkEngine | null {
        return this._activeEngine || (this.toolbar ? (this.toolbar.focusedEngineRef?.get() ?? null) : null);
    }
    private set activeEngine(engine: InkEngine | null) {
        this._activeEngine = engine;
    }

    private isSyncing = false;

    private profileIndicatorEl!: HTMLDivElement;
    private starBtn!: HTMLButtonElement;
    private profileCarouselEl!: HTMLDivElement;
    private thicknessRow!: SliderRowHandle;
    private smoothnessRow!: SliderRowHandle;
    private linearToggleCheckbox: HTMLInputElement | null = null;

    constructor(
        parent: HTMLElement,
        plugin: any,
        private toolbar: Toolbar,
        private config: StrokeToolPopoverConfig,
        dismissBoundary?: HTMLElement
    ) {
        super(parent, plugin, config.cssClass, dismissBoundary);
        this.ensureBuilt();
    }

    protected buildContent(): void {
        const cfg = this.config;

        // Header row: profile label + favourite star
        const topHeaderRow = this.el.createDiv({ cls: 'ink-pen-header-row' });
        this.profileIndicatorEl = topHeaderRow.createDiv({ cls: 'ink-profile-indicator-label' }) as HTMLDivElement;
        this.starBtn = topHeaderRow.createEl('button', {
            cls: 'ink-star-tool-btn',
            attr: { title: 'Favorite to Pencil Case', type: 'button' }
        }) as HTMLButtonElement;
        setIcon(this.starBtn, 'star');
        this.starBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.handleStarToggle();
        });

        // Profile carousel (populated on each open)
        this.profileCarouselEl = this.el.createDiv({ cls: 'ink-profile-carousel' }) as HTMLDivElement;

        this.thicknessRow = buildSliderRow(this.el, {
            label: 'THICKNESS',
            min: 1, max: 30, step: 1,
            value: cfg.defaults.thickness,
            onInput: (val) => this.handleManualAdjust((engine) => engine.setToolSize?.(cfg.tool, val))
        });

        this.smoothnessRow = buildSliderRow(this.el, {
            label: 'SMOOTHNESS',
            min: 0, max: 1, step: 0.05,
            value: cfg.defaults.smoothing,
            format: (v) => String(v),
            sliderClass: 'ink-smoothness-slider',
            onInput: (val) => this.handleManualAdjust((engine) => cfg.setSmoothing(engine, val))
        });

        cfg.extraContent?.(this.el, this);
    }

    /** Manual slider adjustment: applies the change and switches to CUSTOM. */
    private handleManualAdjust(apply: (engine: InkEngine) => void): void {
        if (this.isSyncing) return;
        const engine = this.activeEngine;
        if (!engine) return;

        apply(engine);
        (engine as any).activeProfileId = '';
        if (this.toolbar.plugin?.settings) {
            this.toolbar.plugin.settings[this.config.profileSettingsKey] = null;
            this.toolbar.queueSettingsSave();
        }
        this.profileCarouselEl?.querySelectorAll('.ink-profile-pill').forEach(s => s.classList.remove('is-selected'));
        if (this.profileIndicatorEl) this.profileIndicatorEl.textContent = 'CUSTOM';
        engine.requestFullRender();
        this.syncStarState(engine);
        this.toolbar.pencilCaseBar?.syncValues();
        this.toolbar.syncToolState();
    }

    /** Opens and populates the popover anchored to the given tool button. */
    public showOptions(anchorBtn: HTMLElement, engine: InkEngine): void {
        this.activeEngine = engine;
        this.showWithContent(anchorBtn, () => this.populateContent(engine));
    }

    private populateContent(engine: InkEngine): void {
        const cfg = this.config;
        this.isSyncing = true;
        try {
            const rawProfileId = (engine as any).activeProfileId;
            const activeProfileId = rawProfileId !== undefined ? rawProfileId : cfg.fallbackProfileId;
            const thickness = typeof engine.getToolSize === 'function' ? engine.getToolSize(cfg.tool) : cfg.defaults.thickness;
            const smoothing = cfg.getSmoothing(engine) ?? cfg.defaults.smoothing;

            // 1. Profile carousel
            if (this.profileCarouselEl) {
                this.profileCarouselEl.empty();
                const profiles = PenProfileRegistry.getAll().filter(p => p.toolType === cfg.tool);
                const activeProfile = activeProfileId ? profiles.find(p => p.id === activeProfileId) : undefined;

                if (this.profileIndicatorEl) {
                    this.profileIndicatorEl.textContent = activeProfile ? activeProfile.name.toUpperCase() : 'CUSTOM';
                }

                profiles.forEach((profile) => {
                    const pill = this.profileCarouselEl.createEl('button', {
                        cls: `ink-profile-pill ${profile.id === activeProfileId ? 'is-selected' : ''}`,
                        attr: { title: profile.name, type: 'button' }
                    });
                    pill.innerHTML = profile.iconSvg;

                    pill.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.isSyncing = true;
                        try {
                            if (this.profileIndicatorEl) {
                                this.profileIndicatorEl.textContent = profile.name.toUpperCase();
                            }
                            this.profileCarouselEl.querySelectorAll('.ink-profile-pill').forEach(s => s.classList.remove('is-selected'));
                            pill.classList.add('is-selected');

                            // Apply profile to engine + persist selection
                            (engine as any).activeProfileId = profile.id;
                            if (this.toolbar.plugin?.settings) {
                                this.toolbar.plugin.settings[cfg.profileSettingsKey] = profile.id;
                                this.toolbar.queueSettingsSave();
                            }
                            engine.setToolSize?.(cfg.tool, profile.baseWidth);
                            cfg.setSmoothing(engine, profile.baseSmoothing);
                            engine.currentPattern = profile.pattern || 'solid';

                            this.thicknessRow.setValue(profile.baseWidth);
                            this.smoothnessRow.setValue(profile.baseSmoothing);

                            engine.requestFullRender();
                            this.syncStarState(engine);
                        } finally {
                            this.isSyncing = false;
                        }
                    });
                });
            }

            // 2. Sliders (direct DOM mutation, no event side effects)
            this.thicknessRow?.setValue(thickness);
            this.smoothnessRow?.setValue(smoothing);

            // 3. Tool-specific rows
            cfg.syncExtraContent?.(this);

            // 4. Favourite star
            this.syncStarState(engine);
        } finally {
            this.isSyncing = false;
        }
    }

    // ── Star / Pencil Case ─────────────────────────────────────────────────

    private syncStarState(engine: InkEngine): void {
        if (!this.starBtn) return;
        const settings = this.toolbar.plugin?.settings;
        if (!settings) return;
        const isFavorited = configMatchesEngine(settings, engine, this.config.tool, this.config.fallbackProfileId);
        this.starBtn.classList.toggle('is-active', isFavorited);
    }

    private handleStarToggle(): void {
        const plugin = this.toolbar.plugin;
        const engine = this.activeEngine;
        if (!plugin?.settings || !engine) return;

        const result = toggleFavorite(plugin as any, engine, this.config.tool, this.config.fallbackProfileId);
        if (result === 'no-case' || result === 'full') return;

        this.starBtn.classList.toggle('is-active', result === 'added');
        this.toolbar.pencilCaseBar?.syncValues();
    }

    // ── Highlighter-specific rows ──────────────────────────────────────────

    public buildLinearToggle(host: HTMLElement): void {
        const row = host.createDiv({ cls: 'option-switch-row' });
        row.createEl('label', { text: 'Straight Lines Only' });
        this.linearToggleCheckbox = row.createEl('input', {
            cls: 'ink-option-checkbox',
            attr: { type: 'checkbox' }
        }) as HTMLInputElement;
        this.linearToggleCheckbox.addEventListener('change', async () => {
            if (this.toolbar.plugin?.settings) {
                this.toolbar.plugin.settings.highlighterLinearModifier = this.linearToggleCheckbox!.checked;
            }
            await this.toolbar.plugin?.saveSettings?.();
        });
    }

    public syncLinearToggle(): void {
        if (!this.linearToggleCheckbox) return;
        this.linearToggleCheckbox.checked = this.toolbar.plugin?.settings?.highlighterLinearModifier ?? false;
    }
}
