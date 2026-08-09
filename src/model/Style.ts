/** Style properties for pen and highlighter strokes. */
export interface StrokeStyle {
    color: string;    // hex color
    opacity: number;  // 0.0 – 1.0
    size: number;     // stroke width in page-space pixels
}

/** Style properties for geometric shapes (v0.3). */
export interface ShapeStyle {
    strokeColor: string;
    strokeWidth: number;
    fillColor: string; // 'transparent' for no fill
    opacity: number;
}

/** Default pen style — deep navy, full opacity, 4px width. */
export const DEFAULT_PEN_STYLE: StrokeStyle = {
    color: '#1a1a2e',
    opacity: 1.0,
    size: 4,
};

/** Default highlighter style — gold, low opacity, wide. */
export const DEFAULT_HIGHLIGHTER_STYLE: StrokeStyle = {
    color: '#ffd700',
    opacity: 0.35,
    size: 24,
};

/** Default eraser radius in page-space pixels. */
export const DEFAULT_ERASER_SIZE = 20;
