import { expect, test, vi } from 'vitest';
import { LassoTool } from './LassoTool';
import { SelectionManager } from '../engine/SelectionManager';
import { InkPage } from '../model/InkPage';
import { HistoryManager } from '../engine/HistoryManager';
import { ToolContext } from './Tool';
import { ViewportManager } from '../engine/ViewportManager';
import { BoundingBox } from '../model/BoundingBox';
import { ClipboardManager } from '../engine/ClipboardManager';

function createMockContext(): ToolContext {
    const page = new InkPage('test');
    const history = new HistoryManager();
    return {
        page,
        viewport: new ViewportManager(100, 100, 100, 100),
        history,
        selectionManager: new SelectionManager(page, history),
        clipboardManager: new ClipboardManager(),
        penStyle: { size: 5, color: '#000', opacity: 1 },
        eraserSize: 20,
        canvas: { style: {} } as any,
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

test('LassoTool state machine starts dragging if clicked inside bounds', () => {
    const page = new InkPage('page1');
    const history = new HistoryManager();
    const selectionManager = new SelectionManager(page, history);
    const tool = new LassoTool(selectionManager);
    const ctx = createMockContext();
    
    // Fake a selection
    selectionManager.getState().selectedIds.add('s1');
    (selectionManager.getState() as any).unifiedBounds = new BoundingBox(10, 10, 70, 70); // 10..80
    
    // Click at the center of the box (45, 45) in page coords to avoid corner handles and rotation zones.
    const downEvent = { offsetX: 45, offsetY: 45 } as PointerEvent;
    tool.onPointerDown(downEvent, ctx);
    
    expect(selectionManager.getState().activeTransformDelta).not.toBeNull();
    expect(tool.cursor).toBe('grabbing');
    
    // Move to page (55, 55).
    const moveEvent = { offsetX: 53, offsetY: 53 } as PointerEvent;
    tool.onPointerMove(moveEvent, ctx);
    
    expect(selectionManager.getState().activeTransformDelta?.x).toBeCloseTo(10);
    expect(selectionManager.getState().activeTransformDelta?.y).toBeCloseTo(10);
    
    // Up
    const upEvent = { offsetX: 53, offsetY: 53 } as PointerEvent;
    tool.onPointerUp(upEvent, ctx);
    
    expect(selectionManager.getState().activeTransformDelta).toBeNull();
    expect(tool.cursor).toBe('grab');
    expect(ctx.requestSave).toHaveBeenCalled();
});

test('LassoTool state machine clears selection if clicked outside bounds', () => {
    const page = new InkPage('page1');
    const history = new HistoryManager();
    const selectionManager = new SelectionManager(page, history);
    const tool = new LassoTool(selectionManager);
    const ctx = createMockContext();
    
    selectionManager.getState().selectedIds.add('s1');
    (selectionManager.getState() as any).unifiedBounds = new BoundingBox(10, 10, 20, 20);
    
    // Click outside: page (100, 100) to be well outside the rotation zones.
    const downEvent = { offsetX: 100, offsetY: 100 } as PointerEvent;
    tool.onPointerDown(downEvent, ctx);
    
    // Clicking outside should clear the selection and start drawing a lasso path
    expect(selectionManager.getState().selectedIds.size).toBe(0);
    expect(selectionManager.getState().unifiedBounds).toBeNull();
    expect(selectionManager.getState().pendingLassoPath).not.toBeNull();
});
