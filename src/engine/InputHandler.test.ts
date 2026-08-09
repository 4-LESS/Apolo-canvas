import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { InputHandler } from './InputHandler';
import { Tool, ToolContext } from '../tools/Tool';

function createTool(name: string): Tool {
    return {
        name,
        cursor: 'crosshair',
        onPointerDown: vi.fn(),
        onPointerMove: vi.fn(),
        onPointerUp: vi.fn(),
        onPointerCancel: vi.fn(),
    };
}

function createPointerEvent(overrides: Partial<PointerEvent>): PointerEvent {
    return {
        pointerId: 1,
        pointerType: 'pen',
        buttons: 1,
        clientX: 110,
        clientY: 120,
        offsetX: 100,
        offsetY: 100,
        preventDefault: vi.fn(),
        ...overrides,
    } as PointerEvent;
}

function createCanvas(): HTMLCanvasElement {
    return {
        style: {},
        setPointerCapture: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        getBoundingClientRect: () => ({ left: 10, top: 20, width: 600, height: 400 }),
        closest: vi.fn(),
    } as any;
}

function createHarness() {
    const canvas = createCanvas();
    const penTool = createTool('Pen');
    const lassoTool = createTool('Lasso');
    const viewport = {
        getPageDimensions: () => ({ width: 2480, height: 3508 }),
        screenToPage: (x: number, y: number) => ({ x: x * 10, y: y * 10 }),
        getZoom: () => 1,
        pan: vi.fn(),
        zoomAt: vi.fn(),
    };
    const mockPage = {
        elements: [] as any[],
        getElementAtPoint: vi.fn(() => null as any),
    };
    const context = {
        viewport,
        canvas,
        page: mockPage,
        selectionManager: {
            getState: () => ({
                selectedIds: new Set<string>(),
                unifiedBounds: null,
            }),
        },
        history: {
            undo: vi.fn(),
            redo: vi.fn(),
        },
        requestRender: vi.fn(),
        requestFullRender: vi.fn(),
        requestSave: vi.fn(),
        requestToolSwitch: vi.fn(),
    } as any as ToolContext;

    let handler!: InputHandler;
    const engine = {
        isReadOnly: false,
        triggerNavigateLink: vi.fn(),
        setTool: vi.fn((toolName: string) => {
            if (toolName === 'lasso') {
                handler.setTool(lassoTool);
            }
        }),
        tools: new Map([['lasso', lassoTool]]),
    };

    handler = new InputHandler(canvas, context, viewport as any, engine);
    handler.setTool(penTool);

    return { handler, penTool, lassoTool, viewport, engine };
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {
        setTimeout: globalThis.setTimeout,
        clearTimeout: globalThis.clearTimeout,
    });
    vi.stubGlobal('navigator', {
        vibrate: vi.fn(),
    });
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

test('stylus long-press uses canvas pixels for movement slop and activates lasso', () => {
    const { handler, penTool, lassoTool, engine } = createHarness();

    (handler as any).onPointerDown(createPointerEvent({ clientX: 110, clientY: 120 }));
    (handler as any).onPointerMove(createPointerEvent({ clientX: 114, clientY: 120 }));

    expect(penTool.onPointerDown).not.toHaveBeenCalled();
    expect(penTool.onPointerMove).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);

    expect(engine.setTool).toHaveBeenCalledWith('lasso');
    expect(lassoTool.onPointerDown).toHaveBeenCalledTimes(1);
    expect(navigator.vibrate).toHaveBeenCalledWith(40);
});

test('stylus movement beyond slop cancels lasso timer and draws normally', () => {
    const { handler, penTool, lassoTool, engine } = createHarness();

    (handler as any).onPointerDown(createPointerEvent({ clientX: 110, clientY: 120 }));
    (handler as any).onPointerMove(createPointerEvent({ clientX: 116, clientY: 120 }));
    vi.advanceTimersByTime(500);

    expect(engine.setTool).not.toHaveBeenCalled();
    expect(lassoTool.onPointerDown).not.toHaveBeenCalled();
    expect(penTool.onPointerDown).toHaveBeenCalledTimes(1);
    expect(penTool.onPointerMove).toHaveBeenCalledTimes(1);
});

test('stylus lift before timeout cancels lasso timer and dispatches a normal tap stroke', () => {
    const { handler, penTool, engine } = createHarness();

    (handler as any).onPointerDown(createPointerEvent({ clientX: 110, clientY: 120 }));
    (handler as any).onPointerUp(createPointerEvent({ clientX: 110, clientY: 120 }));
    vi.advanceTimersByTime(500);

    expect(engine.setTool).not.toHaveBeenCalled();
    expect(penTool.onPointerDown).toHaveBeenCalledTimes(1);
    expect(penTool.onPointerUp).toHaveBeenCalledTimes(1);
});

test('finger long-press opens paste options without panning while inside slop', () => {
    const { handler, viewport } = createHarness();
    const pasteMenu = { hide: vi.fn(), show: vi.fn() };

    handler.setClipboardManager({ hasContent: () => true } as any);
    handler.setMenus({ hide: vi.fn() } as any, pasteMenu as any);

    (handler as any).onPointerDown(createPointerEvent({
        pointerId: 2,
        pointerType: 'touch',
        buttons: 0,
        clientX: 150,
        clientY: 160,
    }));
    (handler as any).onPointerMove(createPointerEvent({
        pointerId: 2,
        pointerType: 'touch',
        buttons: 0,
        clientX: 160,
        clientY: 160,
    }));

    expect(viewport.pan).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);

    expect(pasteMenu.show).toHaveBeenCalledWith(150, 160);
});

