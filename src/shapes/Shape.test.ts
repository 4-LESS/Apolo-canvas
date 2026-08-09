import { expect, test, vi } from 'vitest';
import { ShapeRegistry } from './ShapeRegistry';
import { LineShape } from './definitions/LineShape';
import { ArrowShape } from './definitions/ArrowShape';
import { RectangleShape } from './definitions/RectangleShape';
import { EllipseShape } from './definitions/EllipseShape';
import { TriangleShape } from './definitions/TriangleShape';
import { RoundedRectangleShape } from './definitions/RoundedRectangleShape';
import { ShapeElement } from '../model/ShapeElement';
import { Transform } from '../model/Transform';
import { snapPointToGrid } from '../utils/geometry';

test('ShapeRegistry registration and retrieval', () => {
    // Register all shapes
    ShapeRegistry.register(LineShape);
    ShapeRegistry.register(ArrowShape);
    ShapeRegistry.register(RectangleShape);
    ShapeRegistry.register(EllipseShape);
    ShapeRegistry.register(TriangleShape);
    ShapeRegistry.register(RoundedRectangleShape);

    expect(ShapeRegistry.get('line')).toBe(LineShape);
    expect(ShapeRegistry.get('arrow')).toBe(ArrowShape);
    expect(ShapeRegistry.get('rectangle')).toBe(RectangleShape);
    expect(ShapeRegistry.get('ellipse')).toBe(EllipseShape);
    expect(ShapeRegistry.get('triangle')).toBe(TriangleShape);
    expect(ShapeRegistry.get('rounded-rectangle')).toBe(RoundedRectangleShape);
    expect(ShapeRegistry.get('non-existent')).toBeUndefined();

    // Verify list contains shapes
    const all = ShapeRegistry.getAll();
    expect(all.some(s => s.id === 'line')).toBe(true);
    expect(all.some(s => s.id === 'arrow')).toBe(true);
    expect(all.some(s => s.id === 'rectangle')).toBe(true);
    expect(all.some(s => s.id === 'ellipse')).toBe(true);
    expect(all.some(s => s.id === 'triangle')).toBe(true);
    expect(all.some(s => s.id === 'rounded-rectangle')).toBe(true);
});

test('LineShape definition geometry and hit testing', () => {
    const pts = [{ x: 10, y: 10 }, { x: 50, y: 10 }];
    const style = {
        strokeColor: '#000000',
        strokeWidth: 4,
        strokePattern: 'solid' as const,
        opacity: 1.0
    };

    // Bounding Box (LineShape pads by 4)
    const bbox = LineShape.getBoundingBox(pts);
    expect(bbox.x).toBe(6);
    expect(bbox.y).toBe(6);
    expect(bbox.width).toBe(48);
    expect(bbox.height).toBe(8);

    // Hit Testing
    expect(LineShape.hitTest(pts, style, { x: 30, y: 10 }, 2)).toBe(true);
    expect(LineShape.hitTest(pts, style, { x: 30, y: 13 }, 2)).toBe(true); // distance is 3, tolerance + width/2 = 2 + 2 = 4
    expect(LineShape.hitTest(pts, style, { x: 30, y: 15 }, 2)).toBe(false); // distance is 5
});

test('ShapeElement delegates correctly', () => {
    // Make sure shapes are registered
    ShapeRegistry.register(LineShape);

    const pts = [{ x: 10, y: 10 }, { x: 50, y: 10 }];
    const style = {
        strokeColor: '#000000',
        strokeWidth: 4,
        strokePattern: 'solid' as const,
        opacity: 1.0
    };

    const el = new ShapeElement('el1', 'line', pts, style);
    
    // Test getBoundingBox
    const bbox = el.getBoundingBox();
    expect(bbox.x).toBe(6);
    expect(bbox.width).toBe(48);

    // Test hitTest
    expect(el.hitTest(30, 10, 2)).toBe(true);
    expect(el.hitTest(30, 25, 2)).toBe(false);
});

