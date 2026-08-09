import { Tool, ToolContext } from './Tool';
import { DeleteElementsCommand, SplitElementCommand } from '../engine/HistoryManager';
import { Stroke } from '../model/Stroke';
import { ShapeElement } from '../model/ShapeElement';
import { getDistanceBetweenSegments, bakeShapeToPolyline, Vec2 } from '../utils/geometry';
import { getStrokePoints } from 'perfect-freehand';

/**
 * Eraser tool — removes strokes by detecting hits at the pointer position.
 * Supports segment erasing (chopping strokes/shapes at intersection point)
 * and whole stroke erasing.
 */
export class EraserTool implements Tool {
    name = 'eraser';
    cursor = 'none'; // We draw a custom eraser circle

    // Advanced Eraser Suite properties
    public eraseMode: 'segment' | 'whole' = 'segment';
    public scribbleToErase: boolean = false;
    public eraseHighlighterOnly: boolean = false;
    public autoDeselect: boolean = false;

    private isErasing: boolean = false;
    private lastX: number = 0;
    private lastY: number = 0;
    private lastPointer: Vec2 | null = null;
    private hoverPosition: Vec2 | null = null;

    onPointerDown(e: PointerEvent, ctx: ToolContext): void {
        this.isErasing = true;
        this.hoverPosition = null; // Clear hover state during active erasing
        const currentPointer = ctx.viewport.screenToPage(e.offsetX, e.offsetY);
        this.lastPointer = currentPointer;
        this.lastX = e.offsetX;
        this.lastY = e.offsetY;

        if (this.eraseMode === 'whole') {
            this.eraseWholeAt(currentPointer, ctx);
        } else if (this.eraseMode === 'segment') {
            this.eraseSegmentBetween(currentPointer, currentPointer, ctx);
        }
    }

    onPointerMove(e: PointerEvent, ctx: ToolContext): void {
        // Track position for the overlay cursor
        this.lastX = e.offsetX;
        this.lastY = e.offsetY;

        if (!this.isErasing) {
            const currentPointer = ctx.viewport.screenToPage(e.offsetX, e.offsetY);
            this.hoverPosition = currentPointer;
            ctx.requestRender();
            return;
        }

        this.hoverPosition = null; // Ensure hover is null during active draw

        // Process coalesced events for continuous erasure
        const events = e.getCoalescedEvents?.() ?? [e];
        for (const ce of events) {
            const currentPointer = ctx.viewport.screenToPage(ce.offsetX, ce.offsetY);
            if (!this.lastPointer) {
                this.lastPointer = currentPointer;
                continue;
            }

            if (this.eraseMode === 'whole') {
                this.eraseWholeAt(currentPointer, ctx);
                this.lastPointer = currentPointer;
            } else if (this.eraseMode === 'segment') {
                const hit = this.eraseSegmentBetween(this.lastPointer, currentPointer, ctx);
                this.lastPointer = currentPointer;
                if (hit) {
                    break;
                }
            }
        }

        ctx.requestRender();
    }

    onPointerUp(_e: PointerEvent, ctx: ToolContext): void {
        this.isErasing = false;
        this.lastPointer = null;
        this.hoverPosition = null;

        if (this.autoDeselect) {
            const engine = (ctx as any).engine;
            if (engine && typeof engine.setActiveTool === 'function') {
                engine.setActiveTool('pen');
            } else if (engine && typeof engine.setTool === 'function') {
                engine.setTool('pen');
            } else {
                ctx.requestToolSwitch('pen');
            }
        }
    }

    onPointerCancel?(_e: PointerEvent, _ctx: ToolContext): void {
        this.isErasing = false;
        this.lastPointer = null;
        this.hoverPosition = null;
    }

    onPointerLeave?(e: PointerEvent, ctx: ToolContext): void {
        this.hoverPosition = null;
        ctx.requestRender();
    }

    onDeactivate?(ctx: ToolContext): void {
        this.hoverPosition = null;
        this.isErasing = false;
        this.lastPointer = null;
    }

    /** Erase whole elements at a screen position. */
    private eraseWholeAt(pagePos: Vec2, ctx: ToolContext): void {
        const threshold = ctx.currentEraserWidth / ctx.viewport.getEffectiveScale();
        const hit = ctx.page.getElementAtPoint(pagePos.x, pagePos.y, threshold);
        if (hit) {
            ctx.history.execute(
                new DeleteElementsCommand(ctx.page, [hit.id])
            );
            ctx.requestFullRender();
            ctx.requestSave();
        }
    }

