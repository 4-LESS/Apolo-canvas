// @ts-nocheck
import { expect, test, vi } from 'vitest';

vi.mock('obsidian', () => {
    return {
        App: class MockApp {},
        MarkdownView: class MockMarkdownView {},
        Modal: class MockModal {
            constructor(app) {
                this.app = app;
                this.contentEl = {
                    empty: vi.fn(),
                    createDiv: vi.fn((attrs) => {
                        const div = {
                            classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
                            createEl: vi.fn((tag, a) => {
                                return {
                                    addEventListener: vi.fn(),
                                    classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
                                    setAttribute: vi.fn(),
                                    style: {},
                                    createDiv: vi.fn(() => ({ style: {}, addEventListener: vi.fn() }))
                                };
                            }),
                            createDiv: vi.fn((a) => {
                                return {
                                    addEventListener: vi.fn(),
                                    classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
                                    setAttribute: vi.fn(),
                                    style: {},
                                    empty: vi.fn(),
                                    createEl: vi.fn((tag, b) => ({
                                        addEventListener: vi.fn(),
                                        classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
                                        style: {}
                                    })),
                                    createDiv: vi.fn((b) => ({
                                        style: {},
                                        addEventListener: vi.fn(),
                                        classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
                                        setAttribute: vi.fn()
                                    }))
                                };
                            }),
                            addEventListener: vi.fn(),
                            setAttribute: vi.fn(),
                            style: {}
                        };
                        return div;
                    }),
                    createEl: vi.fn((tag, attrs) => {
                        return {
                            addEventListener: vi.fn(),
                            classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
                            setAttribute: vi.fn(),
                            style: {}
                        };
                    })
                };
                this.titleEl = { textContent: '' };
            }
            open() {}
            close() {}
        },
        setIcon: vi.fn()
    };
});

import { Toolbar } from './Toolbar';
import { FocusedEngineRef } from '../engine/FocusedEngineRef';
import { setIcon } from 'obsidian';

// Self-contained DOM element mock for testing in Node.js
class MockElement {
    className: string = '';
    classList = {
        add: vi.fn((cls) => {
            if (cls) {
                cls.split(/\s+/).forEach(c => {
                    if (c) this.classes.add(c);
                });
            }
            this.className = Array.from(this.classes).join(' ');
        }),
        remove: vi.fn((cls) => {
            if (cls) {
                cls.split(/\s+/).forEach(c => {
                    this.classes.delete(c);
                });
            }
            this.className = Array.from(this.classes).join(' ');
        }),
        toggle: vi.fn((cls, force?: boolean) => {
            const enabled = force ?? !this.classes.has(cls);
            if (enabled) this.classes.add(cls);
            else this.classes.delete(cls);
            this.className = Array.from(this.classes).join(' ');
            return enabled;
        })
    };
    classes = new Set<string>();
    attributes = new Map<string, string>();
    listeners = new Map<string, Function[]>();
    disabled = false;
    children: MockElement[] = [];
    style: Record<string, string> = {};
    innerHTML = '';
    textContent = '';

    constructor(public tagName: string) {}

    addClass(cls: string) {
        this.classList.add(cls);
    }

    removeClass(cls: string) {
        this.classList.remove(cls);
    }

    hasClass(cls: string): boolean {
        return this.classes.has(cls);
    }

    createDiv(attrs?: { cls?: string }) {
        const div = new MockElement('div');
        if (attrs?.cls) {
            div.addClass(attrs.cls);
        }
        this.children.push(div);
        return div;
    }

    createEl(tag: string, attrs?: { cls?: string; attr?: Record<string, string>; text?: string }) {
        const el = new MockElement(tag);
        if (attrs?.cls) {
            el.addClass(attrs.cls);
        }
        if (attrs?.text) {
            el.textContent = attrs.text;
        }
        if (attrs?.attr) {
            for (const [key, val] of Object.entries(attrs.attr)) {
                el.attributes.set(key, val);
            }
        }
        this.children.push(el);
        return el;
    }

    createSpan(attrs?: { cls?: string }) {
        const span = new MockElement('span');
        if (attrs?.cls) {
            span.addClass(attrs.cls);
        }
        this.children.push(span);
        return span;
    }

