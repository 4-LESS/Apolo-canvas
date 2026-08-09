import { App, PluginSettingTab, Setting, setIcon } from 'obsidian';
import type InkPlugin from './InkPlugin';
import { BackgroundType } from '../model/InkPage';
import { getThemeAccentHex } from '../utils/color';
import { StrokePattern } from '../model/ElementStyle';

export interface InkPalette {
    id: string;
    name: string;
    colors: string[];
}

export interface SavedToolConfig {
    id: string;
    name: string;
    toolType: 'pen' | 'highlighter';
    profileId: string;
    strokeWidth: number;
    smoothingLevel: number;
    strokePattern: StrokePattern;
    color: string;
}

export interface PencilCaseProfile {
    id: string;
    name: string;
    configs: SavedToolConfig[];
}

export interface ApoloCanvasSettings {
    // Legacy settings
    defaultPagePreset: string;
    defaultPenColor: string;
    defaultPenSize: number;
    autoSaveDebounceMs: number;
    migrationComplete: boolean;
    defaultBlockHeight: number; // legacy fallback

    // v0.3.6.6 settings
    defaultHeight: number;
    defaultBackground: string;
    defaultGridSize: number;
    themeMode: string;

    // Hyperlinks settings
    linkBackgroundColor: string;
    linkRenderColor: string;
    linkPadding: number;
    linkBorderRadius: number;
    linkHighlightColorMode: 'theme' | 'custom';
    linkCustomBackgroundColor: string;
    linkBackgroundOpacity: number;
    penSmoothing: number;
    highlighterSmoothing: number;
    savedSwatches: string[];
    recentColors: string[];

    // Swatch Sub-Managers
    penPalettes: InkPalette[];
    highlighterPalettes: InkPalette[];
    shapePalettes: InkPalette[];
    activePenPaletteId: string;
    activeHighlighterPaletteId: string;
    activeShapePaletteId: string;
    activePenColorIndex: number;
    activeHighlighterColorIndex: number;
    activeShapeColorIndex: number;
    lastPenColorHex: string;
    lastHighlighterColorHex: string;
    lastShapeColorHex: string;
    activePenProfileId: string | null;
    activeHighlighterProfileId: string | null;
    highlighterLinearModifier: boolean;
    enablePencilCase: boolean;
    pencilCaseOrientation: 'horizontal' | 'vertical';
    pencilCaseProfiles: PencilCaseProfile[];
    activePencilCaseProfileId: string;
}

