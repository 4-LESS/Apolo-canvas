import { expect, test, vi } from 'vitest';
import { HighlighterTool } from './HighlighterTool';
import { InkPage } from '../model/InkPage';
import { HistoryManager } from '../engine/HistoryManager';
import { ToolContext } from './Tool';
import { ViewportManager } from '../engine/ViewportManager';
import { clientToPageCoords } from '../utils/geometry';

import { SelectionManager } from '../engine/SelectionManager';
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
        penStyle: { size: 5, color: '#ff0', opacity: 1 },
        eraserSize: 20,
        canvas: {} as HTMLCanvasElement,
        currentColor: '#FFE066',
        currentFillColor: 'transparent',
        currentSize: 16,
        currentPattern: 'solid',
        shiftHeld: false,
        smoothingLevel: 0.55,
        getToolSize: (toolName: string) => 16,
        requestRender: vi.fn(),
        requestFullRender: vi.fn(),
        requestSave: vi.fn(),
        requestToolSwitch: vi.fn(),
        settings: {
            highlighterLinearModifier: false
        }
    };
}

test('HighlighterTool creates stroke with isHighlight=true', () => {
    const tool = new HighlighterTool();
    const ctx = createMockContext();
    
    // Simulate pointer down
    const downEvent = { offsetX: 10, offsetY: 10, pressure: 0.8 } as PointerEvent;
    tool.onPointerDown(downEvent, ctx);
    
    const activeStroke = tool.getActiveStroke();
    expect(activeStroke).not.toBeNull();
    expect(activeStroke!.isHighlight).toBe(true);
    expect(activeStroke!.style.opacity).toBe(0.4);
    expect(activeStroke!.points.length).toBe(1);
    
    // Simulate pointer move
    const moveEvent = { 
        offsetX: 20, 
        offsetY: 20, 
        pressure: 0.8,
        getCoalescedEvents: () => [moveEvent] 
    } as any;
    tool.onPointerMove(moveEvent, ctx);
    
    expect(activeStroke!.points.length).toBe(2);
    
    // Simulate pointer up
    const upEvent = {} as PointerEvent;
    tool.onPointerUp(upEvent, ctx);
    
    expect(tool.getActiveStroke()).toBeNull();
    expect(ctx.history.undo).toBeDefined(); // history has an event now
});

test('HighlighterTool snaps linear highlighter to horizontal and vertical axes', () => {
    const tool = new HighlighterTool();
    const ctx = createMockContext();
    ctx.settings.highlighterLinearModifier = true; // Activate linear drawing modifier

    // 1. Horizontal Snapping (angle ~3 degrees)
    const downEvent = { offsetX: 10, offsetY: 10, pressure: 0.8 } as PointerEvent;
    tool.onPointerDown(downEvent, ctx);

    // Move to (100, 15) -> pageX = 112.5 (clamped to 100), pageY = 6.25 -> angle = ~3.18 degrees
    const moveEvent1 = { 
        offsetX: 100, 
        offsetY: 15, 
        pressure: 0.8,
        getCoalescedEvents: () => [moveEvent1] 
    } as any;
    tool.onPointerMove(moveEvent1, ctx);

    let activeStroke = tool.getActiveStroke();
    expect(activeStroke).not.toBeNull();
    expect(activeStroke!.points.length).toBe(2);
    // Point 0 should be page coordinates: (0, 0)
    expect(activeStroke!.points[0][0]).toBe(0);
    expect(activeStroke!.points[0][1]).toBe(0);
    // Point 1 should be (100, 0) due to horizontal snap clamping y and page boundaries
    expect(activeStroke!.points[1][0]).toBe(100);
    expect(activeStroke!.points[1][1]).toBe(0);

    // 2. Vertical Snapping (angle ~86.8 degrees)
    tool.onPointerUp({} as PointerEvent, ctx);
    tool.onPointerDown(downEvent, ctx);

    // Move to (15, 100) -> pageX = 6.25, pageY = 112.5 (clamped to 100) -> angle = ~86.8 degrees
    const moveEvent2 = { 
        offsetX: 15, 
        offsetY: 100, 
        pressure: 0.8,
        getCoalescedEvents: () => [moveEvent2] 
    } as any;
    tool.onPointerMove(moveEvent2, ctx);

    activeStroke = tool.getActiveStroke();
    expect(activeStroke!.points[1][0]).toBe(0); // clamped x to startPoint.x (0)
    expect(activeStroke!.points[1][1]).toBe(100); // kept raw y (clamped to 100)

    // 3. Free angle drawing (angle 45 degrees)
    tool.onPointerUp({} as PointerEvent, ctx);
    tool.onPointerDown(downEvent, ctx);

    // Move to (100, 100) -> pageX = 112.5 (clamped to 100), pageY = 112.5 (clamped to 100)
    const moveEvent3 = { 
        offsetX: 100, 
        offsetY: 100, 
        pressure: 0.8,
        getCoalescedEvents: () => [moveEvent3] 
    } as any;
    tool.onPointerMove(moveEvent3, ctx);

    activeStroke = tool.getActiveStroke();
    expect(activeStroke!.points[1][0]).toBe(100);
    expect(activeStroke!.points[1][1]).toBe(100);
});
