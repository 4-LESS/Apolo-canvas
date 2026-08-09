import { App, setIcon, Notice } from 'obsidian';
import type { Toolbar } from '../../Toolbar';
import { PenProfileRegistry } from '../../../model/PenProfileRegistry';
import { SavedToolConfig } from '../../../plugin/Settings';
import { parseColor, serializeColor } from '../colorUtils';
import { PencilCasePresetNameModal } from './PencilCaseDrawer';
import { FloatingDragController } from '../FloatingDragController';

/**
 * Determines whether a hex color is light or dark for SVG stroke contrast.
 */
function isLightColor(hex: string): boolean {
    let clean = hex.trim();
    if (clean.startsWith('#')) clean = clean.substring(1);
    if (clean.length >= 6) {
        const r = parseInt(clean.substring(0, 2), 16);
        const g = parseInt(clean.substring(2, 4), 16);
        const b = parseInt(clean.substring(4, 6), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 140;
    }
    return false;
}

/**
 * Global Draggable Horizontal Pencil Case Bar.
 */
export class PencilCaseBar {
    public containerEl: HTMLElement;
    private presetsListEl: HTMLElement;
    private addBtn: HTMLButtonElement;
    private collapseBtn: HTMLButtonElement;
    private isCollapsed = false;
    public dragController: FloatingDragController;

    constructor(parent: HTMLElement, private plugin: any, private toolbar: Toolbar) {
        this.containerEl = parent.createDiv({ cls: 'ink-global-pencil-case-bar is-hidden' });
        
        // Presets list container
        this.presetsListEl = this.containerEl.createDiv({ cls: 'ink-pencil-case-presets-list' });

        // Add Preset (+) button
        this.addBtn = this.containerEl.createEl('button', {
            cls: 'ink-case-add-trigger',
            attr: { title: 'Save Current Tool' }
        }) as HTMLButtonElement;
        setIcon(this.addBtn, 'plus');
        this.addBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.handleSaveCurrent();
        });

        // Separator
        this.containerEl.createDiv({ cls: 'ink-pencil-case-divider' });

        // Collapse toggle button
        this.collapseBtn = this.containerEl.createEl('button', {
            cls: 'ink-case-collapse-btn',
            attr: { title: 'Collapse/Expand Pencil Case' }
        }) as HTMLButtonElement;
        setIcon(this.collapseBtn, 'chevron-down');
        this.collapseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.isCollapsed = !this.isCollapsed;
            this.containerEl.classList.toggle('is-collapsed', this.isCollapsed);
            setIcon(this.collapseBtn, this.isCollapsed ? 'chevron-up' : 'chevron-down');
        });

        // Attach full-surface threshold drag controller (Exclusive edge snapping disabled for pencil case)
        this.dragController = new FloatingDragController({
            targetEl: this.containerEl,
            otherElementGetter: () => this.toolbar?.toolbarEl || null,
            enableEdgeSnap: false,
            onOrientationChange: (orientation) => {
                this.setOrientation(orientation);
            }
        });

        this.syncValues();
    }



    public setOrientation(orientation: 'horizontal' | 'vertical'): void {
        const isVert = orientation === 'vertical';
        this.toggleClass(this.containerEl, 'is-vertical-orientation', isVert);
    }

    public syncValues(): void {
        const settingOrientation = this.plugin?.settings?.pencilCaseOrientation || 'horizontal';
        this.setOrientation(settingOrientation);

        if (!this.presetsListEl) return;
        this.presetsListEl.empty();

        const activeProfileId = this.plugin?.settings?.activePencilCaseProfileId;
        const profile = this.plugin?.settings?.pencilCaseProfiles?.find(
            (p: any) => p.id === activeProfileId
        );

        if (!profile || !profile.configs || profile.configs.length === 0) {
            const emptyLabel = this.presetsListEl.createDiv({
                cls: 'ink-case-empty-label',
                text: 'Empty Case'
            });
            return;
        }

        const focusedEngine = this.toolbar.focusedEngineRef.get();
        const activeTool = focusedEngine?.getToolName();
        const activeProfileIdEngine = (focusedEngine as any)?.activeProfileId;
        const activeWidth = focusedEngine ? focusedEngine.getToolSize(activeTool || 'pen') : -1;
        const activeColor = (focusedEngine as any)?.toolContext?.currentColor || '';

        profile.configs.forEach((config: SavedToolConfig) => {
            const pill = this.presetsListEl.createEl('button', {
                cls: 'ink-case-preset-pill',
                attr: { title: `${config.name} (${config.strokeWidth}px)` }
            }) as HTMLButtonElement;

            pill.style.backgroundColor = config.color;

            // Determine contrast stroke color for icon
            const isLight = isLightColor(config.color);
            const strokeColor = isLight ? '#1a1a1a' : '#ffffff';

            const registryProfile = PenProfileRegistry.get(config.profileId);
            let iconSvg = registryProfile?.iconSvg || `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 3 7 7L10 21H3v-7L14 3z"/></svg>`;

            iconSvg = iconSvg.replace(/stroke="currentColor"/g, `stroke="${strokeColor}"`);
            iconSvg = iconSvg.replace(/fill="currentColor"/g, `fill="${strokeColor}"`);

            pill.innerHTML = iconSvg;

            // Highlight active preset match
            if (
                focusedEngine &&
                config.toolType === activeTool &&
                config.profileId === activeProfileIdEngine &&
                Math.abs(config.strokeWidth - activeWidth) < 0.5 &&
                config.color.toLowerCase() === activeColor.toLowerCase()
            ) {
                this.addClass(pill, 'is-active');
            }

            pill.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.applyConfig(config);
            });
        });
    }

    public applyConfig(config: SavedToolConfig): void {
        const engine = this.toolbar.focusedEngineRef.get();
        if (!engine) return;

        engine.setTool(config.toolType);
        engine.setToolSize(config.toolType, config.strokeWidth);

        if (config.toolType === 'pen') {
            engine.setPenSmoothing?.(config.smoothingLevel);
        } else {
            engine.setHighlighterSmoothing?.(config.smoothingLevel);
        }

        engine.currentPattern = config.strokePattern;
        engine.activeProfileId = config.profileId;

        const toolType = config.toolType;
        const { palette } = this.toolbar.getPaletteData(toolType);
        let colorIndex = palette.colors.findIndex(
            (c: string) => c.toLowerCase() === config.color.toLowerCase()
        );

        if (colorIndex === -1) {
            const activeIdx = toolType === 'highlighter'
                ? (this.plugin.settings.activeHighlighterColorIndex ?? 0)
                : (this.plugin.settings.activePenColorIndex ?? 0);
            palette.colors[activeIdx] = config.color;
            colorIndex = activeIdx;
        }

        if (toolType === 'highlighter') {
            this.plugin.settings.activeHighlighterColorIndex = colorIndex;
            this.plugin.settings.lastHighlighterColorHex = config.color;
        } else {
            this.plugin.settings.activePenColorIndex = colorIndex;
            this.plugin.settings.lastPenColorHex = config.color;
        }

        engine.setPenColor(config.color);
        engine.requestFullRender();
        this.plugin.saveSettings();
        this.toolbar.syncToolState();
    }

    private handleSaveCurrent(): void {
        const engine = this.toolbar.focusedEngineRef.get();
        if (!engine) {
            new Notice('Please focus an active Ink canvas to save a preset.');
            return;
        }

        const toolType = engine.getToolName();
        if (toolType !== 'pen' && toolType !== 'highlighter') {
            new Notice('Please select the Pen or Highlighter tool to save a preset.');
            return;
        }

        const activeProfileId = (engine as any).activeProfileId || '';
        const strokeWidth = engine.getToolSize(toolType) ?? 4;
        const smoothingLevel = toolType === 'pen'
            ? (engine.getPenSmoothing?.() ?? 0.3)
            : (engine.getHighlighterSmoothing?.() ?? 0.55);
        const strokePattern = engine.currentPattern ?? 'solid';

        const rawColor = (engine as any).toolContext?.currentColor ?? '#000000';
        const parsed = parseColor(rawColor);
        const color = serializeColor(parsed.rgb, parsed.alpha, toolType === 'highlighter');

        const activeProfileIdSetting = this.plugin.settings.activePencilCaseProfileId;
        const profile = this.plugin.settings.pencilCaseProfiles.find(
            (p: any) => p.id === activeProfileIdSetting
        );

        if (!profile) {
            new Notice('No active pencil case profile found.');
            return;
        }

        if (profile.configs.length >= 6) {
            new Notice('Pencil case is full (maximum 6 presets per profile).');
            return;
        }

        const app = this.plugin.app || (globalThis as any).app;
        const modal = new PencilCasePresetNameModal(app, async (name) => {
            const newConfig: SavedToolConfig = {
                id: `tool-preset-${Date.now()}`,
                name: name,
                toolType: toolType as 'pen' | 'highlighter',
                profileId: activeProfileId,
                strokeWidth: strokeWidth,
                smoothingLevel: smoothingLevel,
                strokePattern: strokePattern,
                color: color
            };

            profile.configs.push(newConfig);
            await this.plugin.saveSettings();
            this.syncValues();
            this.toolbar.syncToolState();

            if (this.plugin.settingTab) {
                this.plugin.settingTab.display();
            }
        });
        modal.open();
    }

    public updateVisibility(isCanvasFocused: boolean): void {
        const isEnabled = this.plugin?.settings?.enablePencilCase ?? true;
        if (isEnabled && isCanvasFocused) {
            this.removeClass(this.containerEl, 'is-hidden');
        } else {
            this.addClass(this.containerEl, 'is-hidden');
        }
    }

    public destroy(): void {
        if (this.containerEl) {
            this.containerEl.remove();
        }
    }

    private addClass(el: HTMLElement, cls: string): void {
        if (!el) return;
        if (typeof (el as any).addClass === 'function') (el as any).addClass(cls);
        else if (el.classList) el.classList.add(cls);
    }

    private removeClass(el: HTMLElement, cls: string): void {
        if (!el) return;
        if (typeof (el as any).removeClass === 'function') (el as any).removeClass(cls);
        else if (el.classList) el.classList.remove(cls);
    }

    private toggleClass(el: HTMLElement, cls: string, value: boolean): void {
        if (!el) return;
        if (typeof (el as any).toggleClass === 'function') (el as any).toggleClass(cls, value);
        else if (el.classList && typeof el.classList.toggle === 'function') el.classList.toggle(cls, value);
        else if (el.classList) value ? el.classList.add(cls) : el.classList.remove(cls);
    }
}
