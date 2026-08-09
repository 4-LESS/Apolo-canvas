import { expect, test, vi } from 'vitest';
import { ColorSwatchComponent } from './ColorSwatchComponent';

// Self-contained MockElement for DOM testing in Node
class MockElement {
    className: string = '';
    classList = {
        add: vi.fn((cls: string) => {
            cls.split(/\s+/).forEach(c => {
                if (c) this.classes.add(c);
            });
            this.className = Array.from(this.classes).join(' ');
        }),
        remove: vi.fn((cls: string) => {
            cls.split(/\s+/).forEach(c => {
                this.classes.delete(c);
            });
            this.className = Array.from(this.classes).join(' ');
        }),
        contains: vi.fn((cls: string) => this.classes.has(cls))
    };
    classes = new Set<string>();
    attributes = new Map<string, string>();
    listeners = new Map<string, Function[]>();
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

    addEventListener(event: string, cb: Function) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(cb);
    }

    removeEventListener(event: string, cb: Function) {
        if (this.listeners.has(event)) {
            this.listeners.set(event, this.listeners.get(event)!.filter(f => f !== cb));
        }
    }

    trigger(event: string, ...args: any[]) {
        const handlers = this.listeners.get(event) || [];
        for (const handler of handlers) {
            handler(...args);
        }
    }

    remove() {
        // Mock remove
    }
}

// Mock structures
const mockPlugin = {
    settings: {
        penPalettes: [
            { id: 'classic', name: 'Classic', colors: ['#000000', '#ff0000', '#0000ff', '#00ff00'] },
            { id: 'pastel', name: 'Pastel', colors: ['#ff7675', '#fdcb6e', '#00bec4', '#a29bfe'] },
            { id: 'retro', name: 'Retro', colors: ['#2d3436', '#d63031', '#0984e3', '#00b894'] }
        ],
        highlighterPalettes: [
            { id: 'classic', name: 'Classic', colors: ['#ffff0080', '#00ff0080', '#ff00ff80', '#00ffff80'] }
        ],
        activePenPaletteId: 'classic',
        activeHighlighterPaletteId: 'classic',
        activePenColorIndex: 0,
        activeHighlighterColorIndex: 0,
        lastPenColorHex: '#000000',
        lastHighlighterColorHex: '#ffff0080'
    },
    saveSettings: vi.fn()
};

const mockEngine = {
    currentFillColor: 'transparent',
    getToolName: vi.fn(() => 'pen'),
    setPenColor: vi.fn(),
    requestFullRender: vi.fn()
};

const mockToolbar = {
    plugin: mockPlugin,
    focusedEngineRef: {
        get: () => mockEngine
    },
    syncToolState: vi.fn(),
    colorPickerPopover: {
        isOpen: false,
        activeTriggerEl: null,
        activeEngine: null,
        showColorPicker: vi.fn()
    },
    getPaletteData(isHighlighter: boolean) {
        const settings = this.plugin?.settings ?? {};
        const palettes = isHighlighter ? settings.highlighterPalettes : settings.penPalettes;
        const activePaletteId = isHighlighter ? settings.activeHighlighterPaletteId : settings.activePenPaletteId;
        const activeIndex = isHighlighter ? settings.activeHighlighterColorIndex : settings.activePenColorIndex;
        const palette = palettes.find((p: any) => p.id === activePaletteId) ?? palettes[0];
        return { palettes, activePaletteId, activeIndex, palette };
    }
};

test('ColorSwatchComponent layout orientation mapping', () => {
    const parentEl = new MockElement('div');

    // 1. Verify vertical layout constraints
    const verticalSwatch = new ColorSwatchComponent(parentEl as any, {
        orientation: 'vertical',
        toolType: 'pen'
    }, mockToolbar as any);

    expect(verticalSwatch.containerEl.hasClass('is-vertical')).toBe(true);
    expect(verticalSwatch.containerEl.hasClass('is-horizontal')).toBe(false);
    expect(verticalSwatch.slotBtns.length).toBe(4);
    
    // Up arrow svg check
    const prevArrow = verticalSwatch.containerEl.children[0];
    expect(prevArrow.innerHTML).toContain('d="M12 8l-6 6h12z"'); // Up triangle path

    // Down arrow svg check
    const nextArrow = verticalSwatch.containerEl.children[2];
    expect(nextArrow.innerHTML).toContain('d="M12 16l-6-6h12z"'); // Down triangle path

    // 2. Verify horizontal layout constraints
    const horizontalSwatch = new ColorSwatchComponent(parentEl as any, {
        orientation: 'horizontal',
        toolType: 'pen'
    }, mockToolbar as any);

    expect(horizontalSwatch.containerEl.hasClass('is-horizontal')).toBe(true);
    expect(horizontalSwatch.containerEl.hasClass('is-vertical')).toBe(false);

    // Left arrow svg check
    const leftArrow = horizontalSwatch.containerEl.children[0];
    expect(leftArrow.innerHTML).toContain('d="M14 6l-6 6 6 6z"'); // Left triangle path

    // Right arrow svg check
    const rightArrow = horizontalSwatch.containerEl.children[2];
    expect(rightArrow.innerHTML).toContain('d="M10 6l6 6-6 6z"'); // Right triangle path

    verticalSwatch.destroy();
    horizontalSwatch.destroy();
});

