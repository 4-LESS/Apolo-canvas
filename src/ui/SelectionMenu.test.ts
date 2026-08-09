// @ts-nocheck
import { expect, test, vi, beforeEach, afterEach } from 'vitest';
import { SelectionMenu } from './SelectionMenu';
import { BoundingBox } from '../model/BoundingBox';

vi.mock('obsidian', () => {
    return {
        FuzzySuggestModal: class MockFuzzySuggestModal {
            constructor(app) {
                this.app = app;
            }
            open() {}
        },
        TFile: class MockTFile {},
        App: class MockApp {},
    };
});

export let lastLinkSuggestModalCallback = null;
export let lastLinkSuggestModalInstance = null;

vi.mock('./LinkSuggestModal', () => {
    return {
        LinkSuggestModal: class MockLinkSuggestModal {
            constructor(app, onSelect) {
                this.app = app;
                this.onSelect = onSelect;
                lastLinkSuggestModalCallback = onSelect;
                lastLinkSuggestModalInstance = this;
            }
            open = vi.fn();
        }
    };
});

export let lastBlockSuggestModalCallback = null;
export let lastBlockSuggestModalInstance = null;

vi.mock('./BlockSuggestModal', () => {
    return {
        BlockSuggestModal: class MockBlockSuggestModal {
            constructor(app, targetFile, onSelect) {
                this.app = app;
                this.targetFile = targetFile;
                this.onSelect = onSelect;
                lastBlockSuggestModalCallback = onSelect;
                lastBlockSuggestModalInstance = this;
            }
            open = vi.fn();
        }
    };
});

beforeEach(() => {
    global.document = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    };
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    delete global.document;
});

test('SelectionMenu showAboveBounds position and flip-below logic', () => {
    // Mock Element prototype createEl
    const mockEl = {
        style: {},
        createEl: vi.fn().mockImplementation((tag, attrs) => {
            return {
                style: {},
                addEventListener: vi.fn(),
            };
        }),
        parentElement: {
            getBoundingClientRect: () => ({ left: 100, top: 50 })
        },
        offsetHeight: 40,
        offsetWidth: 120,
    };

    const mockMountTarget = {
        createEl: vi.fn().mockReturnValue(mockEl)
    };

    // Instantiate menu
    const menu = new SelectionMenu(mockMountTarget as any);
    expect(mockMountTarget.createEl).toHaveBeenCalledWith('div', { cls: 'ink-selection-menu' });

    // Mock canvas element
    const mockCanvas = {
        getBoundingClientRect: () => ({ left: 100, top: 50, width: 800, height: 600 })
    };

    mockEl.parentElement.getBoundingClientRect = () => ({ left: 80, top: 40, width: 400, height: 300 });
    mockCanvas.getBoundingClientRect = () => ({ left: 100, top: 50, width: 300, height: 200 });
    const viewport = {
        pageToScreen: (x: number, y: number) => ({ x: x * 0.5 + 20, y: y * 0.5 + 10 }),
    };

    // Case 1: Bounds are high up, should flip below the selection in screen space.
    const boundsHigh = new BoundingBox(100, 0, 100, 40);
    menu.showAboveBounds(boundsHigh, mockCanvas as any, viewport);
    expect(mockEl.style.top).toBe('48px');

    // Case 2: Bounds are lower, should be placed above selection using viewport.pageToScreen.
    const boundsLow = new BoundingBox(100, 100, 100, 50);
    menu.showAboveBounds(boundsLow, mockCanvas as any, viewport);
    expect(mockEl.style.left).toBe('55px');
    expect(mockEl.style.top).toBe('22px');

    // Run timers to trigger the event listener registration
    vi.runAllTimers();
    expect(global.document.addEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function));

    // Hide should hide the element and remove listener
    menu.hide();
    expect(mockEl.style.display).toBe('none');
    expect(global.document.removeEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function));
});

