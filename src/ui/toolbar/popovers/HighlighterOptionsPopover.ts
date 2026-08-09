import { setIcon, Notice } from 'obsidian';
import { InkEngine } from '../../../engine/InkEngine';
import { BasePopover } from '../BasePopover';
import type { Toolbar } from '../../Toolbar';
import { PenProfileRegistry } from '../../../model/PenProfileRegistry';
import { parseColor, serializeColor } from '../colorUtils';

/**
 * Floating popover for Highlighter tool options.
 * Serves ONLY the Highlighter tool — Pen has its own PenOptionsPopover.
 */
export class HighlighterOptionsPopover extends BasePopover {
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
    private thicknessValSpan!: HTMLSpanElement;
    private thicknessSlider!: HTMLInputElement;
    private smoothnessValSpan!: HTMLSpanElement;
    private smoothnessSlider!: HTMLInputElement;
    private toggleCheckbox!: HTMLInputElement;
    private toggleContainer!: HTMLDivElement;

    constructor(parent: HTMLElement, plugin: any, private toolbar: Toolbar, dismissBoundary?: HTMLElement) {
        super(parent, plugin, 'ink-highlighter-options-popover', dismissBoundary);
    }

    protected buildContent(): void {
        // Header row: profile label + star button
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

        // Profile carousel
        this.profileCarouselEl = this.el.createDiv({ cls: 'ink-profile-carousel' }) as HTMLDivElement;

        // Thickness slider row container (.ink-slider-row)
        const thicknessRow = this.el.createDiv({ cls: 'ink-slider-row' });
        const thicknessHeader = thicknessRow.createDiv({ cls: 'ink-style-header-row' });
        thicknessHeader.createDiv({ cls: 'ink-style-header', text: 'THICKNESS' });

        const thicknessInputRow = thicknessRow.createDiv({ cls: 'ink-slider-input-row' });
        this.thicknessSlider = thicknessInputRow.createEl('input', {
            cls: 'ink-thickness-slider',
            attr: { type: 'range', min: '1', max: '30', step: '1', value: '16' }
        }) as HTMLInputElement;
        this.thicknessValSpan = thicknessInputRow.createSpan({ cls: 'ink-popover-size-val', text: '16px' });

        const updateThickness = (e?: Event) => {
            e?.stopPropagation?.();
            const slider = (e?.target as HTMLInputElement) || this.thicknessSlider;
            const val = Number(slider?.value);
            if (isNaN(val)) return;
            if (this.thicknessSlider) this.thicknessSlider.value = String(val);
            if (this.thicknessValSpan) this.thicknessValSpan.textContent = `${val}px`;
            if (this.isSyncing) return;
            if (this.activeEngine) {
                if (typeof this.activeEngine.setToolSize === 'function') {
                    this.activeEngine.setToolSize('highlighter', val);
                }
                (this.activeEngine as any).activeProfileId = '';
                if (this.toolbar.plugin?.settings) {
                    this.toolbar.plugin.settings.activeHighlighterProfileId = null;
                }
                if (this.profileCarouselEl) {
                    this.profileCarouselEl.querySelectorAll('.ink-profile-pill').forEach(s => s.classList.remove('is-selected'));
                }
                if (this.profileIndicatorEl) {
                    this.profileIndicatorEl.textContent = 'CUSTOM';
                }
                this.activeEngine.requestFullRender();
                this.syncStarState(this.activeEngine);
                this.toolbar.pencilCaseBar?.syncValues();
                this.toolbar.syncToolState();
            }
        };

        this.thicknessSlider.addEventListener('input', updateThickness);
        this.thicknessSlider.addEventListener('change', updateThickness);
        this.thicknessSlider.addEventListener('pointerdown', (e) => e.stopPropagation());

        // Smoothness slider row container (.ink-slider-row)
        const smoothnessRow = this.el.createDiv({ cls: 'ink-slider-row' });
        const smoothnessHeader = smoothnessRow.createDiv({ cls: 'ink-style-header-row' });
        smoothnessHeader.createDiv({ cls: 'ink-style-header', text: 'SMOOTHNESS' });

        const smoothnessInputRow = smoothnessRow.createDiv({ cls: 'ink-slider-input-row' });
        this.smoothnessSlider = smoothnessInputRow.createEl('input', {
            cls: 'ink-smoothness-slider',
            attr: { type: 'range', min: '0.0', max: '1.0', step: '0.05', value: '0.3' }
        }) as HTMLInputElement;
        this.smoothnessValSpan = smoothnessInputRow.createSpan({ cls: 'ink-popover-size-val', text: '0.3' });

        const updateSmoothness = (e?: Event) => {
            e?.stopPropagation?.();
            const slider = (e?.target as HTMLInputElement) || this.smoothnessSlider;
            const val = Number(slider?.value);
            if (isNaN(val)) return;
            if (this.smoothnessSlider) this.smoothnessSlider.value = String(val);
            if (this.smoothnessValSpan) this.smoothnessValSpan.textContent = String(val);
            if (this.isSyncing) return;
            if (this.activeEngine) {
                this.activeEngine.setHighlighterSmoothing?.(val);
                (this.activeEngine as any).activeProfileId = '';
                if (this.toolbar.plugin?.settings) {
                    this.toolbar.plugin.settings.activeHighlighterProfileId = null;
                }
                if (this.profileCarouselEl) {
                    this.profileCarouselEl.querySelectorAll('.ink-profile-pill').forEach(s => s.classList.remove('is-selected'));
                }
                if (this.profileIndicatorEl) {
                    this.profileIndicatorEl.textContent = 'CUSTOM';
                }
                this.activeEngine.requestFullRender();
                this.syncStarState(this.activeEngine);
                this.toolbar.pencilCaseBar?.syncValues();
                this.toolbar.syncToolState();
            }
        };

        this.smoothnessSlider.addEventListener('input', updateSmoothness);
        this.smoothnessSlider.addEventListener('change', updateSmoothness);
        this.smoothnessSlider.addEventListener('pointerdown', (e) => e.stopPropagation());

        // Straight Lines Only toggle (below sliders)
        const toggleRow = this.el.createDiv({ cls: 'ink-toggle-row-container' });
        toggleRow.createEl('label', { text: 'Straight Lines Only' });

        this.toggleContainer = toggleRow.createDiv({ cls: 'checkbox-container' }) as HTMLDivElement;
        this.toggleCheckbox = this.toggleContainer.createEl('input', {
            attr: { type: 'checkbox' }
        }) as HTMLInputElement;

        this.toggleCheckbox.addEventListener('change', async () => {
            const isChecked = this.toggleCheckbox.checked;
            this.toggleContainer.classList.toggle('is-enabled', isChecked);
            if (this.toolbar.plugin?.settings) {
                this.toolbar.plugin.settings.highlighterLinearModifier = isChecked;
            }
            await this.toolbar.plugin?.saveSettings?.();
        });
    }

