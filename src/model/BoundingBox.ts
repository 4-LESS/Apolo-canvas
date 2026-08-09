import { Transform } from './Transform';

/**
 * Axis-aligned bounding box for hit-testing and spatial queries.
 */
export class BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;

    constructor(x: number, y: number, width: number, height: number) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }

    get right(): number {
        return this.x + this.width;
    }

    get bottom(): number {
        return this.y + this.height;
    }

    get centerX(): number {
        return this.x + this.width / 2;
    }

    get centerY(): number {
        return this.y + this.height / 2;
    }

    /** Check if a point is inside this box. */
    contains(px: number, py: number): boolean {
        return (
            px >= this.x &&
            px <= this.right &&
            py >= this.y &&
            py <= this.bottom
        );
    }

    /** Check if this box intersects another box. */
    intersects(other: BoundingBox): boolean {
        return (
            this.x < other.right &&
            this.right > other.x &&
            this.y < other.bottom &&
            this.bottom > other.y
        );
    }

    /** Return the union (smallest enclosing box) of this and another box. */
    union(other: BoundingBox): BoundingBox {
        const x = Math.min(this.x, other.x);
        const y = Math.min(this.y, other.y);
        const right = Math.max(this.right, other.right);
        const bottom = Math.max(this.bottom, other.bottom);
        return new BoundingBox(x, y, right - x, bottom - y);
    }

    /** Return a new box expanded by `padding` on all sides. */
    expand(padding: number): BoundingBox {
        return new BoundingBox(
            this.x - padding,
            this.y - padding,
            this.width + padding * 2,
            this.height + padding * 2
        );
    }

    /** Deep clone. */
    clone(): BoundingBox {
        return new BoundingBox(this.x, this.y, this.width, this.height);
    }

    /**
     * Compute bounding box from an array of points.
     * Each point is `[x, y, ...]` (extra values ignored).
     */
    static fromPoints(points: number[][]): BoundingBox {
        if (points.length === 0) {
            return new BoundingBox(0, 0, 0, 0);
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const p of points) {
            if (p[0] < minX) minX = p[0];
            if (p[1] < minY) minY = p[1];
            if (p[0] > maxX) maxX = p[0];
            if (p[1] > maxY) maxY = p[1];
        }

        return new BoundingBox(minX, minY, maxX - minX, maxY - minY);
    }
}

/** Returns a BoundingBox that is the union of all provided boxes. */
export function unionBounds(boxes: BoundingBox[]): BoundingBox {
    if (boxes.length === 0) {
        return new BoundingBox(0, 0, 0, 0);
    }
    let result = boxes[0].clone();
    for (let i = 1; i < boxes.length; i++) {
        result = result.union(boxes[i]);
    }
    return result;
}

/** Returns a BoundingBox expanded uniformly by `padding` pixels on all sides. */
export function expandBounds(box: BoundingBox, padding: number): BoundingBox {
    return box.expand(padding);
}

/** Returns true if two BoundingBoxes intersect (for broad-phase filtering). */
export function boundsIntersect(a: BoundingBox, b: BoundingBox): boolean {
    return a.intersects(b);
}

/**
 * Applies a Transform (translate + rotate) to a BoundingBox, returning
 * the new axis-aligned bounding box of the transformed corners.
 */
export function transformBounds(box: BoundingBox, transform: Transform): BoundingBox {
    const corners = [
        { x: box.x, y: box.y },
        { x: box.right, y: box.y },
        { x: box.right, y: box.bottom },
        { x: box.x, y: box.bottom },
    ];
    
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    
    for (const p of corners) {
        const tp = transform.applyToPoint(p.x, p.y);
        if (tp.x < minX) minX = tp.x;
        if (tp.x > maxX) maxX = tp.x;
        if (tp.y < minY) minY = tp.y;
        if (tp.y > maxY) maxY = tp.y;
    }
    
    return new BoundingBox(minX, minY, maxX - minX, maxY - minY);
}
