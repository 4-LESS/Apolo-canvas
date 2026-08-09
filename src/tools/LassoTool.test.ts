import { expect, test, vi } from 'vitest';
import { LassoTool } from './LassoTool';
import { SelectionManager } from '../engine/SelectionManager';
import { InkPage } from '../model/InkPage';
import { HistoryManager } from '../engine/HistoryManager';
import { ToolContext } from './Tool';
import { ViewportManager } from '../engine/ViewportManager';
import { ClipboardManager } from '../engine/ClipboardManager';
import { Stroke } from '../model/Stroke';

function createMockContext(
    page = new InkPage('test'),
    history = new HistoryManager(),
    selectionManager = new SelectionManager(page, history)
): ToolContext {
    return {
        page,
        viewport: new ViewportManager(100, 100, 100, 100),
        history,
        selectionManager,
        clipboardManager: new ClipboardManager(),
        penStyle: { size: 5, color: '#000', opacity: 1 },
        eraserSize: 20,
        canvas: {} as HTMLCanvasElement,
        currentColor: '#000000',
        currentFillColor: 'transparent',
        currentSize: 5,
        currentPattern: 'solid',
        shiftHeld: false,
        smoothingLevel: 0,
        getToolSize: (toolName: string) => 5,
        requestRender: vi.fn(),
        requestFullRender: vi.fn(),
        requestSave: vi.fn(),
        requestToolSwitch: vi.fn(),
    };
}

test('LassoTool draws lasso path and commits on pointer up', () => {
    const page = new InkPage('page1');
    const history = new HistoryManager();
    const selectionManager = new SelectionManager(page, history);
    const tool = new LassoTool(selectionManager);
    
    const ctx = createMockContext();
    
    // Simulate pointer down
    const downEvent = { offsetX: 10, offsetY: 10 } as PointerEvent;
    tool.onPointerDown(downEvent, ctx);
    
    let state = selectionManager.getState();
    expect(state.pendingLassoPath).not.toBeNull();
    expect(state.pendingLassoPath!.length).toBe(1);
    expect(state.pendingLassoPath![0]).toEqual({ x: 0, y: 0 });
    expect(ctx.requestRender).toHaveBeenCalled();
    
    // Simulate pointer move 1
    const moveEvent1 = { offsetX: 20, offsetY: 20 } as PointerEvent;
    tool.onPointerMove(moveEvent1, ctx);
    
    // Simulate pointer move 2
    const moveEvent2 = { offsetX: 30, offsetY: 30 } as PointerEvent;
    tool.onPointerMove(moveEvent2, ctx);
    
    state = selectionManager.getState();
    expect(state.pendingLassoPath!.length).toBe(3);
    
    // Simulate pointer up
    const upEvent = { offsetX: 30, offsetY: 30 } as PointerEvent;
    tool.onPointerUp(upEvent, ctx);
    
    state = selectionManager.getState();
    expect(state.pendingLassoPath).toBeNull(); // Cleared after commit
});

test('LassoTool discards path with less than 3 points on pointer up', () => {
    const page = new InkPage('page1');
    const history = new HistoryManager();
    const selectionManager = new SelectionManager(page, history);
    const tool = new LassoTool(selectionManager);
    const ctx = createMockContext();
    
    const downEvent = { offsetX: 10, offsetY: 10 } as PointerEvent;
    tool.onPointerDown(downEvent, ctx);
    
    // Only 1 point in path, pointer up
    const upEvent = {} as PointerEvent;
    tool.onPointerUp(upEvent, ctx);
    
    const state = selectionManager.getState();
    expect(state.pendingLassoPath).toBeNull();
    expect(state.selectedIds.size).toBe(0);
});

test('LassoTool clears path on pointer cancel', () => {
    const page = new InkPage('page1');
    const history = new HistoryManager();
    const selectionManager = new SelectionManager(page, history);
    const tool = new LassoTool(selectionManager);
    
    const ctx = createMockContext();
    
    const downEvent = { offsetX: 10, offsetY: 10 } as PointerEvent;
    tool.onPointerDown(downEvent, ctx);
    
    expect(selectionManager.getState().pendingLassoPath).not.toBeNull();
    
    const cancelEvent = {} as PointerEvent;
    tool.onPointerCancel(cancelEvent, ctx);
    
    expect(selectionManager.getState().pendingLassoPath).toBeNull();
});

test('LassoTool shows selection menu and switches to selection mode after selecting strokes', () => {
    const page = new InkPage('page1');
    const history = new HistoryManager();
    const selectionManager = new SelectionManager(page, history);
    const tool = new LassoTool(selectionManager);
    const ctx = createMockContext(page, history, selectionManager);
    const selectionMenu = {
        hide: vi.fn(),
        showAboveBounds: vi.fn(),
    };

    const stroke = new Stroke('s1', 'pen');
    stroke.addPoint(20, 20, 1);
    stroke.addPoint(30, 30, 1);
    page.addElement(stroke);
    tool.setSelectionMenu(selectionMenu as any);

    tool.onPointerDown({ offsetX: 10, offsetY: 10 } as PointerEvent, ctx);
    tool.onPointerMove({ offsetX: 50, offsetY: 10 } as PointerEvent, ctx);
    tool.onPointerMove({ offsetX: 50, offsetY: 50 } as PointerEvent, ctx);
    tool.onPointerMove({ offsetX: 10, offsetY: 50 } as PointerEvent, ctx);
    tool.onPointerUp({ offsetX: 10, offsetY: 50 } as PointerEvent, ctx);

    expect(selectionManager.getState().selectedIds.has('s1')).toBe(true);
    expect(selectionMenu.showAboveBounds).toHaveBeenCalledWith(
        selectionManager.getState().unifiedBounds,
        ctx.canvas,
        ctx.viewport
    );
});
