// @ts-nocheck
import { expect, test, vi } from 'vitest';

vi.mock('obsidian', () => ({
    setIcon: vi.fn(),
    Notice: class MockNotice { constructor(_msg) {} }
}));

import { StrokeToolOptionsPopover, PEN_OPTIONS_CONFIG } from './StrokeToolOptionsPopover';
import { PenProfileRegistry } from '../../../model/PenProfileRegistry';

// Minimal DOM element mock (Node environment, no jsdom).
class MockElement {
    classes = new Set();
    attributes = new Map();
    listeners = new Map();
    children = [];
    style = {};
    innerHTML = '';
    textContent = '';

    constructor(tagName) { this.tagName = tagName; }

    classList = {
        add: (...cls) => cls.forEach(c => c && this.classes.add(c)),
        remove: (...cls) => cls.forEach(c => this.classes.delete(c)),
        toggle: (cls, force) => {
            const enabled = force ?? !this.classes.has(cls);
            enabled ? this.classes.add(cls) : this.classes.delete(cls);
            return enabled;
        },
        contains: (cls) => this.classes.has(cls)
    };

    addClass(cls) { cls.split(/\s+/).forEach(c => c && this.classes.add(c)); }
    removeClass(cls) { cls.split(/\s+/).forEach(c => this.classes.delete(c)); }
    hasClass(cls) { return this.classes.has(cls); }

    createDiv(attrs) { return this.appendChild_(new MockElement('div'), attrs); }
    createSpan(attrs) { return this.appendChild_(new MockElement('span'), attrs); }
    createEl(tag, attrs) { return this.appendChild_(new MockElement(tag), attrs); }

    appendChild_(el, attrs) {
        if (attrs?.cls) el.addClass(attrs.cls);
        if (attrs?.text) el.textContent = attrs.text;
        if (attrs?.attr) for (const [k, v] of Object.entries(attrs.attr)) el.attributes.set(k, v);
        this.children.push(el);
        return el;
    }

    addEventListener(event, cb) {
        if (!this.listeners.has(event)) this.listeners.set(event, []);
        this.listeners.get(event).push(cb);
    }

    trigger(event, ...args) {
        (this.listeners.get(event) || []).forEach(cb => cb(...args));
    }

    empty() { this.children = []; }

    querySelectorAll(selector) {
        if (selector.startsWith('.')) {
            const cls = selector.substring(1);
            return this.children.filter(c => c.hasClass(cls));
        }
        return this.children;
    }
}

class MockEngine {
    activeProfileId = 'pen-rounded';
    currentPattern = 'solid';
    toolSizes = new Map([['pen', 4]]);
    penSmoothing = 0.25;
    toolContext = { currentColor: '#1a1a1a' };

    getToolSize(name) { return this.toolSizes.get(name) ?? 4; }
    setToolSize = vi.fn((name, size) => { this.toolSizes.set(name, size); });
    getPenSmoothing() { return this.penSmoothing; }
    setPenSmoothing = vi.fn((v) => { this.penSmoothing = v; });
    requestFullRender = vi.fn();
}

function createHarness() {
    const plugin = {
        settings: { activePenProfileId: null },
        saveSettings: vi.fn().mockResolvedValue(undefined)
    };
    const toolbar = {
        plugin,
        focusedEngineRef: { get: () => null },
        pencilCaseBar: { syncValues: vi.fn() },
        syncToolState: vi.fn(),
        queueSettingsSave: vi.fn()
    };
    const parent = new MockElement('div');
    const popover = new StrokeToolOptionsPopover(parent, plugin, toolbar, PEN_OPTIONS_CONFIG);
    return { plugin, toolbar, parent, popover };
}

// Regression: the profile carousel silently rendered empty in the shipped bundle
// because class fields assigned inside buildContent() (invoked from the base
// constructor) were clobbered back to undefined after super() returned.
test('pen options popover renders one pill per registered pen profile', () => {
    const { popover } = createHarness();
    const engine = new MockEngine();

    popover.showOptions(new MockElement('button'), engine);

    const carousel = popover.el.children.find(c => c.hasClass('ink-profile-carousel'));
    expect(carousel).toBeDefined();

    const penProfiles = PenProfileRegistry.getAll().filter(p => p.toolType === 'pen');
    expect(penProfiles.length).toBeGreaterThanOrEqual(5);

    const pills = carousel.children.filter(c => c.hasClass('ink-profile-pill'));
    expect(pills.length).toBe(penProfiles.length);
    expect(pills.map(p => p.attributes.get('title'))).toEqual(penProfiles.map(p => p.name));

    // Active profile is reflected in the indicator label and selection ring
    const indicator = popover.el.children
        .find(c => c.hasClass('ink-pen-header-row'))
        ?.children.find(c => c.hasClass('ink-profile-indicator-label'));
    expect(indicator?.textContent).toBe('FOUNTAIN PEN');
    expect(pills.filter(p => p.hasClass('is-selected')).length).toBe(1);
});

test('clicking a profile pill applies the profile to the engine and settings', () => {
    const { plugin, popover } = createHarness();
    const engine = new MockEngine();

    popover.showOptions(new MockElement('button'), engine);

    const carousel = popover.el.children.find(c => c.hasClass('ink-profile-carousel'));
    const pills = carousel.children.filter(c => c.hasClass('ink-profile-pill'));
    const ballpoint = PenProfileRegistry.get('pen-ballpoint');
    const ballpointPill = pills.find(p => p.attributes.get('title') === ballpoint.name);
    expect(ballpointPill).toBeDefined();

    ballpointPill.trigger('click', { preventDefault: () => {}, stopPropagation: () => {} });

    expect(engine.activeProfileId).toBe('pen-ballpoint');
    expect(plugin.settings.activePenProfileId).toBe('pen-ballpoint');
    expect(engine.setToolSize).toHaveBeenCalledWith('pen', ballpoint.baseWidth);
    expect(engine.setPenSmoothing).toHaveBeenCalledWith(ballpoint.baseSmoothing);
    expect(ballpointPill.hasClass('is-selected')).toBe(true);
});
