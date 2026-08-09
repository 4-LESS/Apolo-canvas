import { setIcon, Notice } from 'obsidian';
import type { Toolbar } from '../../Toolbar';
import { PenProfileRegistry } from '../../../model/PenProfileRegistry';
import { SavedToolConfig } from '../../../plugin/Settings';
import { isLightColor } from '../colorUtils';
import { PencilCasePresetNameModal } from '../../modals/PencilCasePresetNameModal';
import { addClass, removeClass, toggleClass } from '../../../utils/dom';
import { FloatingDragController } from '../FloatingDragController';
import { applyToolConfig, captureToolConfig, getActiveCaseProfile } from '../pencilCasePresets';

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
        applyToolConfig(this.toolbar, this.plugin, config);
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

        const captured = captureToolConfig(engine, toolType);

        const profile = getActiveCaseProfile(this.plugin.settings);
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
            profile.configs.push({
                id: `tool-preset-${Date.now()}`,
                name,
                toolType: toolType as 'pen' | 'highlighter',
                ...captured
            });
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

    private addClass(el: HTMLElement, cls: string): void { addClass(el, cls); }
    private removeClass(el: HTMLElement, cls: string): void { removeClass(el, cls); }
    private toggleClass(el: HTMLElement, cls: string, value: boolean): void { toggleClass(el, cls, value); }
}