test('SelectionMenu style mode transitions and styling callbacks', () => {
    const mockEl = {
        style: {},
        createEl: vi.fn().mockImplementation((tag, attrs) => {
            return {
                style: {},
                addEventListener: vi.fn(),
                setAttribute: vi.fn(),
                classList: {
                    add: vi.fn(),
                    remove: vi.fn(),
                },
                querySelectorAll: vi.fn().mockReturnValue([])
            };
        }),
        parentElement: {
            getBoundingClientRect: () => ({ left: 100, top: 50 })
        },
        offsetHeight: 40,
        offsetWidth: 120,
    };

    const mockMountTarget = {
        createEl: vi.fn().mockReturnValue(mockEl)
    };

    const menu = new SelectionMenu(mockMountTarget as any);
    const mockSelMgr = {
        getState: () => ({ selectedIds: new Set(['s1']) }),
        applyStyleToSelection: vi.fn()
    };
    const mockEngine = {
        getActivePage: () => ({
            getElementById: () => ({
                style: { strokeColor: '#000000', strokeWidth: 3, strokePattern: 'solid' }
            })
        }),
        render: vi.fn(),
        triggerSave: vi.fn()
    };

    menu.setSelectionManager(mockSelMgr);
    menu.setEngine(mockEngine);

    // Initial state is base mode (isStyleMode = false)
    expect(menu.isStyleMode).toBe(false);

    // Trigger Style mode
    menu.isStyleMode = true;
    menu.buildItems();
    expect(menu.isStyleMode).toBe(true);

    // Hide should reset it back to base mode
    menu.hide();
    expect(menu.isStyleMode).toBe(false);
});

test('SelectionMenu conditionally renders Fill (Relleno) row based on shape selection', () => {
    const createdElements: any[] = [];
    const makeMockElement = (tag?: string, attrs?: any) => {
        const el: any = {
            style: {},
            addEventListener: vi.fn(),
            setAttribute: vi.fn(),
            classList: {
                add: vi.fn(),
                remove: vi.fn(),
            },
            querySelectorAll: vi.fn().mockReturnValue([]),
            textContent: '',
            innerHTML: '',
            createEl: vi.fn().mockImplementation((t, a) => {
                return makeMockElement(t, a);
            })
        };
        createdElements.push(el);
        return el;
    };

    const mockEl = makeMockElement();
    mockEl.parentElement = {
        getBoundingClientRect: () => ({ left: 100, top: 50 })
    };
    mockEl.offsetHeight = 40;
    mockEl.offsetWidth = 120;

    const mockMountTarget = {
        createEl: vi.fn().mockReturnValue(mockEl)
    };

    const menu = new SelectionMenu(mockMountTarget as any);
    const mockSelMgr = {
        getState: () => ({ selectedIds: new Set(['s1']) }),
        applyStyleToSelection: vi.fn()
    };

    // Case 1: Only strokes selected (no shape)
    const mockEngineNoShape = {
        getActivePage: () => ({
            getElementById: () => ({
                type: 'stroke',
                style: { strokeColor: '#000000', strokeWidth: 3, strokePattern: 'solid' }
            })
        }),
        render: vi.fn(),
        triggerSave: vi.fn()
    };

    menu.setSelectionManager(mockSelMgr);
    menu.setEngine(mockEngineNoShape);
    menu.isStyleMode = true;

    createdElements.length = 0;
    menu.buildItems();

    // Check that "Relleno:" label was not created
    const hasRellenoTextNoShape = createdElements.some(el => el.textContent === 'Relleno:');
    expect(hasRellenoTextNoShape).toBe(false);

    // Case 2: Shape selected
    const mockEngineWithShape = {
        getActivePage: () => ({
            getElementById: () => ({
                type: 'shape',
                style: { strokeColor: '#000000', strokeWidth: 3, strokePattern: 'solid', fillColor: 'transparent' }
            })
        }),
        render: vi.fn(),
        triggerSave: vi.fn()
    };

    menu.setEngine(mockEngineWithShape);
    createdElements.length = 0;
    menu.buildItems();

    // Check that "Relleno:" label was created
    const hasRellenoTextWithShape = createdElements.some(el => el.textContent === 'Relleno:');
    expect(hasRellenoTextWithShape).toBe(true);
});