    addEventListener(event: string, cb: Function) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(cb);
    }

    trigger(event: string, ...args: any[]) {
        const handlers = this.listeners.get(event) || [];
        for (const handler of handlers) {
            handler(...args);
        }
    }

    empty() {
        this.children = [];
    }

    querySelectorAll(selector: string) {
        // Simple mock selector query
        if (selector.startsWith('.')) {
            const cls = selector.substring(1);
            return this.children.filter(child => child.hasClass(cls));
        }
        return this.children;
    }
}

class MockInkEngine {
    private toolName = 'pen';
    private toolSwitchCallbacks: Function[] = [];
    private elementsUpdatedCallbacks: Function[] = [];
    private recentColorsCallbacks: Function[] = [];
    private snapToGrid = false;
    private penColor = '#1a1a1a';
    private toolSizes = new Map<string, number>([
        ['pen', 3],
        ['highlighter', 16],
        ['shape', 3]
    ]);
    currentPattern = 'solid';
    currentFillColor = 'transparent';
    activeProfileId = 'pen-rounded';
    private penSmoothing = 0.3;
    private highlighterSmoothing = 0.55;
    private activeShapeId = 'line';

    get toolContext() {
        const self = this;
        return {
            get currentColor() { return self.penColor; }
        };
    }

    onToolSwitch = vi.fn().mockImplementation((cb) => {
        this.toolSwitchCallbacks.push(cb);
    });

    offToolSwitch = vi.fn().mockImplementation((cb) => {
        this.toolSwitchCallbacks = this.toolSwitchCallbacks.filter(c => c !== cb);
    });

    onElementsUpdated = vi.fn().mockImplementation((cb) => {
        this.elementsUpdatedCallbacks.push(cb);
    });

    offElementsUpdated = vi.fn().mockImplementation((cb) => {
        this.elementsUpdatedCallbacks = this.elementsUpdatedCallbacks.filter(c => c !== cb);
    });

    onRecentColorsChange = vi.fn().mockImplementation((cb) => {
        this.recentColorsCallbacks.push(cb);
    });

    offRecentColorsChange = vi.fn().mockImplementation((cb) => {
        this.recentColorsCallbacks = this.recentColorsCallbacks.filter(c => c !== cb);
    });

    getToolName() {
        return this.toolName;
    }

    setTool(name: string) {
        this.toolName = name;
        this.toolSwitchCallbacks.forEach(cb => cb(name));
    }

    undo = vi.fn();
    redo = vi.fn();
    canUndo = vi.fn().mockReturnValue(true);
    canRedo = vi.fn().mockReturnValue(false);

    getSnapToGrid() {
        return this.snapToGrid;
    }

    setSnapToGrid(val: boolean) {
        this.snapToGrid = val;
    }

    getToolSize(name: string) {
        return this.toolSizes.get(name) ?? 3;
    }

    setToolSize(name: string, size: number) {
        this.toolSizes.set(name, size);
    }

    getPenSmoothing() {
        return this.penSmoothing;
    }

    setPenSmoothing(value: number) {
        this.penSmoothing = value;
    }

    getHighlighterSmoothing() {
        return this.highlighterSmoothing;
    }

    setHighlighterSmoothing(value: number) {
        this.highlighterSmoothing = value;
    }

    getTool(name: string) {
        if (name === 'shape') {
            return {
                getActiveShapeId: () => this.activeShapeId,
                setActiveShape: (id: string) => { this.activeShapeId = id; }
            };
        }
        if (name === 'eraser') return { eraseMode: 'segment' };
        return undefined;
    }

    setPenColor(color: string) {
        this.penColor = color;
    }

    triggerElementsUpdated() {
        this.elementsUpdatedCallbacks.forEach(cb => cb([]));
    }

    triggerRecentColorsChange(color: string) {
        this.recentColorsCallbacks.forEach(cb => cb(color));
    }

    requestFullRender = vi.fn();
}

function createMockPlugin() {
    return {
        app: {
            workspace: {
                activeLeaf: { view: { getViewType: () => 'ink-full-view' } },
                getActiveViewOfType: vi.fn().mockReturnValue({ getMode: () => 'source' })
            }
        },
        settings: {
            savedSwatches: ['', '', '', '', ''],
            recentColors: []
        },
        saveSettings: vi.fn().mockResolvedValue(undefined)
    };
}