test('ColorSwatchComponent palette navigation and wrapping', () => {
    const parentEl = new MockElement('div');
    const swatch = new ColorSwatchComponent(parentEl as any, {
        orientation: 'vertical',
        toolType: 'pen'
    }, mockToolbar as any);

    mockPlugin.settings.activePenPaletteId = 'classic';
    swatch.refresh();

    // Verify initial slot background colors (Classic palette)
    expect(swatch.slotBtns[0].style.backgroundColor).toBe('#000000');
    expect(swatch.slotBtns[1].style.backgroundColor).toBe('#ff0000');

    // Shift to next palette (Pastel)
    swatch.shiftPalette('next');
    expect(mockPlugin.settings.activePenPaletteId).toBe('pastel');

    // Shift to next palette (Retro)
    swatch.shiftPalette('next');
    expect(mockPlugin.settings.activePenPaletteId).toBe('retro');

    // Shift to next palette wraps back to Classic
    swatch.shiftPalette('next');
    expect(mockPlugin.settings.activePenPaletteId).toBe('classic');

    // Shift to previous palette wraps to Retro
    swatch.shiftPalette('prev');
    expect(mockPlugin.settings.activePenPaletteId).toBe('retro');

    swatch.destroy();
});

test('ColorSwatchComponent touch swiping gesture translation', () => {
    const parentEl = new MockElement('div');
    const swatch = new ColorSwatchComponent(parentEl as any, {
        orientation: 'vertical',
        toolType: 'pen'
    }, mockToolbar as any);

    mockPlugin.settings.activePenPaletteId = 'classic';
    swatch.refresh();

    // Swipe up (dist < 0, vertical) -> triggers next palette
    swatch.dotsStripEl.trigger('pointerdown', { clientX: 100, clientY: 200, pointerId: 1 });
    swatch.dotsStripEl.trigger('pointerup', { clientX: 100, clientY: 100, pointerId: 1 }); // dist = -100, velocity > 0.15
    expect(mockPlugin.settings.activePenPaletteId).toBe('pastel');

    // Swipe down (dist > 0, vertical) -> triggers previous palette
    swatch.dotsStripEl.trigger('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 });
    swatch.dotsStripEl.trigger('pointerup', { clientX: 100, clientY: 200, pointerId: 1 }); // dist = 100, velocity > 0.15
    expect(mockPlugin.settings.activePenPaletteId).toBe('classic');

    swatch.destroy();
});

test('ColorSwatchComponent event teardown and memory cleanup', () => {
    const parentEl = new MockElement('div');
    const swatch = new ColorSwatchComponent(parentEl as any, {
        orientation: 'vertical',
        toolType: 'pen'
    }, mockToolbar as any);

    // Verify pointerdown exists initially on dotsStripEl
    expect(swatch.dotsStripEl.listeners.get('pointerdown')?.length).toBe(1);
    
    // Verify no pointerup exists initially (since it's transient/short-lived)
    expect(swatch.dotsStripEl.listeners.get('pointerup')?.length || 0).toBe(0);

    // Trigger pointerdown to instantiate transient pointerup/pointercancel (on dotsStripEl since window is mock-wrapped to target)
    swatch.dotsStripEl.trigger('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 });
    expect(swatch.dotsStripEl.listeners.get('pointerup')?.length).toBe(1);
    expect(swatch.dotsStripEl.listeners.get('pointercancel')?.length).toBe(1);

    // Destroy the component
    swatch.destroy();

    // Verify all listeners are completely removed
    expect(swatch.dotsStripEl.listeners.get('pointerdown')?.length || 0).toBe(0);
    expect(swatch.dotsStripEl.listeners.get('pointerup')?.length || 0).toBe(0);
    expect(swatch.dotsStripEl.listeners.get('pointercancel')?.length || 0).toBe(0);
});

test('ColorSwatchComponent onSlotClick callback invocation', () => {
    const parentEl = new MockElement('div');
    const clickedSlots: number[] = [];
    const swatch = new ColorSwatchComponent(parentEl as any, {
        orientation: 'vertical',
        toolType: 'pen',
        onSlotClick: (idx, color) => {
            clickedSlots.push(idx);
        }
    }, mockToolbar as any);

    // Trigger click on slot index 1
    swatch.slotBtns[1].trigger('click');
    expect(clickedSlots).toEqual([1]);

    swatch.destroy();
});
