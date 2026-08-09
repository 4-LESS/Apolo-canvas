/**
 * Manages the viewport (camera) for a page — handles pan, zoom,
 * and coordinate transformations between screen space and page space.
 *
 * The page is rendered at `fitScale * zoom` effective scale.
 * `fitScale` is computed so the page width fits the container width.
 */
export class ViewportManager {
    private offsetX: number = 0;
    private offsetY: number = 0;
    private zoom: number = 1.0;
    private minZoom: number = 0.2;
    private maxZoom: number = 5.0;
    private containerWidth: number;
    private containerHeight: number;
    private pageWidth: number;
    private pageHeight: number;
    private fitScale: number;

    constructor(
        containerWidth: number,
        containerHeight: number,
        pageWidth: number,
        pageHeight: number
    ) {
        this.containerWidth = containerWidth;
        this.containerHeight = containerHeight;
        this.pageWidth = pageWidth;
        this.pageHeight = pageHeight;
        this.fitScale = this.computeFitScale();
        this.fitToContainer();
    }

    /** Effective rendering scale. */
    private get effectiveScale(): number {
        return this.fitScale * this.zoom;
    }

    setPageDimensions(width: number, height: number): void {
        this.pageWidth = width;
        this.pageHeight = height;
        this.fitScale = this.computeFitScale();
    }

    /** Compute the scale factor that fits the page into the container. */
    private computeFitScale(fitBoth: boolean = false): number {
        if (this.pageWidth >= 50000) {
            return 1.0;
        }
        const padding = 20; // 10px each side
        const widthScale = (this.containerWidth - padding) / this.pageWidth;
        if (fitBoth) {
            const heightScale = (this.containerHeight - padding) / this.pageHeight;
            return Math.min(widthScale, heightScale);
        }
        return widthScale;
    }

    /**
     * Convert screen coordinates (relative to canvas element) to page coordinates.
     * This is essential for mapping pointer events to drawing positions.
     */
    screenToPage(screenX: number, screenY: number): { x: number; y: number } {
        const scale = this.effectiveScale;
        return {
            x: (screenX - this.offsetX) / scale,
            y: (screenY - this.offsetY) / scale,
        };
    }

    /** Convert page coordinates to screen coordinates. */
    pageToScreen(pageX: number, pageY: number): { x: number; y: number } {
        const scale = this.effectiveScale;
        return {
            x: pageX * scale + this.offsetX,
            y: pageY * scale + this.offsetY,
        };
    }

    /** Apply the viewport transform to a Canvas2D context. */
    applyTransform(ctx: CanvasRenderingContext2D): void {
        ctx.translate(this.offsetX, this.offsetY);
        ctx.scale(this.effectiveScale, this.effectiveScale);
    }

    /** Pan the viewport by a screen-space delta. */
    pan(deltaX: number, deltaY: number): void {
        this.offsetX += deltaX;
        this.offsetY += deltaY;
    }

    /** Zoom centered on a screen-space point. */
    zoomAt(screenX: number, screenY: number, factor: number): void {
        const newZoom = Math.max(
            this.minZoom,
            Math.min(this.maxZoom, this.zoom * factor)
        );
        if (newZoom === this.zoom) return;

        // Adjust offset so the point under the cursor stays fixed
        const oldScale = this.effectiveScale;
        this.zoom = newZoom;
        const newScale = this.effectiveScale;

        this.offsetX = screenX - ((screenX - this.offsetX) * newScale) / oldScale;
        this.offsetY = screenY - ((screenY - this.offsetY) * newScale) / oldScale;
    }

    /** Reset viewport to fit the page in the container, centered. */
    fitToContainer(fitBoth: boolean = false): void {
        this.zoom = 1.0;
        this.fitScale = this.computeFitScale(fitBoth);
        const scale = this.effectiveScale;

        if (this.pageWidth >= 50000) {
            this.offsetX = 0;
            this.offsetY = 0;
            return;
        }

        // Center the page horizontally
        this.offsetX = (this.containerWidth - this.pageWidth * scale) / 2;
        // Center the page vertically if fitBoth is true
        if (fitBoth) {
            this.offsetY = (this.containerHeight - this.pageHeight * scale) / 2;
        } else {
            this.offsetY = 10;
        }
    }

    /** Update container dimensions (e.g. on resize). */
    resize(width: number, height: number, fitBoth: boolean = false): void {
        this.containerWidth = width;
        this.containerHeight = height;
        this.fitScale = this.computeFitScale(fitBoth);
    }

    getZoom(): number {
        return this.zoom;
    }

    getOffset(): { x: number; y: number } {
        return { x: this.offsetX, y: this.offsetY };
    }

    getFitScale(): number {
        return this.fitScale;
    }

    getEffectiveScale(): number {
        return this.effectiveScale;
    }

    getPageDimensions(): { width: number; height: number } {
        return { width: this.pageWidth, height: this.pageHeight };
    }

    getContainerDimensions(): { width: number; height: number } {
        return { width: this.containerWidth, height: this.containerHeight };
    }
}