test('Toolbar populates complete UI structure correctly including style panel', () => {
    const mockPlugin = createMockPlugin();
    const toolbarEl = new MockElement('div');
    const focusedEngineRef = new FocusedEngineRef();

    const toolbar = new Toolbar(toolbarEl as any, focusedEngineRef, mockPlugin);

    // Verify tool pill and buttons
    const pill = toolbarEl.children.find(child => child.hasClass('ink-tool-pill'));
    expect(pill).toBeDefined();

    const buttonTitles = pill!.children
        .filter(child => child.tagName === 'button')
        .map(btn => btn.attributes.get('title'));

    expect(buttonTitles).toContain('Pen (P)');
    expect(buttonTitles).toContain('Highlighter (H)');
    expect(buttonTitles).toContain('Eraser (E)');
    expect(buttonTitles).toContain('Lasso (L)');
    expect(buttonTitles).toContain('Shapes');
    expect(buttonTitles).toContain('Snap to Grid (S)');
    expect(buttonTitles).toContain('Undo (Ctrl+Z)');
    expect(buttonTitles).toContain('Redo (Ctrl+Shift+Z)');

    // Verify style panel structure
    const stylePanel = toolbarEl.children.find(child => child.hasClass('ink-style-panel'));
    expect(stylePanel).toBeDefined();
    expect(stylePanel!.hasClass('is-hidden')).toBe(true); // default hidden until engine focus
});

test('Toolbar remains available as idle while the focused engine changes leaves', () => {
    const mockPlugin = createMockPlugin();
    const toolbarEl = new MockElement('div');
    const focusedEngineRef = new FocusedEngineRef();
    const engine = new MockInkEngine();

    focusedEngineRef.set(engine);
    const toolbar = new Toolbar(toolbarEl as any, focusedEngineRef, mockPlugin);

    focusedEngineRef.set(null);

    expect(toolbarEl.hasClass('is-hidden')).toBe(false);
    expect(toolbarEl.hasClass('is-idle')).toBe(true);
    expect(toolbar.stylePanelEl.hasClass('is-hidden')).toBe(true);
});

test('Toolbar opens compact tool popovers without revealing the legacy style panel', () => {
    const mockPlugin = createMockPlugin();
    const toolbarEl = new MockElement('div');
    const focusedEngineRef = new FocusedEngineRef();
    const engine = new MockInkEngine();

    focusedEngineRef.set(engine);
    const toolbar = new Toolbar(toolbarEl as any, focusedEngineRef, mockPlugin);
    const stylePanel = toolbarEl.children.find(child => child.hasClass('ink-style-panel'));

    // Initially, switch tool to lasso so we can test silent pen selection
    engine.setTool('lasso');
    toolbar.syncToolState();
    expect(stylePanel!.hasClass('is-hidden')).toBe(true);

    // Case 1: Pen tool is active and opened -> its compact popover is shown.
    const penBtn = toolbar.toolButtons.get('pen');
    expect(penBtn).toBeDefined();
    // First click selects the tool silently
    penBtn!.trigger('click');
    expect(stylePanel!.hasClass('is-hidden')).toBe(true);
    // Second click opens the menu
    penBtn!.trigger('click');
    expect(toolbar.penOptionsPopover.isOpen).toBe(true);
    expect(stylePanel!.hasClass('is-hidden')).toBe(true);

    // Case 2: Eraser tool is active -> Style Panel hidden
    const eraserBtn = toolbar.toolButtons.get('eraser');
    expect(eraserBtn).toBeDefined();
    eraserBtn!.trigger('click');
    expect(toolbar.penOptionsPopover.isOpen).toBe(false);
    expect(stylePanel!.hasClass('is-hidden')).toBe(true);

    // Case 3: Lasso tool is active -> Style Panel hidden
    // First reactivate Pen and open its popover
    penBtn!.trigger('click');
    penBtn!.trigger('click');
    expect(toolbar.penOptionsPopover.isOpen).toBe(true);
    
    const lassoBtn = toolbar.toolButtons.get('lasso');
    expect(lassoBtn).toBeDefined();
    lassoBtn!.trigger('click');
    expect(toolbar.penOptionsPopover.isOpen).toBe(false);
    expect(stylePanel!.hasClass('is-hidden')).toBe(true);

    // Case 4: Shape tool is active and opened -> its compact popover is shown.
    const shapeBtn = toolbar.toolButtons.get('shape');
    expect(shapeBtn).toBeDefined();
    // First click selects silently
    shapeBtn!.trigger('click');
    expect(stylePanel!.hasClass('is-hidden')).toBe(true);
    // Second click opens it
    shapeBtn!.trigger('click');
    expect(toolbar.shapeOptionsPopover.isOpen).toBe(true);
    expect(stylePanel!.hasClass('is-hidden')).toBe(true);
});

