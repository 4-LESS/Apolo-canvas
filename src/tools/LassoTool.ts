import { Tool, ToolContext } from './Tool';
import { SelectionManager } from '../engine/SelectionManager';
import { Point, clientToPageCoords, distance } from '../utils/geometry';
import { SelectionMenu } from '../ui/SelectionMenu';
import { ClipboardManager } from '../engine/ClipboardManager';
import { BoundingBox } from '../model/BoundingBox';
import { ViewportManager } from '../engine/ViewportManager';
import { getElementCssWidth } from '../utils/dom';

enum LassoState {
    IDLE,
    LASSO_DRAWING,
    SELECTION_ACTIVE,
    INTERACTING_MOVE,
    INTERACTING_RESIZE,
    INTERACTING_ROTATE
}

function getRotationHandlePos(box: BoundingBox, zoom: number, canvas: HTMLCanvasElement, viewport: ViewportManager): Point {
    const effScale = viewport.getEffectiveScale();
    const offset = viewport.getOffset();
    const screenRight = box.right * effScale + offset.x;
    const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
    const screenLimit = getElementCssWidth(canvas, canvas.width / dpr || 800);
    
    const isExceededScreen = (screenRight + 45 > screenLimit);
    const pageWidth = viewport.getPageDimensions().width;
    const isExceededPage = (box.right + 45 > pageWidth);
    
    if (isExceededScreen || isExceededPage) {
        return { x: box.x - 45 / zoom, y: box.centerY };
    } else {
        return { x: box.right + 45 / zoom, y: box.centerY };
    }
}

/**
 * Tool for drawing a freehand lasso polygon to select elements,
 * and interactively moving or resizing the selection.
 */
export class LassoTool implements Tool {
    name = 'Lasso';
    cursor = 'crosshair';

    private state: LassoState = LassoState.IDLE;
    private selectionMenu: SelectionMenu | null = null;
    private clipboardManager: ClipboardManager | null = null;

    // For tap vs drag detection inside an active selection
    private tapOrigin: Point | null = null;
    private readonly TAP_SLOP_PX = 8;
    private isDragConfirmed = false;

    // For resize
    private activeCorner = -1;
    private resizeAnchor: Point | null = null;
    private resizeOriginBounds: BoundingBox | null = null;
    private resizeAxisLock: 'x' | 'y' | null = null;

    constructor(
        private selectionManager: SelectionManager,
        selectionMenu?: SelectionMenu,
        clipboardManager?: ClipboardManager
    ) {
        if (selectionMenu) this.selectionMenu = selectionMenu;
        if (clipboardManager) this.clipboardManager = clipboardManager;
    }

    setSelectionMenu(menu: SelectionMenu): void {
        this.selectionMenu = menu;
    }

    setClipboardManager(cm: ClipboardManager): void {
        this.clipboardManager = cm;
    }

