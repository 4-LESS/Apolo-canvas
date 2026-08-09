import { expect, test } from 'vitest';
import { BoundingBox, unionBounds, expandBounds, boundsIntersect, transformBounds } from './BoundingBox';
import { Transform } from './Transform';

test('unionBounds', () => {
    const b1 = new BoundingBox(0, 0, 10, 10);
    const b2 = new BoundingBox(5, 5, 10, 10);
    const union = unionBounds([b1, b2]);
    expect(union.x).toBe(0);
    expect(union.y).toBe(0);
    expect(union.width).toBe(15);
    expect(union.height).toBe(15);
});

test('expandBounds', () => {
    const b = new BoundingBox(0, 0, 10, 10);
    const expanded = expandBounds(b, 5);
    expect(expanded.x).toBe(-5);
    expect(expanded.y).toBe(-5);
    expect(expanded.width).toBe(20);
    expect(expanded.height).toBe(20);
});

test('boundsIntersect', () => {
    const b1 = new BoundingBox(0, 0, 10, 10);
    const b2 = new BoundingBox(5, 5, 10, 10);
    const b3 = new BoundingBox(20, 20, 10, 10);
    expect(boundsIntersect(b1, b2)).toBe(true);
    expect(boundsIntersect(b1, b3)).toBe(false);
});

test('transformBounds', () => {
    const b = new BoundingBox(0, 0, 10, 10);
    const t = new Transform(10, 10, 0, 2, 2);
    const transformed = transformBounds(b, t);
    expect(transformed.x).toBe(10);
    expect(transformed.y).toBe(10);
    expect(transformed.width).toBe(20);
    expect(transformed.height).toBe(20);
});