test('Toolbar style panel controls thickness and pattern updates', () => {
    const mockPlugin = createMockPlugin();
    const toolbarEl = new MockElement('div');
    const focusedEngineRef = new FocusedEngineRef();
    const engine = new MockInkEngine();

    focusedEngineRef.set(engine);
    const toolbar = new Toolbar(toolbarEl as any, focusedEngineRef, mockPlugin);
    
    // Thickness slider interaction
    toolbar.thicknessSlider.value = '10';
    toolbar.thicknessSlider.trigger('input');
    expect(engine.getToolSize('pen')).toBe(10);

    // Pattern picker interaction
    const patternBtn = toolbar.patternButtons.get('dashed');
    expect(patternBtn).toBeDefined();
    patternBtn!.trigger('click', { preventDefault: vi.fn(), stopPropagation: vi.fn() });
    expect(engine.currentPattern).toBe('dashed');
});

test('Toolbar style panel validates hex color inputs', () => {
    const mockPlugin = createMockPlugin();
    const toolbarEl = new MockElement('div');
    const focusedEngineRef = new FocusedEngineRef();
    const engine = new MockInkEngine();

    focusedEngineRef.set(engine);
    const toolbar = new Toolbar(toolbarEl as any, focusedEngineRef, mockPlugin);

    // Invalid Hex input
    toolbar.hexInput.value = 'invalid';
    toolbar.hexInput.trigger('input');
    expect(toolbar.hexInput.hasClass('is-invalid')).toBe(true);

    // Valid Hex input
    toolbar.hexInput.value = 'ff5500';
    toolbar.hexInput.trigger('input');
    expect(toolbar.hexInput.hasClass('is-invalid')).toBe(false);
    expect(engine.toolContext.currentColor).toBe('#ff5500');
});

test('Toolbar style panel handles saved swatches clicks and long-press', () => {
    const mockPlugin = createMockPlugin();
    const toolbarEl = new MockElement('div');
    const focusedEngineRef = new FocusedEngineRef();
    const engine = new MockInkEngine();

    focusedEngineRef.set(engine);
    const toolbar = new Toolbar(toolbarEl as any, focusedEngineRef, mockPlugin);

    // Initial saved swatches are empty
    expect(mockPlugin.settings.savedSwatches).toEqual(['', '', '', '', '']);

    // Trigger long-press on slot 0 to save active color (#1a1a1a)
    vi.useFakeTimers();
    const slot0 = toolbar.savedSwatchesEl.children[0];
    slot0.trigger('pointerdown');
    
    // Fast forward long press threshold
    vi.advanceTimersByTime(600);
    expect(mockPlugin.settings.savedSwatches[0]).toBe('#1a1a1a');
    expect(mockPlugin.saveSettings).toHaveBeenCalled();

    // Reset timers
    vi.useRealTimers();
});

test('Toolbar updates recent colors when triggered strictly via recent colors changed event', () => {
    const mockPlugin = createMockPlugin();
    const toolbarEl = new MockElement('div');
    const focusedEngineRef = new FocusedEngineRef();
    const engine = new MockInkEngine();

    focusedEngineRef.set(engine);
    const toolbar = new Toolbar(toolbarEl as any, focusedEngineRef, mockPlugin);

    expect(mockPlugin.settings.recentColors).toEqual([]);

    // Trigger color change event
    engine.triggerRecentColorsChange('#00ff00');
    
    // Check that recent colors updated
    expect(mockPlugin.settings.recentColors).toEqual(['#00ff00']);
    expect(mockPlugin.saveSettings).toHaveBeenCalled();
});