    /** Slice strokes/shapes intersecting the eraser path segment. */
    private eraseSegmentBetween(p1: Vec2, p2: Vec2, ctx: ToolContext): boolean {
        const scale = ctx.viewport.getEffectiveScale();
        const eraserPageRadius = (ctx.currentEraserWidth / 2) / scale;

        // Iterate backward through InkPage.elements
        for (let idx = ctx.page.elements.length - 1; idx >= 0; idx--) {
            const element = ctx.page.elements[idx];

            // Threshold accounts for both eraser width and stroke thickness in page units
            const elementStyle = (element as any).style;
            const threshold = eraserPageRadius + ((elementStyle?.strokeWidth ?? elementStyle?.width ?? 1) / 2);

            // Check bounding box overlap first for performance
            const elementBox = element.getBoundingBox();
            const expandedBox = elementBox.expand(threshold + 5);

            const segMinX = Math.min(p1.x, p2.x);
            const segMaxX = Math.max(p1.x, p2.x);
            const segMinY = Math.min(p1.y, p2.y);
            const segMaxY = Math.max(p1.y, p2.y);

            if (segMinX > expandedBox.right || segMaxX < expandedBox.x ||
                segMinY > expandedBox.bottom || segMaxY < expandedBox.y) {
                continue;
            }

            let testPoints: Vec2[] = [];
            if (element.type === 'stroke') {
                const stroke = element as Stroke;
                testPoints = stroke.points.map(pt => ({ x: pt[0], y: pt[1] }));
            } else if (element.type === 'shape') {
                const shape = element as ShapeElement;
                testPoints = bakeShapeToPolyline(shape);
            }

            if (testPoints.length < 2) continue;


            let entryIndex = -1;
            let exitIndex = -1;

            for (let i = 0; i < testPoints.length - 1; i++) {
                const dist = getDistanceBetweenSegments(p1, p2, testPoints[i], testPoints[i + 1]);
                if (dist <= threshold) {
                    if (entryIndex === -1) {
                        entryIndex = i;
                    }
                    exitIndex = i;
                } else {
                    if (entryIndex !== -1) {
                        break;
                    }
                }
            }

            if (entryIndex !== -1) {
                // Slicing Bounds
                let childAPoints: number[][] = [];
                let childBPoints: number[][] = [];

                if (element.type === 'stroke') {
                    const stroke = element as Stroke;
                    childAPoints = stroke.points.slice(0, entryIndex);
                    childBPoints = stroke.points.slice(exitIndex + 1);
                } else {
                    // shape element
                    childAPoints = testPoints.slice(0, entryIndex).map(p => [p.x, p.y, 0.5]);
                    childBPoints = testPoints.slice(exitIndex + 1).map(p => [p.x, p.y, 0.5]);
                }

                // If both child arrays have less than 2 points, delete the entire parent element
                if (childAPoints.length < 2 && childBPoints.length < 2) {
                    ctx.history.execute(
                        new DeleteElementsCommand(ctx.page, [element.id])
                    );
                    ctx.requestFullRender();
                    ctx.requestSave();
                    return true;
                }

                const tool = (element.type === 'stroke') ? (element as Stroke).tool : 'pen';
                const parentSmoothing = (element.type === 'stroke') ? ((element as Stroke).smoothingLevel ?? 0.3) : 0.3;

                const getSmoothedPoints = (pts: number[][]) => {
                    const strokePoints = getStrokePoints(pts, { streamline: parentSmoothing });
                    return strokePoints.map(sp => [
                        Math.round(sp.point[0] * 10) / 10,
                        Math.round(sp.point[1] * 10) / 10,
                        Math.round(sp.pressure * 100) / 100
                    ]);
                };

                let childA: Stroke | null = null;
                if (childAPoints.length >= 2) {
                    const styleA = JSON.parse(JSON.stringify((element as any).style));
                    if (element.type === 'shape') {
                        styleA.fillColor = 'transparent';
                    }
                    childA = new Stroke(undefined, tool, styleA);
                    childA.smoothingLevel = parentSmoothing;
                    childA.points = getSmoothedPoints(childAPoints);
                    childA.pointGeometryLocked = true;
                    childA.isSlicedEnd = true;
                    if (element.type === 'stroke') {
                        childA.isSlicedStart = (element as Stroke).isSlicedStart;
                        childA.isFromShape = (element as Stroke).isFromShape;
                    } else if (element.type === 'shape') {
                        childA.isFromShape = true;
                    }
                }

                let childB: Stroke | null = null;
                if (childBPoints.length >= 2) {
                    const styleB = JSON.parse(JSON.stringify((element as any).style));
                    if (element.type === 'shape') {
                        styleB.fillColor = 'transparent';
                    }
                    childB = new Stroke(undefined, tool, styleB);
                    childB.smoothingLevel = parentSmoothing;
                    childB.points = getSmoothedPoints(childBPoints);
                    childB.pointGeometryLocked = true;
                    childB.isSlicedStart = true;
                    if (element.type === 'stroke') {
                        childB.isSlicedEnd = (element as Stroke).isSlicedEnd;
                        childB.isFromShape = (element as Stroke).isFromShape;
                    } else if (element.type === 'shape') {
                        childB.isFromShape = true;
                    }
                }

                // Execute splitting/trimming command
                ctx.history.execute(
                    new SplitElementCommand(ctx.page, element, childA, childB, {
                        fullRender: () => ctx.requestFullRender()
                    })
                );
                ctx.requestFullRender();
                ctx.requestSave();
                return true;
            }
        }
        return false;
    }

    /** Render the eraser cursor circle. */
    renderOverlay(
        canvasCtx: CanvasRenderingContext2D,
        ctx: ToolContext
    ): void {
        const activePos = this.isErasing
            ? ctx.viewport.screenToPage(this.lastX, this.lastY)
            : this.hoverPosition;

        if (!activePos) return;

        canvasCtx.save();
        canvasCtx.beginPath();
        const zoom = ctx.viewport.getEffectiveScale();
        canvasCtx.arc(
            activePos.x,
            activePos.y,
            ctx.currentEraserWidth / 2 / zoom,
            0,
            Math.PI * 2
        );
        canvasCtx.strokeStyle = 'gray';
        canvasCtx.lineWidth = 1 / zoom;
        canvasCtx.stroke();
        canvasCtx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        canvasCtx.fill();
        canvasCtx.restore();
    }
}