test('SelectionMenu promptForLink uses LinkSuggestModal when app is set, and falls back to window.prompt', async () => {
    // Setup mocks
    const mockEl = {
        style: {},
        createEl: vi.fn().mockImplementation((tag, attrs) => ({
            style: {},
            addEventListener: vi.fn(),
        })),
        parentElement: {
            getBoundingClientRect: () => ({ left: 0, top: 0 })
        }
    };
    const mockMountTarget = {
        createEl: vi.fn().mockReturnValue(mockEl)
    };
    
    const menu = new SelectionMenu(mockMountTarget as any);
    const mockSelMgr = {
        getState: vi.fn().mockReturnValue({ selectedIds: new Set(['s1']) }),
        applyUrlToSelection: vi.fn()
    };
    const mockEngine = {
        getActivePage: () => ({
            getElementById: () => ({ url: 'initial-url' })
        }),
        triggerSyncLink: vi.fn(),
        requestFullRender: vi.fn(),
        requestSave: vi.fn()
    };

    menu.setSelectionManager(mockSelMgr);
    menu.setEngine(mockEngine);

    // Case 1: App is defined. Link target does not exist. Should apply the link immediately.
    const mockApp = {
        metadataCache: {
            getFirstLinkpathDest: vi.fn().mockReturnValue(null),
            getFileCache: vi.fn(),
        },
        vault: {
            cachedRead: vi.fn(),
        }
    };
    menu.setApp(mockApp as any);

    menu['promptForLink'](); // Access private method

    expect(lastLinkSuggestModalInstance).not.toBeNull();
    expect(lastLinkSuggestModalInstance.open).toHaveBeenCalled();

    // Trigger the callback selection from fuzzy suggest modal
    await lastLinkSuggestModalCallback('[[Target Note]]');

    expect(mockSelMgr.applyUrlToSelection).toHaveBeenCalledWith('[[Target Note]]');
    expect(mockEngine.requestFullRender).toHaveBeenCalled();
    expect(mockEngine.requestSave).toHaveBeenCalled();

    // Case 1b: App is defined. Link target exists, has <= 1 block. Should apply targetFile.basename immediately.
    const mockFile = { basename: 'TargetNote', path: 'TargetNote.md' };
    mockApp.metadataCache.getFirstLinkpathDest.mockReturnValue(mockFile);
    mockApp.metadataCache.getFileCache.mockReturnValue({
        sections: [
            { type: 'code', position: { start: { line: 0 }, end: { line: 3 } } }
        ]
    });
    mockApp.vault.cachedRead.mockResolvedValue('```ink\nid: my-canvas-1\n```');

    mockSelMgr.applyUrlToSelection.mockClear();
    mockEngine.requestFullRender.mockClear();
    mockEngine.requestSave.mockClear();

    menu['promptForLink']();
    await lastLinkSuggestModalCallback('TargetNote');

    expect(mockSelMgr.applyUrlToSelection).toHaveBeenCalledWith('TargetNote');
    expect(mockEngine.requestFullRender).toHaveBeenCalled();
    expect(mockEngine.requestSave).toHaveBeenCalled();

    // Case 1c: App is defined. Link target exists, has > 1 block. Should launch BlockSuggestModal.
    mockApp.metadataCache.getFileCache.mockReturnValue({
        sections: [
            { type: 'code', position: { start: { line: 0 }, end: { line: 2 } } },
            { type: 'code', position: { start: { line: 4 }, end: { line: 6 } } }
        ]
    });
    mockApp.vault.cachedRead.mockResolvedValue('```ink\nid: canvas-1\n```\n\n```ink\nid: canvas-2\n```');

    mockSelMgr.applyUrlToSelection.mockClear();
    mockEngine.requestFullRender.mockClear();
    mockEngine.requestSave.mockClear();

    menu['promptForLink']();
    await lastLinkSuggestModalCallback('TargetNote');

    // Should not have applied yet, but opened BlockSuggestModal
    expect(mockSelMgr.applyUrlToSelection).not.toHaveBeenCalled();
    expect(lastBlockSuggestModalInstance).not.toBeNull();
    expect(lastBlockSuggestModalInstance.open).toHaveBeenCalled();

    // Choose block from BlockSuggestModal
    lastBlockSuggestModalCallback('canvas-2');
    expect(mockSelMgr.applyUrlToSelection).toHaveBeenCalledWith('TargetNote#^canvas-2');
    expect(mockEngine.requestFullRender).toHaveBeenCalled();
    expect(mockEngine.requestSave).toHaveBeenCalled();

    // Case 2: App is not defined. Should fall back to window.prompt.
    menu.setApp(null);
    global.window = {
        prompt: vi.fn().mockReturnValue('https://example.com')
    };
    
    mockSelMgr.applyUrlToSelection.mockClear();
    mockEngine.triggerSyncLink.mockClear();
    mockEngine.requestFullRender.mockClear();
    mockEngine.requestSave.mockClear();

    menu['promptForLink']();

    expect(global.window.prompt).toHaveBeenCalledWith(expect.any(String), 'initial-url');
    expect(mockSelMgr.applyUrlToSelection).toHaveBeenCalledWith('https://example.com');
    expect(mockEngine.triggerSyncLink).toHaveBeenCalledWith('https://example.com');
    expect(mockEngine.requestFullRender).toHaveBeenCalled();
    expect(mockEngine.requestSave).toHaveBeenCalled();

    delete global.window;
});