test('Toolbar color slots render and handle click selection', () => {
    const mockPlugin = createMockPlugin();
    // Add default palettes to mockup settings
    mockPlugin.settings.penPalettes = [
        { id: 'classic', name: 'Classic', colors: ['#000000', '#ff0000', '#0000ff', '#00ff00'] }
    ];
    mockPlugin.settings.activePenPaletteId = 'classic';
    mockPlugin.settings.activePenColorIndex = 0;

    const toolbarEl = new MockElement('div');
    const focusedEngineRef = new FocusedEngineRef();
    const engine = new MockInkEngine();

    focusedEngineRef.set(engine);
    const toolbar = new Toolbar(toolbarEl as any, focusedEngineRef, mockPlugin);

    expect(toolbar.colorSlotBtns.length).toBe(4);
    expect(toolbar.colorSlotBtns[0].style.backgroundColor).toBe('#000000');
    expect(toolbar.colorSlotBtns[1].style.backgroundColor).toBe('#ff0000');

    // Click slot 1
    toolbar.colorSlotBtns[1].trigger('pointerup');
    expect(mockPlugin.settings.activePenColorIndex).toBe(1);
    expect(engine.toolContext.currentColor).toBe('#ff0000');
});

test('Toolbar handles independent Pen and Highlighter sub-manager configurations', () => {
    const mockPlugin = createMockPlugin();
    mockPlugin.settings.penPalettes = [
        { id: 'classic', name: 'Classic', colors: ['#000000', '#ff0000', '#0000ff', '#00ff00'] }
    ];
    mockPlugin.settings.highlighterPalettes = [
        { id: 'classic', name: 'Classic', colors: ['#ffff0080', '#00ff0080', '#ff00ff80', '#00ffff80'] }
    ];
    mockPlugin.settings.activePenPaletteId = 'classic';
    mockPlugin.settings.activeHighlighterPaletteId = 'classic';
    mockPlugin.settings.activePenColorIndex = 0;
    mockPlugin.settings.activeHighlighterColorIndex = 0;

    const toolbarEl = new MockElement('div');
    const focusedEngineRef = new FocusedEngineRef();
    const engine = new MockInkEngine();

    focusedEngineRef.set(engine);
    const toolbar = new Toolbar(toolbarEl as any, focusedEngineRef, mockPlugin);

    // Switch to Pen tool and select index 2
    engine.setTool('pen');
    toolbar.syncToolState();
    toolbar.colorSlotBtns[2].trigger('pointerup');
    expect(mockPlugin.settings.activePenColorIndex).toBe(2);
    expect(mockPlugin.settings.activeHighlighterColorIndex).toBe(0); // isolated, remains unchanged

    // Switch to Highlighter tool and select index 1
    engine.setTool('highlighter');
    toolbar.syncToolState();
    toolbar.colorSlotBtns[1].trigger('pointerup');
    expect(mockPlugin.settings.activePenColorIndex).toBe(2); // remains unchanged
    expect(mockPlugin.settings.activeHighlighterColorIndex).toBe(1);
});

test('Toolbar snap to grid toggle coordinates with engine snaps', () => {
    const mockPlugin = createMockPlugin();
    const toolbarEl = new MockElement('div');
    const focusedEngineRef = new FocusedEngineRef();
    const engine = new MockInkEngine();

    focusedEngineRef.set(engine);
    const toolbar = new Toolbar(toolbarEl as any, focusedEngineRef, mockPlugin);

    expect(engine.getSnapToGrid()).toBe(false);

    // Click snap toggle
    toolbar.snapBtn.trigger('click', { preventDefault: vi.fn(), stopPropagation: vi.fn() });
    expect(engine.getSnapToGrid()).toBe(true);
});

