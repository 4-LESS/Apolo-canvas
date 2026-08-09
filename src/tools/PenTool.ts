import { Tool, ToolContext } from './Tool';
import { Stroke } from '../model/Stroke';
import { AddElementCommand } from '../engine/HistoryManager';
import { clientToPageCoords, snapPointToGrid } from '../utils/geometry';
import { ElementStyle } from '../model/ElementStyle';

/**
 * Pen tool — captures pressure-sensitive pointer input and creates strokes.
 *
 * This is the most performance-critical tool. During active drawing,
 * it processes coalesced pointer events and triggers immediate rendering
 * (no requestAnimationFrame delay) for minimum latency.
 */
export class PenTool implements Tool {
    name = 'pen';
    cursor = 'crosshair';

    private activeStroke: Stroke | null = null;
    private isDrawing: boolean = false;

    onPointerDown(e: PointerEvent, ctx: ToolContext): void {
        const dims = ctx.viewport.getPageDimensions();
        let pagePos = clientToPageCoords(e, ctx.canvas, dims.width, dims.height, ctx.viewport);
        if (ctx.page.snapToGrid) {
            pagePos = snapPointToGrid(pagePos, ctx.page.gridSize, ctx.viewport.getZoom());
        }
        // Stylus hardware pressure is in [0, 1].  Browsers report 0.5 for mice
        // and 0 before the first real reading; clamp to [0.01, 1] so a true
        // zero never collapses the stroke outline to an invisible line.
        const pressure = Math.min(1, Math.max(0.01, e.pressure > 0 ? e.pressure : 0.5));

        const size = ctx.getToolSize ? ctx.getToolSize('pen') : (ctx.penStyle?.size ?? 3);
        const style: ElementStyle = {
            strokeColor: ctx.currentColor ?? ctx.penStyle?.color ?? '#1a1a1a',
            strokeWidth: size,
            strokePattern: ctx.currentPattern ?? 'solid',
            opacity: 1.0,
        };

        this.activeStroke = new Stroke(undefined, 'pen', style);
        this.activeStroke.profileId = ctx.activeProfileId;
        this.activeStroke.smoothingLevel = ctx.smoothingLevel;

        this.activeStroke.addPoint(pagePos.x, pagePos.y, pressure);
        this.isDrawing = true;
        ctx.requestRender();
    }

    onPointerMove(e: PointerEvent, ctx: ToolContext): void {
        if (!this.isDrawing || !this.activeStroke) return;

        // Use coalesced events for maximum point density
        const events = e.getCoalescedEvents?.() ?? [e];
        const dims = ctx.viewport.getPageDimensions();

        for (const ce of events) {
            let pagePos = clientToPageCoords(ce, ctx.canvas, dims.width, dims.height, ctx.viewport);
            if (ctx.page.snapToGrid) {
                pagePos = snapPointToGrid(pagePos, ctx.page.gridSize, ctx.viewport.getZoom());
            }
            const pressure = Math.min(1, Math.max(0.01, ce.pressure > 0 ? ce.pressure : 0.5));
            this.activeStroke.addPoint(pagePos.x, pagePos.y, pressure);
        }

        // Render IMMEDIATELY for lowest latency — no rAF
        ctx.requestRender();
    }

    onPointerUp(_e: PointerEvent, ctx: ToolContext): void {
        if (!this.isDrawing || !this.activeStroke) return;

        if (this.activeStroke.points.length >= 1) {
            if (this.activeStroke.points.length === 1) {
                const pt = this.activeStroke.points[0];
                this.activeStroke.addPoint(pt[0] + 0.1, pt[1] + 0.1, pt[2]);
            }
            const stroke = this.activeStroke;
            this.activeStroke = null;
            this.isDrawing = false;

            ctx.history.execute(
                new AddElementCommand(ctx.page, stroke)
            );
            ctx.requestFullRender();
            ctx.addRecentColor?.(stroke.style.strokeColor);
            ctx.requestSave();
        } else {
            this.activeStroke = null;
            this.isDrawing = false;
            ctx.requestRender();
        }
    }

    /** Returns the stroke currently being drawn, or null. */
    getActiveStroke(): Stroke | null {
        return this.activeStroke;
    }

    /** Render the in-progress stroke on the overlay canvas. */
    renderOverlay(canvasCtx: CanvasRenderingContext2D, toolCtx: ToolContext): void {
        if (this.activeStroke) {
            this.activeStroke.render(canvasCtx);
        }
    }

    onDeactivate?(): void {
        // Cancel any in-progress stroke
        this.activeStroke = null;
        this.isDrawing = false;
    }
}
