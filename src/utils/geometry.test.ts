import { expect, test } from 'vitest';
import { pointInPolygon, strokesInsidePolygon, Point, clientToPageCoords, doLineSegmentsIntersect, bakeShapeToPolyline, getDistanceBetweenSegments } from './geometry';
import { Stroke } from '../model/Stroke';

test('pointInPolygon', () => {
    const polygon: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 }
    ];

    expect(pointInPolygon({ x: 5, y: 5 }, polygon)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, polygon)).toBe(false);
    expect(pointInPolygon({ x: -1, y: -1 }, polygon)).toBe(false);
});

test('strokesInsidePolygon', () => {
    const stroke1 = new Stroke('s1', 'pen');
    stroke1.addPoint(5, 5, 1);
    stroke1.addPoint(6, 6, 1);
    
    const stroke2 = new Stroke('s2', 'pen');
    stroke2.addPoint(15, 15, 1);
    
    const polygon: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 }
    ];
    
    const result = strokesInsidePolygon([stroke1, stroke2], polygon);
    expect(result).toEqual(['s1']);
});

test('clientToPageCoords clamping', () => {
    const canvas = {
        getBoundingClientRect: () => ({
            left: 10,
            top: 20,
            width: 100,
            height: 200,
        } as DOMRect),
        width: 100,
        height: 200,
    } as HTMLCanvasElement;

    // Out of bounds: x = -50 (relative to client, i.e., clientX = -40, so clientX - rect.left = -50)
    // clientX = -40 => rawX = (-40 - 10) * 1 = -50 => clamped to 0
    const event1 = { clientX: -40, clientY: 120 } as PointerEvent;
    const coords1 = clientToPageCoords(event1, canvas, 800, 1000);
    expect(coords1.x).toBe(0);
    expect(coords1.y).toBe(100);

    // Out of bounds: clientX = 1010 => screenX = 1000 => scaled = 1000 => clamped to pageWidth (800)
    const event2 = { clientX: 1010, clientY: 120 } as PointerEvent;
    const coords2 = clientToPageCoords(event2, canvas, 800, 1000);
    expect(coords2.x).toBe(800);
    expect(coords2.y).toBe(100);
});

test('doLineSegmentsIntersect', () => {
    expect(doLineSegmentsIntersect({x: 0, y: 0}, {x: 10, y: 10}, {x: 0, y: 10}, {x: 10, y: 0})).toBe(true);
    expect(doLineSegmentsIntersect({x: 0, y: 0}, {x: 0, y: 10}, {x: 2, y: 0}, {x: 2, y: 10})).toBe(false);
    expect(doLineSegmentsIntersect({x: 0, y: 0}, {x: 5, y: 5}, {x: 6, y: 6}, {x: 10, y: 10})).toBe(false);
    expect(doLineSegmentsIntersect({x: 0, y: 5}, {x: 10, y: 5}, {x: 5, y: 5}, {x: 5, y: 10})).toBe(true);
});

test('bakeShapeToPolyline', () => {
    const mockTransform = {
        applyToPoint: (x: number, y: number) => ({ x, y })
    };
    
    const rectShape = {
        shapeType: 'rectangle',
        points: [{x: 0, y: 0}, {x: 30, y: 30}],
        transform: mockTransform,
    };
    const rectBake = bakeShapeToPolyline(rectShape);
    expect(rectBake.length).toBeGreaterThan(10);
    expect(rectBake[0]).toEqual({x: 0, y: 0});
    expect(rectBake[rectBake.length - 1]).toEqual({x: 0, y: 0});

    const ellipseShape = {
        shapeType: 'ellipse',
        points: [{x: 0, y: 0}, {x: 30, y: 30}],
        transform: mockTransform,
    };
    const ellipseBake = bakeShapeToPolyline(ellipseShape);
    expect(ellipseBake.length).toBeGreaterThan(10);

    const triangleShape = {
        shapeType: 'triangle',
        points: [{x: 0, y: 0}, {x: 30, y: 30}],
        transform: mockTransform,
    };
    const triangleBake = bakeShapeToPolyline(triangleShape);
    expect(triangleBake.length).toBeGreaterThan(5);

    const roundRectShape = {
        shapeType: 'rounded-rectangle',
        points: [{x: 0, y: 0}, {x: 30, y: 30}],
        transform: mockTransform,
    };
    const roundRectBake = bakeShapeToPolyline(roundRectShape);
    expect(roundRectBake.length).toBeGreaterThan(10);

    const rotatedShape = {
        shapeType: 'rectangle',
        points: [{x: 0, y: 0}, {x: 10, y: 10}],
        transform: mockTransform,
        rotation: Math.PI / 2,
    };
    const rotatedBake = bakeShapeToPolyline(rotatedShape);
    expect(Math.round(rotatedBake[0].x)).toBe(10);
    expect(Math.round(rotatedBake[0].y) + 0).toBe(0);
});

test('getDistanceBetweenSegments', () => {
    // Intersecting
    expect(getDistanceBetweenSegments({x: 0, y: 0}, {x: 10, y: 10}, {x: 0, y: 10}, {x: 10, y: 0})).toBe(0);
    // Parallel (distance of 2)
    expect(getDistanceBetweenSegments({x: 0, y: 0}, {x: 0, y: 10}, {x: 2, y: 0}, {x: 2, y: 10})).toBeCloseTo(2);
    // End-to-end
    expect(getDistanceBetweenSegments({x: 0, y: 0}, {x: 0, y: 5}, {x: 0, y: 8}, {x: 0, y: 10})).toBeCloseTo(3);
});


