import { Tool, ToolContext } from './Tool';
import { Stroke } from '../model/Stroke';
import { AddElementCommand } from '../engine/HistoryManager';
import { clientToPageCoords, snapPointToGrid, Vec2 } from '../utils/geometry';
import { ElementStyle } from '../model/ElementStyle';
import { PenProfileRegistry } from '../model/PenProfileRegistry';

/**
 * Highlighter tool — works like the pen tool but creates strokes
 * marked as highlights. The renderer will draw these using the 'multiply'
 * composite operation to blend over background text/ink.
 */
export class HighlighterTool implements Tool {
    name = 'highlighter';
    cursor = 'crosshair';

    private activeStroke: Stroke | null = null;
    private isDrawing: boolean = false;
    private startPoint: Vec2 | null = null;

    onPointerDown(e: PointerEvent, ctx: ToolContext): void {
        const dims = ctx.viewport.getPageDimensions();
        let pagePos = clientToPageCoords(e, ctx.canvas, dims.width, dims.height, ctx.viewport);
        if (ctx.page.snapToGrid) {
            pagePos = snapPointToGrid(pagePos, ctx.page.gridSize, ctx.viewport.getZoom());
        }
        const pressure = e.pressure > 0 ? e.pressure : 0.5;

        // Check if linear modifier is active from settings
        const isLinear = ctx.settings?.highlighterLinearModifier === true;
        if (isLinear) {
            this.startPoint = pagePos;
        } else {
            this.startPoint = null;
        }

        const size = Math.max(10, ctx.getToolSize ? ctx.getToolSize('highlighter') : (ctx.penStyle?.size ?? 16));
        const style: ElementStyle = {
            strokeColor: ctx.currentColor ?? ctx.penStyle?.color ?? '#FFE066',
            strokeWidth: size,
            strokePattern: ctx.currentPattern ?? 'solid',
            opacity: 0.4,
        };

        this.activeStroke = new Stroke(undefined, 'highlighter', style);
        this.activeStroke.profileId = ctx.activeProfileId;
        this.activeStroke.smoothingLevel = ctx.smoothingLevel;

        this.activeStroke.addPoint(pagePos.x, pagePos.y, pressure);
        this.isDrawing = true;
        ctx.requestRender();
    }

    onPointerMove(e: PointerEvent, ctx: ToolContext): void {
        if (!this.isDrawing || !this.activeStroke) return;

        const isLinear = ctx.settings?.highlighterLinearModifier === true;

        const events = e.getCoalescedEvents?.() ?? [e];
        const dims = ctx.viewport.getPageDimensions();

        if (isLinear && this.startPoint) {
            const lastEvent = events[events.length - 1];
            let pagePos = clientToPageCoords(lastEvent, ctx.canvas, dims.width, dims.height, ctx.viewport);
            if (ctx.page.snapToGrid) {
                pagePos = snapPointToGrid(pagePos, ctx.page.gridSize, ctx.viewport.getZoom());
            }
            const pressure = lastEvent.pressure > 0 ? lastEvent.pressure : 0.5;

            // Clear any middle points. Stroke should only contain [startPoint, currentPoint]
            const startPt = this.activeStroke.points[0];
            this.activeStroke.points = [startPt];

            let snappedX = pagePos.x;
            let snappedY = pagePos.y;

            const dx = pagePos.x - this.startPoint.x;
            const dy = pagePos.y - this.startPoint.y;

            if (dx !== 0 || dy !== 0) {
                let angle = Math.atan2(dy, dx) * (180 / Math.PI);
                if (angle < 0) {
                    angle += 360;
                }

                const distToHorizontal = Math.min(
                    Math.abs(angle - 0),
                    Math.abs(angle - 180),
                    Math.abs(angle - 360)
                );
                const distToVertical = Math.min(
                    Math.abs(angle - 90),
                    Math.abs(angle - 270)
                );

                if (distToHorizontal < 15) {
                    snappedY = this.startPoint.y;
                } else if (distToVertical < 15) {
                    snappedX = this.startPoint.x;
                }
            }

            this.activeStroke.addPoint(snappedX, snappedY, pressure);
        } else {
            for (const ce of events) {
                let pagePos = clientToPageCoords(ce, ctx.canvas, dims.width, dims.height, ctx.viewport);
                if (ctx.page.snapToGrid) {
                    pagePos = snapPointToGrid(pagePos, ctx.page.gridSize, ctx.viewport.getZoom());
                }
                const pressure = ce.pressure > 0 ? ce.pressure : 0.5;
                this.activeStroke.addPoint(pagePos.x, pagePos.y, pressure);
            }
        }

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
            this.startPoint = null;

            ctx.history.execute(
                new AddElementCommand(ctx.page, stroke)
            );
            ctx.requestFullRender();
            ctx.addRecentColor?.(stroke.style.strokeColor);
            ctx.requestSave();
        } else {
            this.activeStroke = null;
            this.isDrawing = false;
            this.startPoint = null;
            ctx.requestRender();
        }
    }

    onPointerCancel(_e: PointerEvent, ctx: ToolContext): void {
        this.activeStroke = null;
        this.isDrawing = false;
        this.startPoint = null;
        ctx.requestRender();
    }

    getActiveStroke(): Stroke | null {
        return this.activeStroke;
    }

    renderOverlay(canvasCtx: CanvasRenderingContext2D, toolCtx: ToolContext): void {
        if (this.activeStroke) {
            canvasCtx.save();
            canvasCtx.globalCompositeOperation = 'multiply';
            canvasCtx.globalAlpha = this.activeStroke.style.opacity;
            this.activeStroke.render(canvasCtx);
            canvasCtx.restore();
        }
    }

    onDeactivate?(): void {
        this.activeStroke = null;
        this.isDrawing = false;
        this.startPoint = null;
    }
}
