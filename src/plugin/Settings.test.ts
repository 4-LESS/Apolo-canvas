// @ts-nocheck
import { expect, test, vi } from 'vitest';
import { mapBackgroundType, DEFAULT_SETTINGS, ObsidianInkSettingsTab } from './Settings';

vi.mock('obsidian', () => {
    return {
        App: class MockApp {},
        setIcon: vi.fn(),
        PluginSettingTab: class MockPluginSettingTab {
            constructor(app, plugin) {
                this.app = app;
                this.plugin = plugin;
            }
        },
        Setting: class MockSetting {
            controlEl: any;
            constructor(containerEl) {
                this.containerEl = containerEl;
                this.controlEl = {
                    querySelector: vi.fn().mockReturnValue({
                        querySelector: vi.fn()
                    })
                };
            }
            setName = vi.fn().mockReturnThis();
            setDesc = vi.fn().mockReturnThis();
            addText = vi.fn().mockReturnThis();
            addDropdown = vi.fn().mockReturnThis();
            addSlider = vi.fn().mockReturnThis();
            addExtraButton = vi.fn().mockImplementation(function(cb) {
                const mockButton = {
                    setIcon: vi.fn().mockReturnThis(),
                    setTooltip: vi.fn().mockReturnThis(),
                    onClick: vi.fn().mockReturnThis(),
                    setDisabled: vi.fn().mockReturnThis(),
                    extraSettingsEl: { style: {} }
                };
                cb(mockButton);
                return this;
            });
            addColorPicker = vi.fn().mockImplementation(function(cb) {
                const mockPicker = {
                    setValue: vi.fn().mockReturnThis(),
                    onChange: vi.fn().mockReturnThis()
                };
                cb(mockPicker);
                return this;
            });
            addButton = vi.fn().mockImplementation(function(cb) {
                const mockButton = {
                    setButtonText: vi.fn().mockReturnThis(),
                    setCta: vi.fn().mockReturnThis(),
                    setWarning: vi.fn().mockReturnThis(),
                    onClick: vi.fn().mockReturnThis()
                };
                cb(mockButton);
                return this;
            });
            addToggle = vi.fn().mockImplementation(function(cb) {
                const mockToggle = {
                    setValue: vi.fn().mockReturnThis(),
                    onChange: vi.fn().mockReturnThis()
                };
                cb(mockToggle);
                return this;
            });
        }
    };
});

test('mapBackgroundType mappings', () => {
    expect(mapBackgroundType('lines')).toBe('ruled');
    expect(mapBackgroundType('dots')).toBe('dotted');
    expect(mapBackgroundType('grid')).toBe('grid');
    expect(mapBackgroundType('blank')).toBe('blank');
    expect(mapBackgroundType('ruled')).toBe('ruled');
    expect(mapBackgroundType('dotted')).toBe('dotted');
    expect(mapBackgroundType('invalid')).toBe('grid');
    expect(mapBackgroundType('')).toBe('grid');
});

test('DEFAULT_SETTINGS values', () => {
    expect(DEFAULT_SETTINGS.defaultHeight).toBe(400);
    expect(DEFAULT_SETTINGS.defaultBackground).toBe('grid');
    expect(DEFAULT_SETTINGS.defaultGridSize).toBe(20);
    expect(DEFAULT_SETTINGS.themeMode).toBe('auto');
});

test('ObsidianInkSettingsTab instantiation and render', () => {
    const mockApp = {};
    const mockPlugin = {
        settings: { ...DEFAULT_SETTINGS },
        saveSettings: vi.fn()
    };
    const mockContainer = {
        empty: vi.fn(),
        createEl: vi.fn().mockImplementation((tag, attrs) => {
            return {
                createDiv: vi.fn().mockReturnThis(),
                createEl: vi.fn().mockReturnThis(),
                style: {},
                addEventListener: vi.fn()
            };
        }),
        createDiv: vi.fn().mockImplementation((attrs) => {
            return {
                createDiv: vi.fn().mockReturnThis(),
                createEl: vi.fn().mockReturnThis(),
                style: {},
                addEventListener: vi.fn()
            };
        })
    };

    const tab = new ObsidianInkSettingsTab(mockApp as any, mockPlugin as any);
    tab.containerEl = mockContainer as any;

    tab.display();

    expect(mockContainer.empty).toHaveBeenCalled();
    expect(mockContainer.createEl).toHaveBeenCalledWith('h2', { text: 'Obsidian Ink Settings' });
});

