import { InkElement } from './InkElement';
import { BoundingBox } from './BoundingBox';

/**
 * Buffer for clipboard operations (Copy/Cut/Paste).
 */
export interface ClipboardBuffer {
    /**
     * Deep copies of the InkElement objects at the time of the Cut/Copy action.
     */
    elements: InkElement[];

    /**
     * The unified bounding box of the copied elements at the time of copy.
     * Used to compute paste offset so repeated pastes don't perfectly overlap.
     */
    sourceBounds: BoundingBox;

    /**
     * Counter incremented on each paste, used to offset each paste by a
     * fixed delta (e.g. +10px per paste) so stacked copies are visible.
     */
    pasteCount: number;
}
