// TODO: legacy engine-internal style shape; the document model uses ElementStyle.
// Migrate InkEngine/Tool internals to ElementStyle when touching engine internals.

/** Style properties for pen and highlighter strokes. */
export interface StrokeStyle {
    color: string;    // hex color
    opacity: number;  // 0.0 – 1.0
    size: number;     // stroke width in page-space pixels
}

/** Default pen style — deep navy, full opacity, 4px width. */
export const DEFAULT_PEN_STYLE: StrokeStyle = {
    color: '#1a1a2e',
    opacity: 1.0,
    size: 4,
};

/** Default eraser radius in page-space pixels. */
export const DEFAULT_ERASER_SIZE = 20;
