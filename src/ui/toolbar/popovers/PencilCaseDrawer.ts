import { App, Modal, Setting, Notice } from 'obsidian';
import { BasePopover } from '../BasePopover';
import type { Toolbar } from '../../Toolbar';
import { PenProfileRegistry } from '../../../model/PenProfileRegistry';
import { SavedToolConfig } from '../../../plugin/Settings';
import { parseColor, serializeColor } from '../colorUtils';

/**
 * Naming modal for custom tool configurations.
 */
export class PencilCasePresetNameModal extends Modal {
    private result: string = '';

    constructor(
        app: App,
        private onSubmit: (name: string) => void
    ) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Name new Tool Preset' });

        let nameInput: HTMLInputElement;

        new Setting(contentEl)
            .setName('Preset Name')
            .setDesc('Enter a name for the saved tool configuration.')
            .addText((text) => {
                nameInput = text.inputEl;
                text.onChange((value) => {
                    this.result = value.trim();
                });
            });

        new Setting(contentEl)
            .addButton((btn) => {
                btn.setButtonText('Save')
                    .setCta()
                    .onClick(() => {
                        this.submit();
                    });
            });

        nameInput!.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                this.submit();
            }
        });

        nameInput!.focus();
    }

    private submit() {
        const name = this.result || 'My Preset';
        this.onSubmit(name);
        this.close();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

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
 * Floating Pencil Case Drawer Popover.
 */
export class PencilCaseDrawer extends BasePopover {
    private addTriggerEl!: HTMLButtonElement;
    private presetsContainerEl!: HTMLElement;

    constructor(parent: HTMLElement, plugin: any, private toolbar: Toolbar) {
        super(parent, plugin, 'ink-pencil-case-drawer-popover');
    }

    protected buildContent(): void {
        this.el.createEl('div', { cls: 'ink-style-header', text: 'PENCIL CASE' });

        // Vertical drawer container
        this.presetsContainerEl = this.el.createDiv({ cls: 'ink-pencil-case-drawer' });

        // Save current to case button
        this.addTriggerEl = this.el.createEl('button', {
            cls: 'ink-case-add-trigger',
            text: '+ Save Tool'
        }) as HTMLButtonElement;

        this.addTriggerEl.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.handleSaveCurrent();
        });
    }

    protected alignToAnchor(anchorEl: HTMLElement): void {
        // Since we are appended directly to the relative canvas container,
        // position the drawer popover directly above the trigger button.
        this.el.style.position = 'absolute';
        this.el.style.bottom = '66px';
        this.el.style.right = '20px';
        this.el.style.left = 'auto';
        this.el.style.top = 'auto';
    }

    public show(anchorEl: HTMLElement): void {
        super.show(anchorEl);
        if (this.toolbar.pencilCaseToggleBtn) {
            this.addClass(this.toolbar.pencilCaseToggleBtn, 'is-active-popover');
        }
    }

    public hide(): void {
        super.hide();
        if (this.toolbar.pencilCaseToggleBtn) {
            this.removeClass(this.toolbar.pencilCaseToggleBtn, 'is-active-popover');
        }
    }

    public syncValues(): void {
        if (!this.presetsContainerEl) return;
        this.presetsContainerEl.empty();

        const activeProfileId = this.plugin.settings.activePencilCaseProfileId;
        const profile = this.plugin.settings.pencilCaseProfiles.find(
            (p: any) => p.id === activeProfileId
        );

        if (!profile || profile.configs.length === 0) {
            const emptyLabel = this.presetsContainerEl.createDiv({
                cls: 'ink-case-empty-label',
                text: 'Empty Case'
            });
            emptyLabel.style.fontSize = '10px';
            emptyLabel.style.color = 'var(--text-muted)';
            emptyLabel.style.textAlign = 'center';
            emptyLabel.style.padding = '8px 0';
            return;
        }

        profile.configs.forEach((config: SavedToolConfig) => {
            const pill = this.presetsContainerEl.createEl('button', {
                cls: 'ink-case-preset-pill',
                attr: { title: config.name }
            }) as HTMLButtonElement;

            pill.style.backgroundColor = config.color;

            // Determine contrast stroke color
            const isLight = isLightColor(config.color);
            const strokeColor = isLight ? '#1a1a1a' : '#ffffff';

            const registryProfile = PenProfileRegistry.get(config.profileId);
            let iconSvg = registryProfile?.iconSvg || `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 3 7 7L10 21H3v-7L14 3z"/></svg>`;

            // Inject the calculated stroke/fill color for visibility
            iconSvg = iconSvg.replace(/stroke="currentColor"/g, `stroke="${strokeColor}"`);
            iconSvg = iconSvg.replace(/fill="currentColor"/g, `fill="${strokeColor}"`);

            pill.innerHTML = iconSvg;

            pill.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.applyConfig(config);
            });
        });
    }

    private applyConfig(config: SavedToolConfig): void {
        const engine = this.toolbar.focusedEngineRef.get();
        if (!engine) return;

        // Instantly swap tool type
        engine.setTool(config.toolType);

        // Instantly swap stroke size
        engine.setToolSize(config.toolType, config.strokeWidth);

        // Instantly swap smoothing level
        if (config.toolType === 'pen') {
            engine.setPenSmoothing?.(config.smoothingLevel);
        } else {
            engine.setHighlighterSmoothing?.(config.smoothingLevel);
        }

        // Instantly swap stroke pattern
        engine.currentPattern = config.strokePattern;

        // Instantly swap rendering strategy / profileId
        engine.activeProfileId = config.profileId;

        // Update Tier 1 color stack index & last used hex color
        const toolType = config.toolType;
        const { palette } = this.toolbar.getPaletteData(toolType);
        let colorIndex = palette.colors.findIndex(
            (c: string) => c.toLowerCase() === config.color.toLowerCase()
        );

        if (colorIndex === -1) {
            // Overwrite active color slot in the palette
            const activeIdx = toolType === 'highlighter'
                ? (this.plugin.settings.activeHighlighterColorIndex ?? 0)
                : (this.plugin.settings.activePenColorIndex ?? 0);
            palette.colors[activeIdx] = config.color;
            colorIndex = activeIdx;
        }

        // Select the color slot in settings
        if (toolType === 'highlighter') {
            this.plugin.settings.activeHighlighterColorIndex = colorIndex;
            this.plugin.settings.lastHighlighterColorHex = config.color;
        } else {
            this.plugin.settings.activePenColorIndex = colorIndex;
            this.plugin.settings.lastPenColorHex = config.color;
        }

        // Update color on engine
        engine.setPenColor(config.color);

        // Force engine render
        engine.requestFullRender();

        // Save settings to persist active index changes
        this.plugin.saveSettings();

        // Programmatically update indicator states and sliders without triggering change events
        this.toolbar.syncToolState();

        // Hide drawer popover after preset selection
        this.hide();
    }

    private handleSaveCurrent(): void {
        const engine = this.toolbar.focusedEngineRef.get();
        if (!engine) return;

        const toolType = engine.getToolName();
        if (toolType !== 'pen' && toolType !== 'highlighter') {
            new Notice("Please select the Pen or Highlighter tool to save a preset.");
            return;
        }

        const activeProfileId = (engine as any).activeProfileId || '';
        const strokeWidth = engine.getToolSize(toolType) ?? 4;
        const smoothingLevel = toolType === 'pen'
            ? (engine.getPenSmoothing?.() ?? 0.3)
            : (engine.getHighlighterSmoothing?.() ?? 0.55);
        const strokePattern = engine.currentPattern ?? 'solid';

        // Normalize color to #RRGGBBAA format
        const rawColor = (engine as any).toolContext?.currentColor ?? '#000000';
        const parsed = parseColor(rawColor);
        const color = serializeColor(parsed.rgb, parsed.alpha, toolType === 'highlighter');

        const activeProfileIdSetting = this.plugin.settings.activePencilCaseProfileId;
        const profile = this.plugin.settings.pencilCaseProfiles.find(
            (p: any) => p.id === activeProfileIdSetting
        );

        if (!profile) {
            new Notice("No active pencil case profile found.");
            return;
        }

        if (profile.configs.length >= 6) {
            new Notice("Pencil case is full (maximum 6 presets per profile).");
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

            // Refresh settings tab if open
            if (this.plugin.settingTab) {
                this.plugin.settingTab.display();
            }
        });
        modal.open();
    }
}