test('Toolbar handles Click & Closure Gating Matrix (Milestone 4.2.3)', () => {
    const mockPlugin = createMockPlugin();
    mockPlugin.settings.penPalettes = [
        { id: 'classic', name: 'Classic', colors: ['#000000', '#ff0000', '#0000ff', '#00ff00'] }
    ];
    mockPlugin.settings.activePenPaletteId = 'classic';
    mockPlugin.settings.activePenColorIndex = 0;

    const toolbarEl = new MockElement('div');
    const focusedEngineRef = new FocusedEngineRef();
    const engine = new MockInkEngine();

    focusedEngineRef.set(engine);
    const toolbar = new Toolbar(toolbarEl as any, focusedEngineRef, mockPlugin);

    // 1. Single Click selects color but does NOT open popover
    toolbar.colorSlotBtns[1].trigger('pointerup');
    expect(mockPlugin.settings.activePenColorIndex).toBe(1);
    expect(toolbar.colorPickerPopoverEl.hasClass('is-hidden')).toBe(true);

    // 2. Clicking the already-active slot opens the HEX/Spectrum Picker popover immediately
    toolbar.colorSlotBtns[1].trigger('pointerup');
    expect(toolbar.colorPickerPopoverEl.hasClass('is-hidden')).toBe(false);
    // Clicking the active slot again toggles it closed
    toolbar.colorSlotBtns[1].trigger('pointerup');
    expect(toolbar.colorPickerPopoverEl.hasClass('is-hidden')).toBe(true);

    // 2b. Different slots reset the cycle and select immediately
    toolbar.colorSlotBtns[3].trigger('pointerup');
    expect(mockPlugin.settings.activePenColorIndex).toBe(3);
    expect(toolbar.colorPickerPopoverEl.hasClass('is-hidden')).toBe(true);

    // Exact same active slot opens the picker on the first tap
    toolbar.colorSlotBtns[3].trigger('pointerup');
    expect(toolbar.colorPickerPopoverEl.hasClass('is-hidden')).toBe(false);
    toolbar.colorPickerPopover.hide();



    // 5. Tool button click and pattern closure
    // Set pattern to dashed
    engine.currentPattern = 'dashed';
    toolbar.patternPopoverEl.removeClass('is-hidden');
    expect(toolbar.patternPopoverEl.hasClass('is-hidden')).toBe(false);

    // Switch to Lasso, expect pattern popover to be hidden
    const lassoBtn = toolbar.toolButtons.get('lasso');
    expect(lassoBtn).toBeDefined();
    lassoBtn!.trigger('click', { preventDefault: vi.fn(), stopPropagation: vi.fn() });
    expect(toolbar.patternPopoverEl.hasClass('is-hidden')).toBe(true);

    // 6. Refined Universal Click Gating: Single Click Tool Switches Silently
    const penBtn = toolbar.toolButtons.get('pen');
    expect(penBtn).toBeDefined();
    // Single click (simulated via click or pointerup)
    penBtn!.trigger('click', { preventDefault: vi.fn(), stopPropagation: vi.fn() });
    expect(engine.getToolName()).toBe('pen');
    expect(toolbar.stylePanelEl.hasClass('is-hidden')).toBe(true); // Must NOT reveal options panel

    // Second click (when tool is already selected) opens the menu
    penBtn!.trigger('click', { preventDefault: vi.fn(), stopPropagation: vi.fn() });
    expect(engine.getToolName()).toBe('pen');
    expect(toolbar.penOptionsPopover.isOpen).toBe(true); // Second click opens the compact popover
    expect(toolbar.stylePanelEl.hasClass('is-hidden')).toBe(true);

    // Third click (when tool is selected and menu is open) hides it
    penBtn!.trigger('click', { preventDefault: vi.fn(), stopPropagation: vi.fn() });
    expect(toolbar.penOptionsPopover.isOpen).toBe(false);

    // 7. Pattern selector triggers on single click with active popover highlight
    expect(toolbar.patternToggleBtn.hasClass('is-active-popover')).toBe(false);
    toolbar.patternToggleBtn.trigger('click', { preventDefault: vi.fn(), stopPropagation: vi.fn() });
    expect(toolbar.patternPopoverEl.hasClass('is-hidden')).toBe(false);
    expect(toolbar.patternToggleBtn.hasClass('is-active-popover')).toBe(true);

    // Single click again closes it and removes highlight
    toolbar.patternToggleBtn.trigger('click', { preventDefault: vi.fn(), stopPropagation: vi.fn() });
    expect(toolbar.patternPopoverEl.hasClass('is-hidden')).toBe(true);
    expect(toolbar.patternToggleBtn.hasClass('is-active-popover')).toBe(false);
});