    onPointerDown(e: PointerEvent, ctx: ToolContext): void | boolean {
        const dims = ctx.viewport.getPageDimensions();
        const pt = clientToPageCoords(e, ctx.canvas, dims.width, dims.height, ctx.viewport);
        const state = this.selectionManager.getState();

        // If it's a touch event and there is no active selection, ignore it immediately to allow panning.
        if (state.selectedIds.size === 0 && e.pointerType === 'touch') {
            return false;
        }

        if (state.selectedIds.size > 0) {
            const b = state.unifiedBounds!;
            const zoom = ctx.viewport.getZoom();

            // Priority 0: Floating Rotation Handle Hit-Test
            const rotationHandlePos = getRotationHandlePos(b, zoom, ctx.canvas, ctx.viewport);
            if (distance(pt, rotationHandlePos) < 36 / zoom) {
                this.state = LassoState.INTERACTING_ROTATE;
                this.selectionManager.beginRotate(pt);
                this.selectionMenu?.hide();
                this.cursor = 'crosshair';
                if (ctx.canvas && ctx.canvas.style) {
                    ctx.canvas.style.cursor = this.cursor;
                }
                ctx.requestFullRender();
                return;
            }

            // Priority 1: corner resize handle
            const corner = this.selectionManager.getCornerHandleAt(pt, zoom);
            if (corner !== -1) {
                this.state = LassoState.INTERACTING_RESIZE;
                this.activeCorner = corner;
                this.resizeAxisLock = null;
                const anchors = [
                    { x: b.right, y: b.bottom }, // Corner 0 (Top-Left) -> Bottom-Right anchor
                    { x: b.x,     y: b.bottom }, // Corner 1 (Top-Right) -> Bottom-Left anchor
                    { x: b.x,     y: b.y },      // Corner 2 (Bottom-Right) -> Top-Left anchor
                    { x: b.right, y: b.y }       // Corner 3 (Bottom-Left) -> Top-Right anchor
                ];
                this.resizeAnchor = anchors[corner];
                this.resizeOriginBounds = b.clone();
                this.selectionMenu?.hide();
                this.selectionManager.beginResize(this.resizeAnchor);
                this.cursor = (corner === 0 || corner === 2) ? 'nwse-resize' : 'nesw-resize';
                if (ctx.canvas && ctx.canvas.style) {
                    ctx.canvas.style.cursor = this.cursor;
                }
                ctx.requestFullRender();
                return;
            }

            // Priority 2: rotation donut (12px to 40px from corners)
            const corners = [
                { x: b.x,     y: b.y },
                { x: b.right, y: b.y },
                { x: b.right, y: b.bottom },
                { x: b.x,     y: b.bottom }
            ];
            const rotateMin = 12 / zoom;
            const rotateMax = 40 / zoom;
            let hitRotate = false;
            for (const cornerPt of corners) {
                const dist = distance(pt, cornerPt);
                if (dist >= rotateMin && dist <= rotateMax) {
                    hitRotate = true;
                    break;
                }
            }
            if (hitRotate) {
                this.state = LassoState.INTERACTING_ROTATE;
                this.selectionManager.beginRotate(pt);
                this.selectionMenu?.hide();
                this.cursor = 'crosshair';
                if (ctx.canvas && ctx.canvas.style) {
                    ctx.canvas.style.cursor = this.cursor;
                }
                ctx.requestFullRender();
                return;
            }

            // Priority 3: midpoint resize handles
            const midpoint = this.selectionManager.getMidpointHandleAt(pt, zoom);
            if (midpoint !== -1) {
                this.state = LassoState.INTERACTING_RESIZE;
                this.activeCorner = -1;
                const anchors = [
                    { x: b.x + b.width / 2, y: b.bottom }, // Midpoint 0 (Top) -> Bottom anchor
                    { x: b.x,               y: b.y + b.height / 2 }, // Midpoint 1 (Right) -> Left anchor
                    { x: b.x + b.width / 2, y: b.y },      // Midpoint 2 (Bottom) -> Top anchor
                    { x: b.right,           y: b.y + b.height / 2 }  // Midpoint 3 (Left) -> Right anchor
                ];
                this.resizeAnchor = anchors[midpoint];
                this.resizeOriginBounds = b.clone();
                this.resizeAxisLock = (midpoint === 0 || midpoint === 2) ? 'x' : 'y'; // lock X to resize vertically, lock Y to resize horizontally
                this.selectionMenu?.hide();
                this.selectionManager.beginResize(this.resizeAnchor);
                this.cursor = (midpoint === 0 || midpoint === 2) ? 'ns-resize' : 'ew-resize';
                if (ctx.canvas && ctx.canvas.style) {
                    ctx.canvas.style.cursor = this.cursor;
                }
                ctx.requestFullRender();
                return;
            }

            // Priority 4: inside bounds - begin tap/drag ambiguity resolution
            if (b.contains(pt.x, pt.y)) {
                this.state = LassoState.INTERACTING_MOVE;
                this.tapOrigin = pt;
                this.isDragConfirmed = false;
                this.selectionManager.beginMove(pt);
                this.selectionMenu?.hide();
                this.cursor = 'grabbing';
                if (ctx.canvas && ctx.canvas.style) {
                    ctx.canvas.style.cursor = this.cursor;
                }
                ctx.requestFullRender();
                return;
            }

            // Priority 5: outside bounds - clear selection
            this.selectionManager.clearSelection();
            this.selectionMenu?.hide();

            // If it's a touch event, clear selection but do NOT start drawing a lasso loop
            if (e.pointerType === 'touch') {
                this.state = LassoState.IDLE;
                return false; // Signifies to InputHandler to fallback to pan/zoom
            }
        }

        // No active selection or Pen click outside: start drawing a lasso
        this.state = LassoState.LASSO_DRAWING;
        this.cursor = 'crosshair';
        if (ctx.canvas && ctx.canvas.style) {
            ctx.canvas.style.cursor = this.cursor;
        }
        this.selectionManager.beginLasso(pt);
        ctx.requestRender();
    }