test('ShapeElement deserialization roundtrip', () => {
    const data = {
        type: 'shape',
        id: 'el2',
        shapeType: 'arrow',
        points: [{ x: 5, y: 5 }, { x: 25, y: 25 }],
        style: {
            strokeColor: '#ff0000',
            strokeWidth: 5,
            strokePattern: 'dashed',
            opacity: 0.9,
            fillColor: '#ffffff'
        },
        transform: Transform.identity().serialize(),
        timestamp: 99999
    };

    const el = ShapeElement.deserialize(data);
    expect(el.id).toBe('el2');
    expect(el.shapeType).toBe('arrow');
    expect(el.points).toEqual([{ x: 5, y: 5 }, { x: 25, y: 25 }]);
    expect(el.style.strokeColor).toBe('#ff0000');
    expect(el.style.strokeWidth).toBe(5);
    expect(el.style.strokePattern).toBe('dashed');
    expect(el.style.opacity).toBe(0.9);
    expect(el.style.fillColor).toBe('#ffffff');

    const serialized = el.serialize();
    expect(serialized.shapeType).toBe('arrow');
    expect(serialized.points).toEqual([{ x: 5, y: 5 }, { x: 25, y: 25 }]);
    expect(serialized.style.strokeColor).toBe('#ff0000');
});

test('Fallback handling for unknown shape type', () => {
    const el = new ShapeElement('el3', 'unknown-shape-type', [{ x: 10, y: 10 }, { x: 30, y: 30 }]);
    
    const bbox = el.getBoundingBox();
    expect(bbox).toBeDefined();
    // It should hit test based on bounding box
    expect(el.hitTest(20, 20, 2)).toBe(true);
});

test('Grid snapping math', () => {
    // Zoom < 1.5 -> snap interval = gridSize (10)
    expect(snapPointToGrid({ x: 4, y: 6 }, 5)).toEqual({ x: 5, y: 5 });
    expect(snapPointToGrid({ x: 12, y: 27 }, 10, 1.0)).toEqual({ x: 10, y: 30 });

    // Zoom >= 1.5 and < 3.0 -> snap interval = gridSize / 2 (5)
    expect(snapPointToGrid({ x: 12, y: 27 }, 10, 2.0)).toEqual({ x: 10, y: 25 });
    expect(snapPointToGrid({ x: 11, y: 28 }, 10, 1.5)).toEqual({ x: 10, y: 30 });

    // Zoom >= 3.0 -> snap interval = gridSize / 4 (2.5)
    expect(snapPointToGrid({ x: 12, y: 27 }, 10, 4.0)).toEqual({ x: 12.5, y: 27.5 });
    expect(snapPointToGrid({ x: 11, y: 28 }, 10, 3.0)).toEqual({ x: 10, y: 27.5 });
});

test('Closed Primitives geometry and hit testing fallbacks', () => {
    ShapeRegistry.register(RectangleShape);
    ShapeRegistry.register(EllipseShape);
    ShapeRegistry.register(TriangleShape);
    ShapeRegistry.register(RoundedRectangleShape);

    const pts = [{ x: 10, y: 20 }, { x: 50, y: 60 }];
    const style = {
        strokeColor: '#000000',
        strokeWidth: 4,
        strokePattern: 'solid' as const,
        opacity: 1.0
    };

    // Rectangle
    const rectBBox = RectangleShape.getBoundingBox(pts);
    expect(rectBBox.x).toBe(6); // 10 - pad(4)
    expect(rectBBox.y).toBe(16); // 20 - pad(4)
    expect(rectBBox.width).toBe(48); // (50-10) + pad*2
    expect(rectBBox.height).toBe(48);
    expect(RectangleShape.hitTest(pts, style, { x: 30, y: 40 }, 2)).toBe(true);

    // Ellipse
    const ellipseBBox = EllipseShape.getBoundingBox(pts);
    expect(ellipseBBox.x).toBe(6);
    expect(ellipseBBox.width).toBe(48);
    expect(EllipseShape.hitTest(pts, style, { x: 30, y: 40 }, 2)).toBe(true);

    // Triangle
    const triBBox = TriangleShape.getBoundingBox(pts);
    expect(triBBox.x).toBe(6);
    expect(triBBox.width).toBe(48);
    expect(TriangleShape.hitTest(pts, style, { x: 30, y: 40 }, 2)).toBe(true);

    // Rounded Rectangle
    const roundedBBox = RoundedRectangleShape.getBoundingBox(pts);
    expect(roundedBBox.x).toBe(6);
    expect(roundedBBox.width).toBe(48);
    expect(RoundedRectangleShape.hitTest(pts, style, { x: 30, y: 40 }, 2)).toBe(true);
});

test('ShapeElement preserves url on serialization/deserialization', () => {
    const el = new ShapeElement('el-url', 'rectangle', [{ x: 10, y: 10 }, { x: 30, y: 30 }]);
    el.url = '[[My Note]]';
    
    const serialized = el.serialize();
    expect(serialized.url).toBe('[[My Note]]');
    
    const deserialized = ShapeElement.deserialize(serialized);
    expect(deserialized.url).toBe('[[My Note]]');
});