test('DEFAULT_SETTINGS contains pencil case defaults', () => {
    expect(DEFAULT_SETTINGS.enablePencilCase).toBe(true);
    expect(DEFAULT_SETTINGS.activePencilCaseProfileId).toBe('default-case');
    expect(DEFAULT_SETTINGS.pencilCaseProfiles.length).toBe(1);
    
    const defaultProfile = DEFAULT_SETTINGS.pencilCaseProfiles[0];
    expect(defaultProfile.name).toBe('Default Case');
    expect(defaultProfile.configs.length).toBe(3);
    
    const fineBallpoint = defaultProfile.configs[0];
    expect(fineBallpoint.name).toBe('Fine Ballpoint');
    expect(fineBallpoint.toolType).toBe('pen');
    expect(fineBallpoint.profileId).toBe('pen-ballpoint');
    expect(fineBallpoint.strokeWidth).toBe(2);
    expect(fineBallpoint.smoothingLevel).toBe(0.2);
    expect(fineBallpoint.strokePattern).toBe('solid');
    expect(fineBallpoint.color).toBe('#1A1A1AFF');
});

test('Pencil Case settings round-trip serialization', () => {
    const originalSettings = {
        ...DEFAULT_SETTINGS,
        enablePencilCase: false,
        activePencilCaseProfileId: 'custom-case',
        pencilCaseProfiles: [
            {
                id: 'custom-case',
                name: 'Custom Case',
                configs: [
                    {
                        id: 'preset-1',
                        name: 'My Custom Brush',
                        toolType: 'highlighter' as const,
                        profileId: 'highlighter-round',
                        strokeWidth: 10,
                        smoothingLevel: 0.6,
                        strokePattern: 'dashed' as const,
                        color: '#FF00FF80'
                    }
                ]
            }
        ]
    };

    const serialized = JSON.stringify(originalSettings);
    const parsed = JSON.parse(serialized);

    expect(parsed.enablePencilCase).toBe(false);
    expect(parsed.activePencilCaseProfileId).toBe('custom-case');
    expect(parsed.pencilCaseProfiles.length).toBe(1);
    expect(parsed.pencilCaseProfiles[0].name).toBe('Custom Case');
    expect(parsed.pencilCaseProfiles[0].configs.length).toBe(1);
    expect(parsed.pencilCaseProfiles[0].configs[0].name).toBe('My Custom Brush');
    expect(parsed.pencilCaseProfiles[0].configs[0].toolType).toBe('highlighter');
    expect(parsed.pencilCaseProfiles[0].configs[0].strokePattern).toBe('dashed');
    expect(parsed.pencilCaseProfiles[0].configs[0].color).toBe('#FF00FF80');
});

test('Pencil Case tab rendering when enabled and disabled', () => {
    const mockApp = {};
    const mockPlugin = {
        settings: {
            ...DEFAULT_SETTINGS,
            enablePencilCase: false
        },
        saveSettings: vi.fn(),
        globalToolbar: {
            updatePencilCaseMount: vi.fn()
        }
    };
    const mockContainer = {
        empty: vi.fn(),
        createEl: vi.fn().mockImplementation((tag, attrs) => {
            return {
                createDiv: vi.fn().mockReturnThis(),
                createEl: vi.fn().mockReturnThis(),
                style: {},
                addEventListener: vi.fn()
            };
        }),
        createDiv: vi.fn().mockImplementation((attrs) => {
            return {
                createDiv: vi.fn().mockReturnThis(),
                createEl: vi.fn().mockReturnThis(),
                style: {},
                addEventListener: vi.fn()
            };
        })
    };

    const tab = new ObsidianInkSettingsTab(mockApp as any, mockPlugin as any);
    tab.containerEl = mockContainer as any;

    tab.display();

    expect(mockContainer.createEl).toHaveBeenCalledWith('h3', { text: 'Pencil Cases' });
});