    onPointerMove(e: PointerEvent, ctx: ToolContext): void {
        const dims = ctx.viewport.getPageDimensions();
        const pt = clientToPageCoords(e, ctx.canvas, dims.width, dims.height, ctx.viewport);
        const state = this.selectionManager.getState();

        // Update cursor on hover when selection is active and not dragging
        if (this.state === LassoState.SELECTION_ACTIVE && ctx.canvas && ctx.canvas.style) {
            const zoom = ctx.viewport.getZoom();
            const b = state.unifiedBounds;
            if (b) {
                // Check floating rotation handle hover first
                const rotationHandlePos = getRotationHandlePos(b, zoom, ctx.canvas, ctx.viewport);
                if (distance(pt, rotationHandlePos) < 36 / zoom) {
                    ctx.canvas.style.cursor = 'crosshair';
                    return;
                }
            }
            const corner = this.selectionManager.getCornerHandleAt(pt, zoom);
            if (corner !== -1) {
                ctx.canvas.style.cursor = (corner === 0 || corner === 2) ? 'nwse-resize' : 'nesw-resize';
            } else {
                if (b) {
                    // Check rotation zone (12px to 40px from corners)
                    const corners = [
                        { x: b.x,     y: b.y },
                        { x: b.right, y: b.y },
                        { x: b.right, y: b.bottom },
                        { x: b.x,     y: b.bottom }
                    ];
                    const rotateMin = 12 / zoom;
                    const rotateMax = 40 / zoom;
                    let inRotateZone = false;
                    for (const cornerPt of corners) {
                        const dist = distance(pt, cornerPt);
                        if (dist >= rotateMin && dist <= rotateMax) {
                            inRotateZone = true;
                            break;
                        }
                    }
                    if (inRotateZone) {
                        ctx.canvas.style.cursor = 'crosshair';
                    } else {
                        // Check midpoint handles
                        const midpoint = this.selectionManager.getMidpointHandleAt(pt, zoom);
                        if (midpoint !== -1) {
                            ctx.canvas.style.cursor = (midpoint === 0 || midpoint === 2) ? 'ns-resize' : 'ew-resize';
                        } else if (b.contains(pt.x, pt.y)) {
                            ctx.canvas.style.cursor = 'grab';
                        } else {
                            ctx.canvas.style.cursor = 'crosshair';
                        }
                    }
                } else {
                    ctx.canvas.style.cursor = 'crosshair';
                }
            }
        }

        switch (this.state) {
            case LassoState.LASSO_DRAWING:
                this.selectionManager.extendLasso(pt);
                ctx.requestRender();
                break;

            case LassoState.INTERACTING_MOVE:
                if (!this.isDragConfirmed && this.tapOrigin) {
                    if (distance(pt, this.tapOrigin) < this.TAP_SLOP_PX) return; // still ambiguous
                    this.isDragConfirmed = true; // confirmed drag, not a tap
                }
                this.selectionManager.updateMove(pt);
                ctx.requestRender();
                break;

            case LassoState.INTERACTING_RESIZE:
                if (this.resizeAnchor && this.resizeOriginBounds) {
                    this.selectionManager.updateResize(pt, this.resizeAnchor, this.resizeOriginBounds, this.resizeAxisLock);
                }
                ctx.requestRender();
                break;

            case LassoState.INTERACTING_ROTATE:
                this.selectionManager.updateRotate(pt, ctx.shiftHeld);
                ctx.requestRender();
                break;
        }
    }

