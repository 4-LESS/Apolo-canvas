import { expect, test } from 'vitest';
import { SelectionManager } from './SelectionManager';
import { InkPage } from '../model/InkPage';
import { HistoryManager } from './HistoryManager';
import { Stroke } from '../model/Stroke';
import { ElementStyle } from '../model/ElementStyle';
import { ShapeElement } from '../model/ShapeElement';
import { ShapeRegistry } from '../shapes/ShapeRegistry';
import { RectangleShape } from '../shapes/definitions/RectangleShape';

test('SelectionManager lasso selection and bounds', () => {
    const page = new InkPage('page1');
    const history = new HistoryManager();
    const manager = new SelectionManager(page, history);

    const s1 = new Stroke('s1', 'pen');
    s1.addPoint(5, 5, 1);
    s1.addPoint(10, 10, 1);
    page.addElement(s1);

    const s2 = new Stroke('s2', 'pen');
    s2.addPoint(20, 20, 1);
    page.addElement(s2);

    manager.commitLassoSelection([
        { x: 0, y: 0 },
        { x: 15, y: 0 },
        { x: 15, y: 15 },
        { x: 0, y: 15 }
    ]);

    const state = manager.getState();
    expect(state.selectedIds.has('s1')).toBe(true);
    expect(state.selectedIds.has('s2')).toBe(false);
    expect(state.unifiedBounds).not.toBeNull();
});

test('SelectionManager move lifecycle', () => {
    const page = new InkPage('page1');
    const history = new HistoryManager();
    const manager = new SelectionManager(page, history);

    const s1 = new Stroke('s1', 'pen');
    s1.addPoint(10, 10, 1);
    page.addElement(s1);

    // Manually select for testing
    manager.commitLassoSelection([
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 }
    ]);

    manager.beginMove({ x: 0, y: 0 });
    manager.updateMove({ x: 10, y: 5 });
    
    expect(manager.getState().activeTransformDelta?.x).toBe(10);
    expect(manager.getState().activeTransformDelta?.y).toBe(5);

    manager.commitMove();

    expect(manager.getState().activeTransformDelta).toBeNull();
    expect(s1.points[0]).toEqual([20, 15, 1]);
});

test('SelectionManager clearSelection', () => {
    const page = new InkPage('page1');
    const history = new HistoryManager();
    const manager = new SelectionManager(page, history);

    const s1 = new Stroke('s1', 'pen');
    s1.addPoint(5, 5, 1);
    page.addElement(s1);

    manager.commitLassoSelection([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 }
    ]);

    expect(manager.getState().selectedIds.size).toBe(1);
    expect(manager.getState().unifiedBounds).not.toBeNull();

    manager.clearSelection();

    expect(manager.getState().selectedIds.size).toBe(0);
    expect(manager.getState().unifiedBounds).toBeNull();
});

test('SelectionManager commitMove calls fullRender on renderer', () => {
    const page = new InkPage('page1');
    const history = new HistoryManager();
    let fullRenderCalledCount = 0;
    const mockRenderer = {
        fullRender() {
            fullRenderCalledCount++;
        }
    };
    const manager = new SelectionManager(page, history, mockRenderer);

    const s1 = new Stroke('s1', 'pen');
    s1.addPoint(10, 10, 1);
    page.addElement(s1);

    manager.commitLassoSelection([
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 }
    ]);

    manager.beginMove({ x: 0, y: 0 });
    manager.updateMove({ x: 10, y: 5 });
    manager.commitMove();

    expect(fullRenderCalledCount).toBe(1);
});

test('SelectionManager beginLasso, extendLasso, and cancelMove', () => {
    const page = new InkPage('page1');
    const history = new HistoryManager();
    const manager = new SelectionManager(page, history);

    manager.beginLasso({ x: 1, y: 2 });
    expect(manager.getState().pendingLassoPath).toEqual([{ x: 1, y: 2 }]);

    manager.extendLasso({ x: 3, y: 4 });
    expect(manager.getState().pendingLassoPath).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4 }]);

    manager.beginMove({ x: 0, y: 0 });
    manager.updateMove({ x: 5, y: 5 });
    expect(manager.getState().activeTransformDelta?.x).toBe(5);

    manager.cancelMove();
    expect(manager.getState().activeTransformDelta).toBeNull();
});