test('ColorPickerPopover has segments, bidirectional sync, and canvas firewall', () => {
    const mockPlugin = createMockPlugin();
    mockPlugin.settings.recentColors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];
    mockPlugin.settings.penPalettes = [
        { id: 'classic', name: 'Classic', colors: ['#000000', '#00ff00', '#0000ff', '#00ff00'] }
    ];
    mockPlugin.settings.activePenPaletteId = 'classic';
    mockPlugin.settings.activePenColorIndex = 0;

    const toolbarEl = new MockElement('div');
    const focusedEngineRef = new FocusedEngineRef();
    const engine = new MockInkEngine();

    // Mock functions to verify firewall and calls
    engine.requestFullRender = vi.fn();
    engine.setPenColor = vi.fn();

    focusedEngineRef.set(engine);
    const toolbar = new Toolbar(toolbarEl as any, focusedEngineRef, mockPlugin);

    // Open Color Picker Popover via active-slot direct invocation
    toolbar.colorSlotBtns[0].trigger('pointerup');
    const popover = toolbar.colorPickerPopover;
    expect(popover.isOpen).toBe(true);

    // Verify 4 headers exist
    const headers = popover.el.querySelectorAll('.ink-popover-header');
    expect(headers.length).toBe(4);
    expect(headers[0].textContent).toBe('COLOR');
    expect(headers[1].textContent).toBe('OPACITY');
    expect(headers[2].textContent).toBe('SWATCH PALETTE');
    expect(headers[3].textContent).toBe('RECENTLY USED');

    // Verify canvas matrix exists inside its row
    const colorMatrixRow = popover.el.querySelectorAll('.color-matrix-row')[0];
    expect(colorMatrixRow).toBeDefined();
    const canvas = colorMatrixRow.querySelectorAll('.ink-popover-color-matrix')[0];
    expect(canvas).toBeDefined();

    // Verify hue slider exists inside its row
    const hueSliderRow = popover.el.querySelectorAll('.hue-slider-row')[0];
    expect(hueSliderRow).toBeDefined();
    const hueSlider = hueSliderRow.querySelectorAll('.ink-popover-hue-slider')[0];
    expect(hueSlider).toBeDefined();

    // Verify live color value display and format toggle
    const valueRow = popover.el.querySelectorAll('.color-value-row')[0];
    expect(valueRow).toBeDefined();
    const valueFields = valueRow.querySelectorAll('.ink-popover-value-fields')[0];
    expect(valueFields).toBeDefined();
    const valueInputs = valueFields.querySelectorAll('.ink-popover-sub-input');
    expect(valueInputs.length).toBe(3);
    const formatToggleBtn = valueRow.querySelectorAll('.ink-format-toggle-btn')[0];
    expect(formatToggleBtn).toBeDefined();
    expect(valueInputs[0].value).toBe('000000');
    expect(valueInputs[1].style.display).toBe('none');
    expect(valueInputs[2].style.display).toBe('none');
    expect(formatToggleBtn.textContent).toBe('HEX');

    // Verify opacity controls exist inside the row container
    const opacityRow = popover.el.querySelectorAll('.opacity-row')[0];
    expect(opacityRow).toBeDefined();
    const opacitySlider = opacityRow.querySelectorAll('.ink-popover-opacity-slider')[0];
    expect(opacitySlider).toBeDefined();
    const opacityVal = opacityRow.querySelectorAll('.ink-popover-size-val')[0];
    expect(opacityVal).toBeDefined();

    // Verify Swatch Palette (isStatic: false) exists in DOM as a child
    expect(popover.miniSwatch).toBeDefined();
    expect(popover.miniSwatch.config.isStatic).toBe(false);

    // Verify Manage Swatches gear button exists inside its bar
    const buttonBar = popover.el.querySelectorAll('.ink-swatch-settings-bar')[0];
    expect(buttonBar).toBeDefined();
    const gearBtn = buttonBar.querySelectorAll('.ink-swatch-settings-gear')[0];
    expect(gearBtn).toBeDefined();

    // Verify History Tracker (isStatic: true) exists
    expect(popover.recentSwatch).toBeDefined();
    expect(popover.recentSwatch.config.isStatic).toBe(true);

    // Verify in-menu swatch selection syncs the parent toolbar active index
    popover.miniSwatch.slotBtns[2].trigger('click');
    expect(mockPlugin.settings.activePenColorIndex).toBe(2);
    expect(toolbar.colorSlotBtns[2].hasClass('is-selected')).toBe(true);
    expect(hueSlider.value).toBe('240');
    expect(valueInputs[0].value).toBe('0000FF');

    // Cycle to RGB before testing live value updates
    formatToggleBtn.trigger('click', { preventDefault: vi.fn(), stopPropagation: vi.fn() });
    expect(formatToggleBtn.textContent).toBe('RGB');
    expect(valueInputs[0].value).toBe('0');
    expect(valueInputs[1].value).toBe('0');
    expect(valueInputs[2].value).toBe('255');

    // Test Bidirectional Sync: Change matrix selection updates engine color
    canvas.width = 180;
    canvas.height = 120;
    canvas.trigger('pointerdown', { offsetX: 90, offsetY: 60 });
    // Saturation = 90/180 = 0.5, Value = 1 - (60/120) = 0.5. Slot 2 syncs H=240, producing #404080.
    expect(engine.setPenColor).toHaveBeenCalledWith('#404080FF'); // rgb + 100% alpha (FF)
    expect(valueInputs[0].value).toBe('64');
    expect(valueInputs[1].value).toBe('64');
    expect(valueInputs[2].value).toBe('128');
    expect(engine.requestFullRender).not.toHaveBeenCalled(); // Canvas Firewall

    // Test Hue Slider Sync: Change hue updates base and redraws
    hueSlider.value = '180'; // Cyan
    hueSlider.trigger('input');
    // At H=180, S=0.5, V=0.5, HsvToHex returns #408080.
    expect(engine.setPenColor).toHaveBeenCalledWith('#408080FF');
    expect(valueInputs[0].value).toBe('64');
    expect(valueInputs[1].value).toBe('128');
    expect(valueInputs[2].value).toBe('128');
    expect(engine.requestFullRender).not.toHaveBeenCalled(); // Canvas Firewall

    // Test Bidirectional Sync: Change opacity updates label and output format
    opacitySlider.value = '50';
    opacitySlider.trigger('input');
    expect(opacityVal.textContent).toBe('50%');
    expect(engine.setPenColor).toHaveBeenCalledWith('#40808080'); // 50% opacity hex = 80
    expect(valueInputs[0].value).toBe('64');
    expect(valueInputs[1].value).toBe('128');
    expect(valueInputs[2].value).toBe('128');
    expect(engine.requestFullRender).not.toHaveBeenCalled(); // Canvas Firewall

    // HSL cycle recalculates against the current matrix/opacity state
    formatToggleBtn.trigger('click', { preventDefault: vi.fn(), stopPropagation: vi.fn() });
    expect(formatToggleBtn.textContent).toBe('HSL');
    expect(valueInputs[0].value).toBe('180');
    expect(valueInputs[1].value).toBe('033');
    expect(valueInputs[2].value).toBe('038');

    // Empty input remains editable and is normalized only when focus leaves
    valueInputs[1].value = '';
    valueInputs[1].trigger('input');
    expect(valueInputs[1].value).toBe('');
    valueInputs[1].trigger('blur');
    expect(valueInputs[1].value).toBe('033');

    // Bidirectional sub-input changes update base color, then combine with opacity only for saving
    valueInputs[0].value = '120';
    valueInputs[1].value = '100';
    valueInputs[2].value = '050';
    valueInputs[0].trigger('input');
    expect(engine.setPenColor).toHaveBeenCalledWith('#00FF0080');
    expect(hueSlider.value).toBe('120');

    // Test Gear Button: click closes popover and opens swatch manager
    toolbar.openSwatchManager = vi.fn();
    gearBtn.trigger('click', { preventDefault: vi.fn(), stopPropagation: vi.fn() });
    expect(popover.isOpen).toBe(false);
    expect(toolbar.openSwatchManager).toHaveBeenCalled();
});
