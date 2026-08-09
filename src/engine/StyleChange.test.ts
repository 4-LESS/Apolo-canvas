import { expect, test, vi } from 'vitest';
import { InkPage } from '../model/InkPage';
import { Stroke } from '../model/Stroke';
import { ShapeElement } from '../model/ShapeElement';
import { SelectionManager } from './SelectionManager';
import { HistoryManager, ChangeStyleCommand } from './HistoryManager';
import { ElementStyle } from '../model/ElementStyle';

test('ChangeStyleCommand execute and undo', () => {
    const page = new InkPage('page1');
    const stroke = new Stroke('s1', 'pen', {
        strokeColor: '#000000',
        strokeWidth: 3,
        strokePattern: 'solid',
        opacity: 1.0
    });
    const shape = new ShapeElement('sh1', 'line', [{ x: 0, y: 0 }, { x: 10, y: 10 }], {
        strokeColor: '#000000',
        strokeWidth: 4,
        strokePattern: 'solid',
        opacity: 1.0
    });

    const mockRenderer = { fullRender: vi.fn() };
    const updates = [
        {
            element: stroke,
            oldStyle: { ...stroke.style },
            newStyle: { ...stroke.style, strokeColor: '#ff0000', strokeWidth: 5 }
        },
        {
            element: shape,
            oldStyle: { ...shape.style },
            newStyle: { ...shape.style, strokePattern: 'dashed' as const }
        }
    ];

    const cmd = new ChangeStyleCommand(updates, mockRenderer);

    // Initial state check
    expect(stroke.style.strokeColor).toBe('#000000');
    expect(stroke.style.strokeWidth).toBe(3);
    expect(shape.style.strokePattern).toBe('solid');

    // Execute
    cmd.execute();
    expect(stroke.style.strokeColor).toBe('#ff0000');
    expect(stroke.style.strokeWidth).toBe(5);
    expect(shape.style.strokePattern).toBe('dashed');
    expect(mockRenderer.fullRender).toHaveBeenCalledTimes(1);

    // Undo
    cmd.undo();
    expect(stroke.style.strokeColor).toBe('#000000');
    expect(stroke.style.strokeWidth).toBe(3);
    expect(shape.style.strokePattern).toBe('solid');
    expect(mockRenderer.fullRender).toHaveBeenCalledTimes(2);
});

test('SelectionManager.applyStyleToSelection', () => {
    const page = new InkPage('page1');
    const stroke1 = new Stroke('s1', 'pen', {
        strokeColor: '#000000',
        strokeWidth: 3,
        strokePattern: 'solid',
        opacity: 1.0
    });
    const stroke2 = new Stroke('s2', 'pen', {
        strokeColor: '#000000',
        strokeWidth: 3,
        strokePattern: 'solid',
        opacity: 1.0
    });

    page.addElement(stroke1);
    page.addElement(stroke2);

    // Add points to make them have valid bounding boxes
    stroke1.addPoint(10, 10, 0.5);
    stroke1.addPoint(20, 20, 0.5);
    stroke2.addPoint(30, 30, 0.5);
    stroke2.addPoint(40, 40, 0.5);

    const history = new HistoryManager();
    const mockRenderer = { fullRender: vi.fn() };
    const selMgr = new SelectionManager(page, history, mockRenderer);

    // No selection -> should do nothing
    selMgr.applyStyleToSelection({ strokeColor: '#00ff00' });
    expect(stroke1.style.strokeColor).toBe('#000000');
    expect(history.canUndo()).toBe(false);

    // Select elements
    selMgr.selectElements([stroke1, stroke2]);
    const oldBounds = selMgr.getState().unifiedBounds?.clone();

    // Apply color change
    selMgr.applyStyleToSelection({ strokeColor: '#00ff00' });
    expect(stroke1.style.strokeColor).toBe('#00ff00');
    expect(stroke2.style.strokeColor).toBe('#00ff00');
    expect(history.canUndo()).toBe(true);

    // Apply size change (mutating size changes the bounding boxes slightly due to padding)
    selMgr.applyStyleToSelection({ strokeWidth: 10 });
    expect(stroke1.style.strokeWidth).toBe(10);
    expect(stroke2.style.strokeWidth).toBe(10);
    
    // Bounds should have recomputed
    const newBounds = selMgr.getState().unifiedBounds;
    expect(newBounds).not.toEqual(oldBounds);

    // Undo
    history.undo();
    expect(stroke1.style.strokeWidth).toBe(3);
    expect(stroke2.style.strokeWidth).toBe(3);

    history.undo();
    expect(stroke1.style.strokeColor).toBe('#000000');
    expect(stroke2.style.strokeColor).toBe('#000000');
});

test('SelectionManager.applyStyleToSelection filters out fillColor for stroke elements but applies to shapes', () => {
    const page = new InkPage('page1');
    const stroke = new Stroke('s1', 'pen', {
        strokeColor: '#000000',
        strokeWidth: 3,
        strokePattern: 'solid',
        opacity: 1.0
    });
    const shape = new ShapeElement('sh1', 'line', [{ x: 0, y: 0 }, { x: 10, y: 10 }], {
        strokeColor: '#000000',
        strokeWidth: 4,
        strokePattern: 'solid',
        opacity: 1.0
    });

    page.addElement(stroke);
    page.addElement(shape);

    stroke.addPoint(10, 10, 0.5);
    stroke.addPoint(20, 20, 0.5);

    const history = new HistoryManager();
    const mockRenderer = { fullRender: vi.fn() };
    const selMgr = new SelectionManager(page, history, mockRenderer);

    // Select both stroke and shape
    selMgr.selectElements([stroke, shape]);

    // Apply color change with fillColor
    selMgr.applyStyleToSelection({ strokeColor: '#ff0000', fillColor: '#00ff00' });

    // Verify stroke got strokeColor but ignores fillColor
    expect(stroke.style.strokeColor).toBe('#ff0000');
    expect(stroke.style.fillColor).toBeUndefined();

    // Verify shape got both strokeColor and fillColor
    expect(shape.style.strokeColor).toBe('#ff0000');
    expect(shape.style.fillColor).toBe('#00ff00');
});