test('SelectionManager corner resize lifecycle', () => {
    const page = new InkPage('page1');
    const history = new HistoryManager();
    const manager = new SelectionManager(page, history);

    const s1 = new Stroke('s1', 'pen', {
        strokeColor: '#1a1a1a',
        strokeWidth: 4,
        strokePattern: 'solid',
        opacity: 1.0
    });
    s1.addPoint(10, 10, 1);
    s1.addPoint(30, 30, 1);
    page.addElement(s1);

    // Select the stroke
    manager.commitLassoSelection([
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
        { x: 0, y: 40 }
    ]);

    const state = manager.getState();
    const originalBounds = state.unifiedBounds!.clone();

    // The bounds should be padded by the stroke width
    expect(originalBounds.x).toBe(6);
    expect(originalBounds.y).toBe(6);
    expect(originalBounds.width).toBe(28);
    expect(originalBounds.height).toBe(28);

    // Test getCornerHandleAt
    // Corner 0: (6, 6)
    expect(manager.getCornerHandleAt({ x: 7, y: 7 }, 1.0)).toBe(0);
    // Corner 2: (34, 34)
    expect(manager.getCornerHandleAt({ x: 33, y: 33 }, 1.0)).toBe(2);
    // Non-corner: (20, 20)
    expect(manager.getCornerHandleAt({ x: 20, y: 20 }, 1.0)).toBe(-1);

    // Start resize from Corner 0 (Top-Left), meaning anchor is Corner 2 (Bottom-Right) = (34, 34)
    const anchor = { x: 34, y: 34 };
    manager.beginResize(anchor);

    // Drag pointer to (0, 0)
    // C is Top-Left (6, 6). Anchor is (34, 34).
    // Original diagonal vector V = (6 - 34, 6 - 34) = (-28, -28)
    // Drag vector U = (0 - 34, 0 - 34) = (-34, -34)
    // Projection scale s = (-34*-28 + -34*-28) / ((-28)^2 + (-28)^2) = 1904 / 1568 = 1.2142857
    manager.updateResize({ x: 0, y: 0 }, anchor, originalBounds);
    expect(state.activeResizeScale!.x).toBeCloseTo(1.2142857);
    expect(state.activeResizeScale!.y).toBeCloseTo(1.2142857);

    // Commit resize
    manager.commitResize(originalBounds);

    expect(state.activeResizeScale).toBeNull();
    expect(state.activeResizeAnchor).toBeNull();

    // The stroke points should be scaled relative to (34, 34) by 1.2142857
    expect(s1.points[0][0]).toBeCloseTo(4.857, 2);
    expect(s1.points[0][1]).toBeCloseTo(4.857, 2);
    expect(s1.points[1][0]).toBeCloseTo(29.14, 2);
    expect(s1.points[1][1]).toBeCloseTo(29.14, 2);

    // Test undo/redo
    history.undo();
    expect(s1.points[0]).toEqual([10, 10, 1]);
    expect(s1.points[1]).toEqual([30, 30, 1]);

    history.redo();
    expect(s1.points[0][0]).toBeCloseTo(4.857, 2);
    expect(s1.points[0][1]).toBeCloseTo(4.857, 2);
    expect(s1.points[1][0]).toBeCloseTo(29.14, 2);
    expect(s1.points[1][1]).toBeCloseTo(29.14, 2);
});

test('SelectionManager Z-Order actions (bringSelectionToFront & sendSelectionToBack)', () => {
    const page = new InkPage('page1');
    const history = new HistoryManager();
    const manager = new SelectionManager(page, history);

    const s1 = new Stroke('s1', 'pen');
    s1.addPoint(5, 5, 1);
    page.addElement(s1);

    const s2 = new Stroke('s2', 'pen');
    s2.addPoint(20, 20, 1);
    page.addElement(s2);

    const s3 = new Stroke('s3', 'pen');
    s3.addPoint(30, 30, 1);
    page.addElement(s3);

    // Initial order: s1, s2, s3
    expect(page.elements.map(e => e.id)).toEqual(['s1', 's2', 's3']);

    // Select s2
    manager.selectElements([s2]);

    // Bring s2 to Front
    manager.bringSelectionToFront();
    expect(page.elements.map(e => e.id)).toEqual(['s1', 's3', 's2']);

    // Undo Z-order sorting
    history.undo();
    expect(page.elements.map(e => e.id)).toEqual(['s1', 's2', 's3']);

    // Redo Z-order sorting
    history.redo();
    expect(page.elements.map(e => e.id)).toEqual(['s1', 's3', 's2']);

    // Send s2 to Back
    manager.sendSelectionToBack();
    expect(page.elements.map(e => e.id)).toEqual(['s2', 's1', 's3']);

    // Undo send to back
    history.undo();
    expect(page.elements.map(e => e.id)).toEqual(['s1', 's3', 's2']);
});