export const DEFAULT_SETTINGS: ApoloCanvasSettings = {
    defaultPagePreset: 'A4',
    defaultPenColor: '#1a1a2e',
    defaultPenSize: 4,
    autoSaveDebounceMs: 2000,
    migrationComplete: false,
    defaultBlockHeight: 600, // legacy fallback

    defaultHeight: 400,
    defaultBackground: 'grid',
    defaultGridSize: 20,
    themeMode: 'auto',

    linkBackgroundColor: 'rgba(var(--interactive-accent-rgb), 0.25)',
    linkRenderColor: '#ffffff',
    linkPadding: 8,
    linkBorderRadius: 8,
    linkHighlightColorMode: 'theme',
    linkCustomBackgroundColor: '#735ced',
    linkBackgroundOpacity: 0.25,
    penSmoothing: 0.3,
    highlighterSmoothing: 0.55,
    savedSwatches: ['', '', '', '', ''],
    recentColors: [],

    penPalettes: [
        { id: 'classic', name: 'Classic', colors: ['#000000', '#ff0000', '#0000ff', '#00ff00'] },
        { id: 'pastel', name: 'Pastel', colors: ['#ff7675', '#fdcb6e', '#00bec4', '#a29bfe'] },
        { id: 'retro', name: 'Retro', colors: ['#2d3436', '#d63031', '#0984e3', '#00b894'] }
    ],
    highlighterPalettes: [
        { id: 'classic', name: 'Classic', colors: ['#ffff0080', '#00ff0080', '#ff00ff80', '#00ffff80'] },
        { id: 'pastel', name: 'Pastel', colors: ['#ff767580', '#fdcb6e80', '#00bec480', '#a29bfe80'] },
        { id: 'retro', name: 'Retro', colors: ['#2d343680', '#d6303180', '#0984e380', '#00b89480'] }
    ],
    shapePalettes: [
        { id: 'classic', name: 'Classic', colors: ['#000000', '#ff0000', '#0000ff', '#00ff00'] },
        { id: 'pastel', name: 'Pastel', colors: ['#ff7675', '#fdcb6e', '#00bec4', '#a29bfe'] },
        { id: 'retro', name: 'Retro', colors: ['#2d3436', '#d63031', '#0984e3', '#00b894'] }
    ],
    activePenPaletteId: 'classic',
    activeHighlighterPaletteId: 'classic',
    activeShapePaletteId: 'classic',
    activePenColorIndex: 0,
    activeHighlighterColorIndex: 0,
    activeShapeColorIndex: 0,
    lastPenColorHex: '#000000',
    lastHighlighterColorHex: '#ffff0080',
    lastShapeColorHex: '#000000',
    activePenProfileId: null,
    activeHighlighterProfileId: null,
    highlighterLinearModifier: false,
    enablePencilCase: true,
    pencilCaseOrientation: 'horizontal',
    pencilCaseProfiles: [
        {
            id: 'default-case',
            name: 'Default Case',
            configs: [
                {
                    id: 'preset-fine-ballpoint',
                    name: 'Fine Ballpoint',
                    toolType: 'pen',
                    profileId: 'pen-ballpoint',
                    strokeWidth: 2,
                    smoothingLevel: 0.2,
                    strokePattern: 'solid',
                    color: '#1A1A1AFF'
                },
                {
                    id: 'preset-calligraphy-chisel',
                    name: 'Calligraphy Chisel',
                    toolType: 'pen',
                    profileId: 'pen-calligraphy',
                    strokeWidth: 5,
                    smoothingLevel: 0.2,
                    strokePattern: 'solid',
                    color: '#0000FFFF'
                },
                {
                    id: 'preset-highlighter-broad',
                    name: 'Broad Highlighter',
                    toolType: 'highlighter',
                    profileId: 'highlighter-square',
                    strokeWidth: 18,
                    smoothingLevel: 0.35,
                    strokePattern: 'solid',
                    color: '#FFFF0080'
                }
            ]
        }
    ],
    activePencilCaseProfileId: 'default-case'
};

/**
 * Resolves standard user settings string values (like 'lines' or 'dots')
 * to the internal engine keywords (like 'ruled' or 'dotted').
 */
export function mapBackgroundType(bg: string): BackgroundType {
    if (!bg) return 'grid';
    const clean = bg.trim().toLowerCase();
    if (clean === 'lines') return 'ruled';
    if (clean === 'dots') return 'dotted';
    if (clean === 'ruled' || clean === 'dotted' || clean === 'grid' || clean === 'blank') {
        return clean as BackgroundType;
    }
    return 'grid'; // fallback
}

