import { expect, test, vi } from 'vitest';
import { PenTool } from './PenTool';
import { InkPage } from '../model/InkPage';
import { HistoryManager } from '../engine/HistoryManager';
import { ToolContext } from './Tool';
import { ViewportManager } from '../engine/ViewportManager';
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
        eraserMode: 'segment',
        currentEraserWidth: 20,
        canvas: {} as HTMLCanvasElement,
        currentColor: '#FFE066',
        currentFillColor: 'transparent',
        currentSize: 16,
        currentPattern: 'solid',
        shiftHeld: false,
        smoothingLevel: 0.3,
        getToolSize: (toolName: string) => 5,
        requestRender: vi.fn(),
        requestFullRender: vi.fn(),
        requestSave: vi.fn(),
        requestToolSwitch: vi.fn(),
    };
}

test('PenTool creates and duplicates single-point stroke on pointer up', () => {
    const tool = new PenTool();
    const ctx = createMockContext();
    ctx.page.snapToGrid = false; // Disable snap to test exact coordinates

    // Simulate pointer down to create a single point
    const downEvent = { offsetX: 50, offsetY: 60, pressure: 0.8 } as PointerEvent;
    tool.onPointerDown(downEvent, ctx);

    const activeStroke = tool.getActiveStroke();
    expect(activeStroke).not.toBeNull();
    expect(activeStroke!.points.length).toBe(1);
    expect(activeStroke!.points[0]).toEqual([50, 62.5, 0.8]);

    // Simulate pointer up immediately (no movement / single dot)
    const upEvent = {} as PointerEvent;
    tool.onPointerUp(upEvent, ctx);

    // Verify it is saved in history
    expect(ctx.page.elements.length).toBe(1);
    const savedStroke = ctx.page.elements[0] as any;
    expect(savedStroke.points.length).toBe(2);
    // Microscopic offset check (50 + 0.1, 62.5 + 0.1)
    expect(savedStroke.points[0]).toEqual([50, 62.5, 0.8]);
    expect(savedStroke.points[1]).toEqual([50.1, 62.6, 0.8]);
    expect(tool.getActiveStroke()).toBeNull();
});

test('PenTool preserves 8-digit color alpha on new strokes', () => {
    const tool = new PenTool();
    const ctx = createMockContext();
    ctx.currentColor = '#11223380';

    const downEvent = { offsetX: 10, offsetY: 20, pressure: 0.5 } as PointerEvent;
    tool.onPointerDown(downEvent, ctx);

    const activeStroke = tool.getActiveStroke();
    expect(activeStroke).not.toBeNull();
    expect(activeStroke!.style.strokeColor).toBe('#11223380');
    expect(activeStroke!.serialize().style.strokeColor).toBe('#11223380');
});

test('PenTool uses updated thickness and smoothness values from context', () => {
    const tool = new PenTool();
    const ctx = createMockContext();
    
    // Simulate setting custom size 12 and smoothness 0.85
    let currentToolSize = 12;
    ctx.getToolSize = (t: string) => currentToolSize;
    ctx.smoothingLevel = 0.85;

    const downEvent = { offsetX: 10, offsetY: 20, pressure: 0.5 } as PointerEvent;
    tool.onPointerDown(downEvent, ctx);

    const stroke = tool.getActiveStroke();
    expect(stroke).not.toBeNull();
    expect(stroke!.style.strokeWidth).toBe(12);
    expect(stroke!.smoothingLevel).toBe(0.85);

    // Verify getOutline respects custom smoothingLevel
    const outline = stroke!.getOutline();
    expect(outline).toBeDefined();
    expect(Array.isArray(outline)).toBe(true);
});