test('SelectionManager shape lasso selection (corners and containment)', () => {
    ShapeRegistry.register(RectangleShape);

    const page = new InkPage('page1');
    const history = new HistoryManager();
    const manager = new SelectionManager(page, history);

    // Create a large rectangle shape at x: 100, y: 100 with width: 200, height: 200
    // Points array: start point (100, 100) and end point (300, 300)
    const rectShape = new ShapeElement(
        'rect-shape-1',
        'rectangle',
        [{ x: 100, y: 100 }, { x: 300, y: 300 }],
        {
            strokeColor: '#000000',
            strokeWidth: 4,
            strokePattern: 'solid',
            opacity: 1.0
        }
    );
    page.addElement(rectShape);

    // Test case 1: Lasso surrounds a corner (Top-Left corner at (100, 100))
    // Lasso is around (80, 80) to (120, 120)
    manager.commitLassoSelection([
        { x: 80, y: 80 },
        { x: 120, y: 80 },
        { x: 120, y: 120 },
        { x: 80, y: 120 }
    ]);
    expect(manager.getState().selectedIds.has('rect-shape-1')).toBe(true);

    // Clear selection
    manager.clearSelection();
    expect(manager.getState().selectedIds.size).toBe(0);

    // Test case 2: Lasso is entirely inside the rectangle (e.g. at center, coordinates around (200, 200))
    // Lasso is from (180, 180) to (220, 220).
    // The shape's raw points are (100, 100) and (300, 300) which are NOT inside this lasso.
    // The shape's corners (100, 100), (300, 100), (300, 300), (100, 300) are also NOT inside this lasso.
    // But the lasso bounding box is entirely contained within the shape's bounding box.
    manager.commitLassoSelection([
        { x: 180, y: 180 },
        { x: 220, y: 180 },
        { x: 220, y: 220 },
        { x: 180, y: 220 }
    ]);
    expect(manager.getState().selectedIds.has('rect-shape-1')).toBe(true);

    // Clear selection
    manager.clearSelection();

    // Test case 3: Lasso is completely outside the rectangle
    // Lasso is around (400, 400) to (450, 450)
    manager.commitLassoSelection([
        { x: 400, y: 400 },
        { x: 450, y: 400 },
        { x: 450, y: 450 },
        { x: 400, y: 450 }
    ]);
    expect(manager.getState().selectedIds.has('rect-shape-1')).toBe(false);
});

test('SelectionManager shape translation and resizing', () => {
    ShapeRegistry.register(RectangleShape);

    const page = new InkPage('page1');
    const history = new HistoryManager();
    const manager = new SelectionManager(page, history);

    const rectShape = new ShapeElement(
        'rect-shape-1',
        'rectangle',
        [{ x: 10, y: 10 }, { x: 50, y: 50 }],
        {
            strokeColor: '#000000',
            strokeWidth: 4,
            strokePattern: 'solid',
            opacity: 1.0
        }
    );
    page.addElement(rectShape);

    // Select shape
    manager.selectElements([rectShape]);

    // Test Translation
    manager.beginMove({ x: 0, y: 0 });
    manager.updateMove({ x: 15, y: 25 });
    manager.commitMove();

    // Verify coordinates are translated correctly as { x, y } (not NaN/undefined or pt[0])
    expect(rectShape.points[0].x).toBe(25); // 10 + 15
    expect(rectShape.points[0].y).toBe(35); // 10 + 25
    expect(rectShape.points[1].x).toBe(65); // 50 + 15
    expect(rectShape.points[1].y).toBe(75); // 50 + 25

    // Test Resizing
    // Anchor at (25, 35). Scale by 2.0
    manager.beginResize({ x: 25, y: 35 });
    manager.state.activeResizeScale = { x: 2.0, y: 2.0 };
    manager.commitResize(rectShape.getBoundingBox());

    // Verify coordinates are scaled correctly as { x, y }
    expect(rectShape.points[0].x).toBe(25);
    expect(rectShape.points[0].y).toBe(35);
    expect(rectShape.points[1].x).toBe(105);
    expect(rectShape.points[1].y).toBe(115);
});

test('SelectionManager lasso selects shape by its middle segment (interpolation)', () => {
    const page = new InkPage('page1');
    const history = new HistoryManager();
    const manager = new SelectionManager(page, history);

    // Create a long line from (0, 0) to (100, 100)
    const lineShape = new ShapeElement(
        'line-shape-1',
        'line',
        [{ x: 0, y: 0 }, { x: 100, y: 100 }],
        {
            strokeColor: '#000000',
            strokeWidth: 4,
            strokePattern: 'solid',
            opacity: 1.0
        }
    );
    page.addElement(lineShape);

    // Lasso surrounds ONLY the center of the line (coordinates around (50, 50))
    // Lasso is from (40, 40) to (60, 60)
    // The start (0, 0) and end (100, 100) are outside the lasso.
    manager.commitLassoSelection([
        { x: 30, y: 30 },
        { x: 70, y: 30 },
        { x: 70, y: 70 },
        { x: 30, y: 70 }
    ]);
    expect(manager.getState().selectedIds.has('line-shape-1')).toBe(true);

    // Clear selection
    manager.clearSelection();

    // Lasso is completely offset and does not intersect the line segment
    manager.commitLassoSelection([
        { x: 0, y: 60 },
        { x: 20, y: 60 },
        { x: 20, y: 80 },
        { x: 0, y: 80 }
    ]);
    expect(manager.getState().selectedIds.has('line-shape-1')).toBe(false);
});



