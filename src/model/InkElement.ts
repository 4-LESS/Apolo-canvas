import { Transform, TransformData } from './Transform';
import { BoundingBox } from './BoundingBox';

/** Discriminator for element types. */
export type ElementType = 'stroke' | 'shape';

/** Serialized element data for JSON persistence. */
export interface ElementData {
    type: ElementType;
    id: string;
    transform: TransformData;
    timestamp: number;
    url?: string;
    linkGroupId?: string;
    [key: string]: unknown;
}

/**
 * Abstract base class for all ink canvas elements.
 *
 * Every element on the canvas (stroke, shape, link, group) inherits from this.
 * Provides a uniform interface for hit-testing, rendering, serialization,
 * and transform-based manipulation — enabling selection, move, and
 * future lasso/group operations without architectural changes.
 */
export abstract class InkElement {
    /** Unique identifier. */
    id: string;
    /** Element type discriminator. */
    type: ElementType;
    /** 2D affine transform (position, rotation, scale). */
    transform: Transform;
    /** Timestamp of creation (ms since epoch). */
    timestamp: number;
    /** Rotation of the element in radians (primarily for shapes). */
    rotation?: number;
    /** Optional URL hyperlink bound to this element. */
    url?: string;
    /** Optional group ID for grouping hyperlinks linked simultaneously. */
    linkGroupId?: string;

    /** Cached bounding box — invalidated on transform/data change. */
    protected cachedBBox: BoundingBox | null = null;

    constructor(id: string, type: ElementType) {
        this.id = id;
        this.type = type;
        this.transform = Transform.identity();
        this.timestamp = Date.now();
    }

    /** Compute or return cached axis-aligned bounding box (in page space). */
    abstract getBoundingBox(): BoundingBox;

    /**
     * Test if a point (in page coordinates) hits this element.
     * @param px Page-space X coordinate.
     * @param py Page-space Y coordinate.
     * @param threshold Hit-test radius in page-space pixels.
     */
    abstract hitTest(px: number, py: number, threshold: number): boolean;

    /** Hit-test using canvas 2D context paths. */
    abstract hitTestCtx(ctx: CanvasRenderingContext2D, screenX: number, screenY: number): boolean;

    /** Render this element onto a Canvas 2D context (already in page space). */
    abstract render(ctx: CanvasRenderingContext2D): void;

    /** Serialize to a plain JSON-safe object. */
    abstract serialize(): ElementData;

    /** Invalidate any cached computations (call after transform or data changes). */
    invalidateCache(): void {
        this.cachedBBox = null;
    }
}
