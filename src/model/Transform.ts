/** Serialized transform data for JSON persistence. */
export interface TransformData {
    x: number;
    y: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
}

/**
 * 2D affine transform for ink elements.
 * Supports translation, rotation, and non-uniform scale.
 */
export class Transform {
    x: number;
    y: number;
    rotation: number; // radians
    scaleX: number;
    scaleY: number;

    constructor(
        x: number = 0,
        y: number = 0,
        rotation: number = 0,
        scaleX: number = 1,
        scaleY: number = 1
    ) {
        this.x = x;
        this.y = y;
        this.rotation = rotation;
        this.scaleX = scaleX;
        this.scaleY = scaleY;
    }

    /** Create an identity transform (no transformation). */
    static identity(): Transform {
        return new Transform();
    }

    /** Deep clone this transform. */
    clone(): Transform {
        return new Transform(
            this.x,
            this.y,
            this.rotation,
            this.scaleX,
            this.scaleY
        );
    }

    /** Apply this transform to a point and return the result. */
    applyToPoint(px: number, py: number): { x: number; y: number } {
        // Scale
        let x = px * this.scaleX;
        let y = py * this.scaleY;

        // Rotate
        if (this.rotation !== 0) {
            const cos = Math.cos(this.rotation);
            const sin = Math.sin(this.rotation);
            const rx = x * cos - y * sin;
            const ry = x * sin + y * cos;
            x = rx;
            y = ry;
        }

        // Translate
        x += this.x;
        y += this.y;

        return { x, y };
    }

    /** Translate by a delta. */
    translate(dx: number, dy: number): void {
        this.x += dx;
        this.y += dy;
    }

    /** Check if this is an identity transform (no-op). */
    isIdentity(): boolean {
        return (
            this.x === 0 &&
            this.y === 0 &&
            this.rotation === 0 &&
            this.scaleX === 1 &&
            this.scaleY === 1
        );
    }

    /** Apply this transform to a Canvas2D rendering context. */
    applyToContext(ctx: CanvasRenderingContext2D): void {
        if (this.isIdentity()) return;
        ctx.translate(this.x, this.y);
        if (this.rotation !== 0) {
            ctx.rotate(this.rotation);
        }
        if (this.scaleX !== 1 || this.scaleY !== 1) {
            ctx.scale(this.scaleX, this.scaleY);
        }
    }

    /** Serialize to plain object for JSON storage. */
    serialize(): TransformData {
        return {
            x: this.x,
            y: this.y,
            rotation: this.rotation,
            scaleX: this.scaleX,
            scaleY: this.scaleY,
        };
    }

    /** Deserialize from plain object. */
    static deserialize(data: TransformData): Transform {
        return new Transform(
            data.x ?? 0,
            data.y ?? 0,
            data.rotation ?? 0,
            data.scaleX ?? 1,
            data.scaleY ?? 1
        );
    }
}