export class ApoloCanvasSettingsTab extends PluginSettingTab {
    constructor(app: App, private plugin: InkPlugin) {
        super(app, plugin);
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Apolo Canvas Settings' });

        // Default Canvas Height
        new Setting(containerEl)
            .setName('Default Canvas Height')
            .setDesc('Height of the ink canvas block in pixels.')
            .addText((text) =>
                text
                    .setPlaceholder('400')
                    .setValue(String(this.plugin.settings.defaultHeight))
                    .onChange(async (value) => {
                        const parsed = parseInt(value, 10);
                        if (!isNaN(parsed)) {
                            this.plugin.settings.defaultHeight = parsed;
                            await this.plugin.saveSettings();
                        }
                    })
            );

        // Default Background
        new Setting(containerEl)
            .setName('Default Background')
            .setDesc('Default background pattern for new ink pages.')
            .addDropdown((dropdown) =>
                dropdown
                    .addOption('grid', 'Grid')
                    .addOption('ruled', 'Lines')
                    .addOption('dotted', 'Dots')
                    .addOption('blank', 'Blank')
                    .setValue(this.plugin.settings.defaultBackground)
                    .onChange(async (value) => {
                        this.plugin.settings.defaultBackground = value;
                        await this.plugin.saveSettings();
                    })
            );

        // Default Grid Size
        new Setting(containerEl)
            .setName('Default Grid Size')
            .setDesc('Default grid spacing in pixels (10-150).')
            .addText((text) =>
                text
                    .setPlaceholder('20')
                    .setValue(String(this.plugin.settings.defaultGridSize))
                    .onChange(async (value) => {
                        const parsed = parseInt(value, 10);
                        if (!isNaN(parsed)) {
                            this.plugin.settings.defaultGridSize = parsed;
                            await this.plugin.saveSettings();
                        }
                    })
            );

        // Canvas Theme
        new Setting(containerEl)
            .setName('Canvas Theme')
            .setDesc('Theme for the ink canvas rendering (Auto, Light, Dark, Custom).')
            .addDropdown((dropdown) =>
                dropdown
                    .addOption('auto', 'Auto')
                    .addOption('light', 'Light')
                    .addOption('dark', 'Dark')
                    .addOption('custom', 'Custom')
                    .setValue(this.plugin.settings.themeMode)
                    .onChange(async (value) => {
                        this.plugin.settings.themeMode = value;
                        await this.plugin.saveSettings();
                    })
            );

        containerEl.createEl('h3', { text: 'Drawing Quality' });

        new Setting(containerEl)
            .setName('Pen Smoothing')
            .setDesc('Governs the streamline configuration of freehand pen strokes (0.0 to 1.0).')
            .addSlider((slider) =>
                slider
                    .setLimits(0.0, 1.0, 0.05)
                    .setValue(this.plugin.settings.penSmoothing ?? 0.3)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.penSmoothing = value;
                        await this.plugin.saveSettings();
                        if (this.plugin.activeEngines) {
                            for (const engine of this.plugin.activeEngines) {
                                engine.setSmoothingLevels(value, this.plugin.settings.highlighterSmoothing ?? 0.55);
                            }
                        }
                    })
            );

        new Setting(containerEl)
            .setName('Highlighter Smoothing')
            .setDesc('Governs the streamline configuration of freehand highlighter strokes (0.0 to 1.0).')
            .addSlider((slider) =>
                slider
                    .setLimits(0.0, 1.0, 0.05)
                    .setValue(this.plugin.settings.highlighterSmoothing ?? 0.55)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.highlighterSmoothing = value;
                        await this.plugin.saveSettings();
                        if (this.plugin.activeEngines) {
                            for (const engine of this.plugin.activeEngines) {
                                engine.setSmoothingLevels(this.plugin.settings.penSmoothing ?? 0.3, value);
                            }
                        }
                    })
            );

        containerEl.createEl('h3', { text: 'Stroke & Auto-Save Defaults' });

        // Page Preset
        new Setting(containerEl)
            .setName('Default Page Preset')
            .setDesc('Default dimensions preset for new full-page drawings.')
            .addDropdown((drop) =>
                drop
                    .addOption('A4', 'A4 (210×297mm)')
                    .addOption('LETTER', 'Letter (216×279mm)')
                    .addOption('A5', 'A5 (148×210mm)')
                    .setValue(this.plugin.settings.defaultPagePreset)
                    .onChange(async (value) => {
                        this.plugin.settings.defaultPagePreset = value;
                        await this.plugin.saveSettings();
                    })
            );

        // Default Pen Color
        new Setting(containerEl)
            .setName('Default Pen Color')
            .setDesc('Default color of the pen.')
            .addColorPicker((picker) =>
                picker
                    .setValue(this.plugin.settings.defaultPenColor)
                    .onChange(async (value) => {
                        this.plugin.settings.defaultPenColor = value;
                        await this.plugin.saveSettings();
                    })
            );

        // Default Pen Size
        new Setting(containerEl)
            .setName('Default Pen Size')
            .setDesc('Default size of the pen stroke (1-20 px).')
            .addSlider((slider) =>
                slider
                    .setLimits(1, 20, 1)
                    .setValue(this.plugin.settings.defaultPenSize)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.defaultPenSize = value;
                        await this.plugin.saveSettings();
                    })
            );

        // Auto-save debounce ms
        new Setting(containerEl)
            .setName('Auto-Save Interval (ms)')
            .setDesc('Milliseconds of idle time before auto-saving active drawings (500-10000).')
            .addSlider((slider) =>
                slider
                    .setLimits(500, 10000, 500)
                    .setValue(this.plugin.settings.autoSaveDebounceMs)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.autoSaveDebounceMs = value;
                        await this.plugin.saveSettings();
                    })
            );

        containerEl.createEl('h3', { text: 'Hyperlinks' });

        // Link Highlight Color
        new Setting(containerEl)
            .setName('Link Highlight Color')
            .setDesc('Color of the link highlight background block. Click the back arrow to reset to the default theme accent color.')
            .addExtraButton((button) => {
                button
                    .setIcon('undo-2')
                    .setTooltip('Reset to default theme color')
                    .onClick(async () => {
                        this.plugin.settings.linkHighlightColorMode = 'theme';
                        this.plugin.settings.linkCustomBackgroundColor = '#735ced';
                        await this.plugin.saveSettings();
                        this.display();
                    });
                
                if (this.plugin.settings.linkHighlightColorMode !== 'custom') {
                    button.setDisabled(true);
                    button.extraSettingsEl.style.display = 'none';
                }
            })
            .addColorPicker((picker) => {
                let currentColor = this.plugin.settings.linkCustomBackgroundColor;
                if (this.plugin.settings.linkHighlightColorMode === 'theme') {
                    currentColor = getThemeAccentHex();
                }

                picker
                    .setValue(currentColor)
                    .onChange(async (value) => {
                        this.plugin.settings.linkHighlightColorMode = 'custom';
                        this.plugin.settings.linkCustomBackgroundColor = value;
                        await this.plugin.saveSettings();
                        this.display();
                    });
            });

        // Link Background Opacity
        new Setting(containerEl)
            .setName('Link Highlight Opacity')
            .setDesc('Opacity of the link highlight background block (0% - 100%).')
            .addSlider((slider) => {
                slider
                    .setLimits(0, 100, 5)
                    .setValue(Math.round((this.plugin.settings.linkBackgroundOpacity ?? 0.25) * 100))
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.linkBackgroundOpacity = value / 100;
                        await this.plugin.saveSettings();
                    });
            });


        // Link Stroke Color mode
        const renderColorSetting = new Setting(containerEl)
            .setName('Link Stroke Color Mode')
            .setDesc('Choose whether to keep original element color or override it for linked elements.');

        renderColorSetting.addDropdown((dropdown) => {
            const isOriginal = this.plugin.settings.linkRenderColor === 'original';
            dropdown
                .addOption('original', 'Keep Original Color')
                .addOption('override', 'Override Color')
                .setValue(isOriginal ? 'original' : 'override')
                .onChange(async (value) => {
                    if (value === 'original') {
                        this.plugin.settings.linkRenderColor = 'original';
                    } else {
                        this.plugin.settings.linkRenderColor = '#ffffff';
                    }
                    await this.plugin.saveSettings();
                    this.display(); // Refresh tab to show/hide color picker
                });
        });

        // Link Override Stroke Color (visible only in override mode)
        if (this.plugin.settings.linkRenderColor !== 'original') {
            new Setting(containerEl)
                .setName('Link Override Stroke Color')
                .setDesc('Custom stroke color for linked elements (e.g. #ffffff).')
                .addColorPicker((picker) => {
                    picker
                        .setValue(this.plugin.settings.linkRenderColor)
                        .onChange(async (value) => {
                            this.plugin.settings.linkRenderColor = value || '#ffffff';
                            await this.plugin.saveSettings();
                        });
                });
        }

        // Link Padding
        new Setting(containerEl)
            .setName('Link Padding (px)')
            .setDesc('How much larger the clickable highlight box is compared to the element.')
            .addText((text) =>
                text
                    .setPlaceholder('8')
                    .setValue(String(this.plugin.settings.linkPadding ?? 8))
                    .onChange(async (value) => {
                        const parsed = parseInt(value, 10);
                        if (!isNaN(parsed) && parsed >= 0) {
                            this.plugin.settings.linkPadding = parsed;
                            await this.plugin.saveSettings();
                        }
                    })
            );

        // Link Corner Radius
        new Setting(containerEl)
            .setName('Link Corner Radius (px)')
            .setDesc('Corner roundness of the link highlight box.')
            .addText((text) =>
                text
                    .setPlaceholder('8')
                    .setValue(String(this.plugin.settings.linkBorderRadius ?? 8))
                    .onChange(async (value) => {
                        const parsed = parseInt(value, 10);
                        if (!isNaN(parsed) && parsed >= 0) {
                            this.plugin.settings.linkBorderRadius = parsed;
                            await this.plugin.saveSettings();
                        }
                    })
            );

        // Pencil Cases Section
        containerEl.createEl('h3', { text: 'Pencil Cases' });

        new Setting(containerEl)
            .setName('Enable Pencil Case System')
            .setDesc('Toggle the floating custom preset pencil case drawer on active canvases.')
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.enablePencilCase ?? true)
                    .onChange(async (value) => {
                        this.plugin.settings.enablePencilCase = value;
                        await this.plugin.saveSettings();
                        this.display(); // Redraw settings panel to show/hide sub-elements
                        this.plugin.globalToolbar?.updatePencilCaseMount(this.plugin.focusedEngineRef.get());
                    });
            });

        if (this.plugin.settings.enablePencilCase ?? true) {
            // Pencil Case Orientation
            new Setting(containerEl)
                .setName('Pencil Case Orientation')
                .setDesc('Choose whether the floating Pencil Case bar displays horizontally or vertically.')
                .addDropdown((dropdown) => {
                    dropdown.addOption('horizontal', 'Horizontal');
                    dropdown.addOption('vertical', 'Vertical');
                    dropdown.setValue(this.plugin.settings.pencilCaseOrientation || 'horizontal');
                    dropdown.onChange(async (value) => {
                        if (value !== 'horizontal' && value !== 'vertical') return;
                        this.plugin.settings.pencilCaseOrientation = value;
                        await this.plugin.saveSettings();
                        this.plugin.globalToolbar?.pencilCaseBar?.syncValues();
                    });
                });
            // Profile Switcher
            const switcherSetting = new Setting(containerEl)
                .setName('Active Pencil Case Profile')
                .setDesc('Select the active Pencil Case profile to use and edit.');

            switcherSetting.addDropdown((dropdown) => {
                this.plugin.settings.pencilCaseProfiles.forEach((profile) => {
                    dropdown.addOption(profile.id, profile.name);
                });
                dropdown.setValue(this.plugin.settings.activePencilCaseProfileId);
                dropdown.onChange(async (value) => {
                    this.plugin.settings.activePencilCaseProfileId = value;
                    await this.plugin.saveSettings();
                    this.display();
                    this.plugin.globalToolbar?.pencilCaseDrawer?.syncValues();
                });
            });

            const activeProfileId = this.plugin.settings.activePencilCaseProfileId;
            const activeProfile = this.plugin.settings.pencilCaseProfiles.find(p => p.id === activeProfileId);

            if (activeProfile) {
                // Rename Profile
                new Setting(containerEl)
                    .setName('Rename Case Profile')
                    .setDesc('Customize the name of the currently active Pencil Case.')
                    .addText((text) => {
                        text.setValue(activeProfile.name)
                            .onChange(async (value) => {
                                activeProfile.name = value.trim() || 'Unnamed Case';
                                await this.plugin.saveSettings();
                                // We don't call this.display() here to avoid focus stealing, but we update dropdown options
                                const selectEl = switcherSetting.controlEl.querySelector('select') as HTMLSelectElement;
                                if (selectEl) {
                                    const opt = selectEl.querySelector(`option[value="${activeProfile.id}"]`);
                                    if (opt) opt.textContent = activeProfile.name;
                                }
                                this.plugin.globalToolbar?.pencilCaseDrawer?.syncValues();
                            });
                    });

                // Profile Editor Table (matrix of presets)
                const editorHeader = containerEl.createDiv({ cls: 'ink-pencil-case-editor-header' });
                editorHeader.createEl('h4', { text: `Edit Presets for "${activeProfile.name}"` });

                const editorEl = containerEl.createDiv({ cls: 'ink-pencil-case-editor' });
                if (activeProfile.configs.length === 0) {
                    editorEl.createEl('div', { text: 'No presets in this profile yet. Create some from the canvas Pencil Case drawer!', cls: 'ink-pencil-case-empty-editor' });
                } else {
                    activeProfile.configs.forEach((config) => {
                        const rowEl = editorEl.createDiv({ cls: 'ink-pencil-case-row' });
                        
                        // Icon matching strategy
                        const swatch = rowEl.createDiv({ cls: 'ink-pencil-case-swatch-box' });
                        swatch.style.backgroundColor = config.color;

                        // Text input for name
                        const textInput = rowEl.createEl('input', {
                            cls: 'ink-pencil-case-name-input',
                            attr: { type: 'text', value: config.name }
                        }) as HTMLInputElement;
                        textInput.addEventListener('change', async () => {
                            config.name = textInput.value.trim() || 'My Preset';
                            await this.plugin.saveSettings();
                            this.plugin.globalToolbar?.pencilCaseDrawer?.syncValues();
                        });

                        // Delete button
                        const trashBtn = rowEl.createEl('button', {
                            cls: 'ink-pencil-case-trash-btn',
                            attr: { 'aria-label': 'Delete Preset' }
                        });
                        setIcon(trashBtn, 'trash-2');
                        trashBtn.addEventListener('click', async (e) => {
                            e.preventDefault();
                            activeProfile.configs = activeProfile.configs.filter(c => c.id !== config.id);
                            await this.plugin.saveSettings();
                            this.display();
                            this.plugin.globalToolbar?.pencilCaseDrawer?.syncValues();
                        });
                    });
                }

                // Add New Pencil Case Profile
                const actionRow = new Setting(containerEl);
                actionRow.addButton((btn) => {
                    btn.setButtonText('+ Add New Pencil Case Row')
                        .setCta()
                        .onClick(async () => {
                            const newProfileId = `profile-${Date.now()}`;
                            const newProfile: PencilCaseProfile = {
                                id: newProfileId,
                                name: `New Pencil Case`,
                                configs: []
                            };
                            this.plugin.settings.pencilCaseProfiles.push(newProfile);
                            this.plugin.settings.activePencilCaseProfileId = newProfileId;
                            await this.plugin.saveSettings();
                            this.display();
                            this.plugin.globalToolbar?.updatePencilCaseMount(this.plugin.focusedEngineRef.get());
                        });
                });

                // Delete active profile (if more than 1 exists)
                if (this.plugin.settings.pencilCaseProfiles.length > 1) {
                    actionRow.addButton((btn) => {
                        btn.setButtonText('Delete Selected Case')
                            .setWarning()
                            .onClick(async () => {
                                this.plugin.settings.pencilCaseProfiles = this.plugin.settings.pencilCaseProfiles.filter(p => p.id !== activeProfileId);
                                this.plugin.settings.activePencilCaseProfileId = this.plugin.settings.pencilCaseProfiles[0].id;
                                await this.plugin.saveSettings();
                                this.display();
                                this.plugin.globalToolbar?.updatePencilCaseMount(this.plugin.focusedEngineRef.get());
                            });
                    });
                }
            }
        }
    }

    hide(): void {
        super.hide();
        this.plugin.globalToolbar?.updatePencilCaseMount(this.plugin.focusedEngineRef.get());
    }
}