    onPointerUp(e: PointerEvent, ctx: ToolContext): void {
        const dims = ctx.viewport.getPageDimensions();
        const pt = clientToPageCoords(e, ctx.canvas, dims.width, dims.height, ctx.viewport);

        switch (this.state) {
            case LassoState.LASSO_DRAWING: {
                const path = this.selectionManager.getState().pendingLassoPath;
                if (!path || path.length < 3) {
                    this.selectionManager.clearLassoPath();
                    this.state = LassoState.IDLE;
                    this.cursor = 'crosshair';
                    if (ctx.canvas && ctx.canvas.style) {
                        ctx.canvas.style.cursor = this.cursor;
                    }
                    ctx.requestRender();
                    return;
                }
                this.selectionManager.commitLassoSelection(path);
                this.selectionManager.clearLassoPath();

                const sel = this.selectionManager.getState();
                if (sel.selectedIds.size > 0 && sel.unifiedBounds) {
                    this.state = LassoState.SELECTION_ACTIVE;
                    this.cursor = 'grab';
                    if (ctx.canvas && ctx.canvas.style) {
                        ctx.canvas.style.cursor = this.cursor;
                    }
                    this.selectionMenu?.showAboveBounds(sel.unifiedBounds, ctx.canvas, ctx.viewport);
                } else {
                    this.state = LassoState.IDLE;
                    this.cursor = 'crosshair';
                    if (ctx.canvas && ctx.canvas.style) {
                        ctx.canvas.style.cursor = this.cursor;
                    }
                }
                ctx.requestRender();
                break;
            }

            case LassoState.INTERACTING_MOVE: {
                if (!this.isDragConfirmed && this.tapOrigin) {
                    // It was a tap inside selection, not a drag - reshow the menu
                    this.selectionManager.cancelMove();
                    const sel = this.selectionManager.getState();
                    if (sel.unifiedBounds) {
                        this.selectionMenu?.showAboveBounds(sel.unifiedBounds, ctx.canvas, ctx.viewport);
                    }
                    this.state = LassoState.SELECTION_ACTIVE;
                    this.cursor = 'grab';
                    if (ctx.canvas && ctx.canvas.style) {
                        ctx.canvas.style.cursor = this.cursor;
                    }
                    this.tapOrigin = null;
                    ctx.requestRender();
                    return;
                }

                // It was a real drag - commit and reshow menu at new position
                this.selectionManager.commitMove();
                const sel = this.selectionManager.getState();
                if (sel.selectedIds.size > 0 && sel.unifiedBounds) {
                    this.state = LassoState.SELECTION_ACTIVE;
                    this.cursor = 'grab';
                    if (ctx.canvas && ctx.canvas.style) {
                        ctx.canvas.style.cursor = this.cursor;
                    }
                    this.selectionMenu?.showAboveBounds(sel.unifiedBounds, ctx.canvas, ctx.viewport);
                } else {
                    this.state = LassoState.IDLE;
                    this.cursor = 'crosshair';
                    if (ctx.canvas && ctx.canvas.style) {
                        ctx.canvas.style.cursor = this.cursor;
                    }
                }
                this.tapOrigin = null;
                this.isDragConfirmed = false;
                ctx.requestSave();
                ctx.requestRender();
                break;
            }

            case LassoState.INTERACTING_RESIZE: {
                if (this.resizeOriginBounds) {
                    this.selectionManager.commitResize(this.resizeOriginBounds);
                }
                const sel = this.selectionManager.getState();
                if (sel.selectedIds.size > 0 && sel.unifiedBounds) {
                    this.state = LassoState.SELECTION_ACTIVE;
                    this.cursor = 'grab';
                    if (ctx.canvas && ctx.canvas.style) {
                        ctx.canvas.style.cursor = this.cursor;
                    }
                    this.selectionMenu?.showAboveBounds(sel.unifiedBounds, ctx.canvas, ctx.viewport);
                } else {
                    this.state = LassoState.IDLE;
                    this.cursor = 'crosshair';
                    if (ctx.canvas && ctx.canvas.style) {
                        ctx.canvas.style.cursor = this.cursor;
                    }
                }
                this.activeCorner = -1;
                this.resizeAnchor = null;
                this.resizeOriginBounds = null;
                this.resizeAxisLock = null;
                ctx.requestSave();
                ctx.requestRender();
                break;
            }

            case LassoState.INTERACTING_ROTATE: {
                this.selectionManager.commitRotate();
                const sel = this.selectionManager.getState();
                if (sel.selectedIds.size > 0 && sel.unifiedBounds) {
                    this.state = LassoState.SELECTION_ACTIVE;
                    this.cursor = 'grab';
                    if (ctx.canvas && ctx.canvas.style) {
                        ctx.canvas.style.cursor = this.cursor;
                    }
                    this.selectionMenu?.showAboveBounds(sel.unifiedBounds, ctx.canvas, ctx.viewport);
                } else {
                    this.state = LassoState.IDLE;
                    this.cursor = 'crosshair';
                    if (ctx.canvas && ctx.canvas.style) {
                        ctx.canvas.style.cursor = this.cursor;
                    }
                }
                ctx.requestSave();
                ctx.requestRender();
                break;
            }
        }
    }

    onPointerCancel(e: PointerEvent, ctx: ToolContext): void {
        if (this.state === LassoState.INTERACTING_MOVE) {
            this.selectionManager.cancelMove();
        }
        if (this.state === LassoState.INTERACTING_RESIZE) {
            this.selectionManager.cancelResize();
        }
        if (this.state === LassoState.INTERACTING_ROTATE) {
            this.selectionManager.cancelRotate();
        }
        this.selectionManager.clearLassoPath();
        this.state = LassoState.IDLE;
        this.cursor = 'crosshair';
        if (ctx.canvas && ctx.canvas.style) {
            ctx.canvas.style.cursor = this.cursor;
        }
        this.tapOrigin = null;
        this.isDragConfirmed = false;
        this.activeCorner = -1;
        this.resizeAnchor = null;
        this.resizeOriginBounds = null;
        this.resizeAxisLock = null;
        ctx.requestRender();
    }

    onDeactivate(ctx: ToolContext): void {
        this.selectionManager.clearSelection();
        this.selectionMenu?.hide();
        this.state = LassoState.IDLE;
        this.cursor = 'crosshair';
        this.tapOrigin = null;
        this.isDragConfirmed = false;
        this.activeCorner = -1;
        this.resizeAnchor = null;
        this.resizeOriginBounds = null;
        this.resizeAxisLock = null;
        ctx.requestFullRender();
    }
}
