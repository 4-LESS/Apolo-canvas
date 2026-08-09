import { BoundingBox } from './BoundingBox';
import { Transform } from './Transform';
import { Point } from '../utils/geometry';

/**
 * Transient state for the current selection in working memory.
 * Never serialized to disk.
 */
export interface SelectionState {
    /** The IDs of all currently selected InkElements. */
    selectedIds: Set<string>;

    /**
     * A single unified bounding box that encloses ALL selected elements.
     * Must be recomputed every time selectedIds changes.
     * Strictly null-checked.
     */
    unifiedBounds: BoundingBox | null;

    /**
     * The accumulated transform delta applied interactively DURING a drag.
     * This is separate from the element's own Transform; it is merged on
     * pointer-up, not on pointer-move.
     */
    activeTransformDelta: Transform | null;

    /**
     * The lasso path being drawn RIGHT NOW (before the user lifts the stylus).
     * Array of raw Points. Cleared on pointer-up after hit testing.
     * Strictly null-checked.
     */
    pendingLassoPath: Point[] | null;

    /** Uniform/asymmetric scaling factors/anchor during active corner/edge resize. */
    activeResizeScale: { x: number; y: number } | null;
    activeResizeAnchor: Point | null;

    /** Current rotation angle in radians during active rotation. */
    activeRotationAngle: number;
}