test('onPointerMove routes hover events to the active tool when isToolActive is false', () => {
    const { handler, penTool } = createHarness();
    
    const moveEvent = createPointerEvent({
        pointerType: 'mouse',
        buttons: 0,
        clientX: 150,
        clientY: 160,
    });
    
    (handler as any).onPointerMove(moveEvent);
    
    expect(penTool.onPointerMove).toHaveBeenCalledTimes(1);
    expect(penTool.onPointerMove).toHaveBeenCalledWith(moveEvent, expect.any(Object));
});

test('onPointerLeave routes events to the active tool', () => {
    const { handler, penTool } = createHarness();
    
    const leaveEvent = createPointerEvent({
        pointerType: 'mouse',
        buttons: 0,
        clientX: 150,
        clientY: 160,
    });
    
    penTool.onPointerLeave = vi.fn();
    
    (handler as any).onPointerLeave(leaveEvent);
    
    expect(penTool.onPointerLeave).toHaveBeenCalledTimes(1);
    expect(penTool.onPointerLeave).toHaveBeenCalledWith(leaveEvent, expect.any(Object));
});

test('InputHandler blocks tools and triggers link navigation in read-only mode', () => {
    const { handler, penTool, engine } = createHarness();
    engine.isReadOnly = true;

    // Mock an element with a URL
    const mockElement = { id: 'el1', url: 'https://example.com' };
    const pageMock = (handler as any).toolContext.page;
    pageMock.elements = [mockElement];
    pageMock.getElementAtPoint.mockReturnValue(mockElement);

    const downEvent = createPointerEvent({ clientX: 100, clientY: 100 });
    (handler as any).onPointerDown(downEvent);

    // Verify drawing/selection tool is NOT called
    expect(penTool.onPointerDown).not.toHaveBeenCalled();

    // Verify navigation callback is not triggered on pointerdown
    expect(engine.triggerNavigateLink).not.toHaveBeenCalled();

    const upEvent = createPointerEvent({ clientX: 100, clientY: 100 });
    (handler as any).onPointerUp(upEvent);

    // Verify navigation callback is triggered with correct URL on pointerup (tap)
    expect(engine.triggerNavigateLink).toHaveBeenCalledWith('https://example.com');
});

test('InputHandler updates cursor to pointer when hovering over linked element in read-only mode', () => {
    const { handler, engine } = createHarness();
    engine.isReadOnly = true;

    const mockElement = { id: 'el1', url: 'https://example.com' };
    const pageMock = (handler as any).toolContext.page;
    
    // Hovering over link
    pageMock.elements = [mockElement];
    pageMock.getElementAtPoint.mockReturnValue(mockElement);
    const canvas = (handler as any).canvas;
    canvas.parentElement = { style: {}, parentElement: { style: {} } };

    const moveEvent = createPointerEvent({ clientX: 100, clientY: 100 });
    (handler as any).onPointerMove(moveEvent);

    expect(canvas.style.cursor).toBe('pointer');
    expect(canvas.parentElement.style.cursor).toBe('none');
    expect(canvas.parentElement.parentElement.style.cursor).toBe('none');

    // Hovering off link
    pageMock.elements = [];
    pageMock.getElementAtPoint.mockReturnValue(null);
    (handler as any).onPointerMove(moveEvent);

    expect(canvas.style.cursor).toBe('default');
    expect(canvas.parentElement.style.cursor).toBe('default');
    expect(canvas.parentElement.parentElement.style.cursor).toBe('default');
});

test('InputHandler triggers hover-link callback exactly once on link hover and resets on hover off', () => {
    const { handler, engine } = createHarness();
    engine.isReadOnly = true;
    engine.triggerHoverLink = vi.fn();

    const mockElement = { id: 'el1', url: 'https://example.com' };
    const pageMock = (handler as any).toolContext.page;
    const canvas = (handler as any).canvas;
    canvas.parentElement = { style: {}, parentElement: { style: {} } };

    const moveEvent = createPointerEvent({ clientX: 100, clientY: 100 });

    // 1. Move over the linked element - should trigger triggerHoverLink
    pageMock.elements = [mockElement];
    pageMock.getElementAtPoint.mockReturnValue(mockElement);
    (handler as any).onPointerMove(moveEvent);

    expect(engine.triggerHoverLink).toHaveBeenCalledTimes(1);
    expect(engine.triggerHoverLink).toHaveBeenCalledWith('https://example.com', moveEvent);

    // 2. Move again over the same linked element - should NOT trigger again (state-checked)
    (handler as any).onPointerMove(moveEvent);
    expect(engine.triggerHoverLink).toHaveBeenCalledTimes(1);

    // 3. Move off the linked element
    pageMock.elements = [];
    pageMock.getElementAtPoint.mockReturnValue(null);
    (handler as any).onPointerMove(moveEvent);
    expect(engine.triggerHoverLink).toHaveBeenCalledTimes(1);

    // 4. Move back onto the linked element - should trigger again
    pageMock.elements = [mockElement];
    pageMock.getElementAtPoint.mockReturnValue(mockElement);
    (handler as any).onPointerMove(moveEvent);
    expect(engine.triggerHoverLink).toHaveBeenCalledTimes(2);
});