test('SelectionMenu conditionally shows Unlink button and clears link on click', () => {
    const createdElements: any[] = [];
    const makeMockElement = (tag?: string, attrs?: any) => {
        const el: any = {
            style: {},
            addEventListener: vi.fn(),
            setAttribute: vi.fn(),
            classList: {
                add: vi.fn(),
                remove: vi.fn(),
            },
            querySelectorAll: vi.fn().mockReturnValue([]),
            textContent: '',
            innerHTML: '',
            createEl: vi.fn().mockImplementation((t, a) => makeMockElement(t, a))
        };
        createdElements.push(el);
        return el;
    };

    const mockEl = makeMockElement();
    const mockMountTarget = {
        createEl: vi.fn().mockReturnValue(mockEl)
    };

    const menu = new SelectionMenu(mockMountTarget as any);
    const mockSelMgr = {
        getState: () => ({ selectedIds: new Set(['s1']) }),
        applyUrlToSelection: vi.fn()
    };

    // Case 1: Selected element does NOT have a URL. Unlink button should not be built.
    const mockEngineNoLink = {
        getActivePage: () => ({
            getElementById: () => ({ url: '' })
        }),
        requestFullRender: vi.fn(),
        requestSave: vi.fn()
    };

    menu.setSelectionManager(mockSelMgr);
    menu.setEngine(mockEngineNoLink);
    
    createdElements.length = 0;
    menu.buildItems();

    const unlinkItemNoLink = createdElements.find(el => el.setAttribute.mock.calls.some((args: any) => args[0] === 'title' && args[1] === 'Unlink'));
    expect(unlinkItemNoLink).toBeUndefined();

    // Case 2: Selected element HAS a URL. Unlink button should be built and clearing URL on action works.
    const mockEngineWithLink = {
        getActivePage: () => ({
            getElementById: () => ({ url: 'https://example.com' })
        }),
        requestFullRender: vi.fn(),
        requestSave: vi.fn()
    };

    menu.setEngine(mockEngineWithLink);

    createdElements.length = 0;
    menu.buildItems();

    const unlinkItem = createdElements.find(el => el.setAttribute.mock.calls.some((args: any) => args[0] === 'title' && args[1] === 'Unlink'));
    expect(unlinkItem).toBeDefined();

    // Capture the click handler on the Unlink button
    const clickListenerCall = unlinkItem.addEventListener.mock.calls.find((args: any) => args[0] === 'pointerdown');
    expect(clickListenerCall).toBeDefined();
    
    const clickHandler = clickListenerCall[1];
    const mockEvent = { stopPropagation: vi.fn() };
    
    clickHandler(mockEvent);

    expect(mockEvent.stopPropagation).toHaveBeenCalled();
    expect(mockSelMgr.applyUrlToSelection).toHaveBeenCalledWith(undefined);
    expect(mockEngineWithLink.requestFullRender).toHaveBeenCalled();
    expect(mockEngineWithLink.requestSave).toHaveBeenCalled();
});