    /**
     * Opens and populates the highlighter options popover anchored to the given button.
     */
    public showHighlighterOptions(anchorBtn: HTMLElement, engine: InkEngine): void {
        this.activeEngine = engine;
        this.show(anchorBtn);

        try {
            this.populateContent(engine);
        } catch (err) {
            console.error('[Obsidian Ink] Error populating highlighter options popover:', err);
        }

        this.reposition();
    }

    private populateContent(engine: InkEngine): void {
        this.isSyncing = true;
        try {
            const rawProfileId = (engine as any).activeProfileId;
            const activeProfileId = rawProfileId !== undefined ? rawProfileId : 'highlighter-round';
            const thickness = typeof engine.getToolSize === 'function' ? engine.getToolSize('highlighter') : 16;
            const smoothing = typeof engine.getHighlighterSmoothing === 'function' ? engine.getHighlighterSmoothing() : 0.3;

            // 1. Profile Carousel
            if (this.profileCarouselEl) {
                this.profileCarouselEl.empty();
                const profiles = PenProfileRegistry.getAll().filter(p => p.toolType === 'highlighter');
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
                            // Update indicator label
                            if (this.profileIndicatorEl) {
                                this.profileIndicatorEl.textContent = profile.name.toUpperCase();
                            }

                            // Update selection ring on siblings
                            const siblings = this.profileCarouselEl.querySelectorAll('.ink-profile-pill');
                            siblings.forEach(s => s.classList.remove('is-selected'));
                            pill.classList.add('is-selected');

                            // Apply profile to engine
                            (engine as any).activeProfileId = profile.id;
                            if (this.toolbar.plugin?.settings) {
                                this.toolbar.plugin.settings.activeHighlighterProfileId = profile.id;
                            }
                            if (typeof engine.setToolSize === 'function') {
                                engine.setToolSize('highlighter', profile.baseWidth);
                            }
                            engine.setHighlighterSmoothing?.(profile.baseSmoothing);
                            engine.currentPattern = profile.pattern || 'solid';

                            // Direct DOM mutation on sliders — NO event dispatch side effects
                            if (this.thicknessSlider) this.thicknessSlider.value = String(profile.baseWidth);
                            if (this.thicknessValSpan) this.thicknessValSpan.textContent = `${profile.baseWidth}px`;
                            if (this.smoothnessSlider) this.smoothnessSlider.value = String(profile.baseSmoothing);
                            if (this.smoothnessValSpan) this.smoothnessValSpan.textContent = String(profile.baseSmoothing);

                            engine.requestFullRender();

                            // Re-sync star state after profile change
                            this.syncStarState(engine);
                        } finally {
                            this.isSyncing = false;
                        }
                    });
                });
            }

            // 2. Sync sliders via direct DOM mutation
            if (this.thicknessSlider && this.thicknessValSpan) {
                this.thicknessSlider.value = String(thickness);
                this.thicknessValSpan.textContent = `${thickness}px`;
            }
            if (this.smoothnessSlider && this.smoothnessValSpan) {
                this.smoothnessSlider.value = String(smoothing);
                this.smoothnessValSpan.textContent = String(smoothing);
            }

            // 3. Sync toggle checkbox
            if (this.toggleCheckbox && this.toggleContainer) {
                const isActive = this.toolbar.plugin?.settings?.highlighterLinearModifier ?? false;
                this.toggleCheckbox.checked = isActive;
                this.toggleContainer.classList.toggle('is-enabled', isActive);
            }

            // 4. Sync star button
            this.syncStarState(engine);
        } finally {
            this.isSyncing = false;
        }
    }

    // ── Star / Pencil Case System ──────────────────────────────────────────

    private syncStarState(engine: InkEngine): void {
        if (!this.starBtn) return;
        const plugin = this.toolbar.plugin;
        if (!plugin?.settings) return;

        const activeCaseId = plugin.settings.activePencilCaseProfileId;
        const activeProfile = plugin.settings.pencilCaseProfiles?.find((p: any) => p.id === activeCaseId);
        if (!activeProfile) {
            this.starBtn.classList.remove('is-active');
            return;
        }

        const toolType = 'highlighter';
        const profileId = (engine as any).activeProfileId || 'highlighter-round';
        const width = typeof engine.getToolSize === 'function' ? engine.getToolSize('highlighter') : 16;
        const currentColor = (engine as any).toolContext?.currentColor ?? '#ffff0080';

        const isFavorited = activeProfile.configs.some((c: any) =>
            c.toolType === toolType &&
            c.profileId === profileId &&
            Math.abs(c.strokeWidth - width) < 0.5 &&
            this.isColorMatch(c.color, currentColor)
        );

        this.starBtn.classList.toggle('is-active', isFavorited);
    }

    private handleStarToggle(): void {
        const plugin = this.toolbar.plugin;
        const engine = this.activeEngine;
        if (!plugin?.settings || !engine) return;

        const activeProfileIdSetting = plugin.settings.activePencilCaseProfileId;
        const caseProfile = plugin.settings.pencilCaseProfiles?.find((p: any) => p.id === activeProfileIdSetting);
        if (!caseProfile) return;

        const currentProfileId = (engine as any).activeProfileId || 'highlighter-round';
        const strokeWidth = engine.getToolSize('highlighter') ?? 16;
        const smoothingLevel = engine.getHighlighterSmoothing?.() ?? 0.3;
        const strokePattern = engine.currentPattern ?? 'solid';
        const rawColor = (engine as any).toolContext?.currentColor ?? '#ffff0080';
        const parsed = parseColor(rawColor);
        const color = serializeColor(parsed.rgb, parsed.alpha, true);

        const existingIdx = caseProfile.configs.findIndex((c: any) =>
            c.toolType === 'highlighter' &&
            c.profileId === currentProfileId &&
            Math.abs(c.strokeWidth - strokeWidth) < 0.5 &&
            this.isColorMatch(c.color, color)
        );

        if (existingIdx !== -1) {
            caseProfile.configs.splice(existingIdx, 1);
            new Notice('Removed highlighter preset from Pencil Case.');
        } else {
            if (caseProfile.configs.length >= 6) {
                new Notice('Pencil Case is full (maximum 6 presets).');
                return;
            }
            const registryProfile = PenProfileRegistry.get(currentProfileId);
            const defaultName = registryProfile?.name || 'Highlighter';

            caseProfile.configs.push({
                id: `preset-${Date.now()}`,
                name: `${defaultName} (${strokeWidth}px)`,
                toolType: 'highlighter' as const,
                profileId: currentProfileId,
                strokeWidth,
                smoothingLevel,
                strokePattern,
                color
            });
            new Notice('Saved highlighter preset to Pencil Case!');
        }

        plugin.saveSettings?.();
        this.starBtn.classList.toggle('is-active', existingIdx === -1);
        (this.toolbar as any).pencilCaseBar?.syncValues();
        if (plugin.settingTab) plugin.settingTab.display();
    }

    private isColorMatch(a: string, b: string): boolean {
        if (!a || !b) return false;
        return a.trim().toLowerCase() === b.trim().toLowerCase();
    }
}
