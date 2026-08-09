import { Tool, ToolContext } from '../tools/Tool';
import { ViewportManager } from './ViewportManager';
import { SelectionMenu } from '../ui/SelectionMenu';
import { PasteMenu } from '../ui/PasteMenu';
import { ClipboardManager } from './ClipboardManager';
import { clientToPageCoords, Point, distance } from '../utils/geometry';

/**
 * Handles all pointer and gesture input on the canvas.
 *
 * Input routing:
 *   pen    → always routes to active tool (drawing)
 *   touch  → pan/zoom gestures (unless pen is not active and tool allows touch)
 *   mouse  → routes to active tool
 *
 * Palm rejection: when pen is active, touch events are ignored.
 * Pinch zoom: two-finger touch gesture.
 */
export class InputHandler {
    private activeTool: Tool | null = null;
    private currentDragTool: Tool | null = null;
    private overrideTools: { lasso?: Tool; eraser?: Tool } = {};
    
    private toolContext: ToolContext;
    private viewport: ViewportManager;
    private selectionMenu: SelectionMenu | null = null;
    private pasteMenu: PasteMenu | null = null;
    private clipboardManager: ClipboardManager | null = null;
    private lastHoveredElementId: string | null = null;

    private penActive: boolean = false;
    private isToolActive: boolean = false;
    private isPanning: boolean = false;
    private lastPanX: number = 0;
    private lastPanY: number = 0;
    private isPointerDown: boolean = false;
    private readOnlyStartPoint: Point | null = null;

    // Pinch state
    private activePointers: Map<number, PointerEvent> = new Map();
    private pinchStartDist: number = 0;
    private pinchStartZoom: number = 1;
    private pinchCenterX: number = 0;
    private pinchCenterY: number = 0;

    // Long press context menu state
    private longPressTimer: any = null;
    private longPressOrigin: { clientX: number; clientY: number } | null = null;
    private readonly LONG_PRESS_MS = 500;
    private readonly LONG_PRESS_SLOP_PX = 28;

    // Long press lasso activation state. Origins are canvas-local CSS pixels.
    private lassoLongPressTimer: any = null;
    private lassoLongPressOrigin: Point | null = null;
    private lastPointerDownEvent: PointerEvent | null = null;
    private readonly LASSO_LONG_PRESS_MS = 500;
    private readonly LASSO_LONG_PRESS_SLOP_PX = 5;

    public shiftHeld: boolean = false;

    // Bound handlers for cleanup
    private boundPointerDown: (e: PointerEvent) => void;
    private boundPointerMove: (e: PointerEvent) => void;
    private boundPointerUp: (e: PointerEvent) => void;
    private boundPointerCancel: (e: PointerEvent) => void;
    private boundPointerLeave: (e: PointerEvent) => void;
    private boundWheel: (e: WheelEvent) => void;
    private boundKeyDown: (e: KeyboardEvent) => void;
    private boundKeyUp: (e: KeyboardEvent) => void;

    constructor(
        private canvas: HTMLCanvasElement,
        toolContext: ToolContext,
        viewport: ViewportManager,
        private engine?: any
    ) {
        this.toolContext = toolContext;
        this.viewport = viewport;

        this.boundPointerDown = this.onPointerDown.bind(this);
        this.boundPointerMove = this.onPointerMove.bind(this);
        this.boundPointerUp = this.onPointerUp.bind(this);
        this.boundPointerCancel = this.onPointerCancel.bind(this);
        this.boundPointerLeave = this.onPointerLeave.bind(this);
        this.boundWheel = this.onWheel.bind(this);
        this.boundKeyDown = this.onKeyDown.bind(this);
        this.boundKeyUp = this.onKeyUp.bind(this);
    }

    setMenus(selectionMenu: SelectionMenu, pasteMenu: PasteMenu): void {
        this.selectionMenu = selectionMenu;
        this.pasteMenu     = pasteMenu;
    }

    setClipboardManager(cm: ClipboardManager): void {
        this.clipboardManager = cm;
    }

    /** Set the active drawing tool. */
    setTool(tool: Tool): void {
        this.activeTool = tool;
        this.canvas.style.cursor = tool.cursor;
        if (this.canvas.parentElement) {
            this.canvas.parentElement.style.cursor = tool.cursor;
        }
    }

    /** Register override tools for hardware buttons. */
    setOverrideTools(lasso: Tool, eraser: Tool): void {
        this.overrideTools.lasso = lasso;
        this.overrideTools.eraser = eraser;
    }

    /** Register all event listeners on the canvas. */
    attach(): void {
        this.canvas.addEventListener('pointerdown', this.boundPointerDown);
        this.canvas.addEventListener('pointermove', this.boundPointerMove);
        this.canvas.addEventListener('pointerup', this.boundPointerUp);
        this.canvas.addEventListener('pointercancel', this.boundPointerCancel);
        this.canvas.addEventListener('pointerleave', this.boundPointerLeave);
        this.canvas.addEventListener('wheel', this.boundWheel, {
            passive: false,
        });

        // Keyboard for undo/redo is handled by the parent
        document.addEventListener('keydown', this.boundKeyDown);
        document.addEventListener('keyup', this.boundKeyUp);
    }

    /** Remove all event listeners. */
    detach(): void {
        this.canvas.removeEventListener('pointerdown', this.boundPointerDown);
        this.canvas.removeEventListener('pointermove', this.boundPointerMove);
        this.canvas.removeEventListener('pointerup', this.boundPointerUp);
        this.canvas.removeEventListener('pointercancel', this.boundPointerCancel);
        this.canvas.removeEventListener('pointerleave', this.boundPointerLeave);
        this.canvas.removeEventListener('wheel', this.boundWheel);
        document.removeEventListener('keydown', this.boundKeyDown);
        document.removeEventListener('keyup', this.boundKeyUp);
    }

    private onPointerDown(e: PointerEvent): void {
        this.isPointerDown = true;
        if (this.engine?.triggerStrokeStart) {
            this.engine.triggerStrokeStart();
        }
        e.preventDefault();
        this.canvas.setPointerCapture(e.pointerId);
        this.activePointers.set(e.pointerId, e);

        this.selectionMenu?.hide();
        this.pasteMenu?.hide();
        this.cancelLongPress();
        this.cancelLassoLongPress();
        this.checkAndStartLongPress(e);

        if (this.engine?.isReadOnly) {
            this.readOnlyStartPoint = { x: e.clientX, y: e.clientY };

            if (e.pointerType === 'touch') {
                if (this.activePointers.size >= 2) {
                    this.startPinch();
                } else {
                    this.isPanning = true;
                    this.lastPanX = e.clientX;
                    this.lastPanY = e.clientY;
                }
            } else if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
                this.isPanning = true;
                this.lastPanX = e.clientX;
                this.lastPanY = e.clientY;
            }
            return;
        }

        if (e.pointerType === 'pen' || (e.pointerType as string) === 'eraser') {
            // Hardware button overrides
            let toolToUse = this.activeTool;
            if ((e.pointerType as string) === 'eraser' || (e.buttons & 32) !== 0) {
                toolToUse = this.overrideTools.eraser || this.activeTool;
            } else if ((e.buttons & 2) !== 0) {
                toolToUse = this.overrideTools.lasso || this.activeTool;
            }
            
            this.currentDragTool = toolToUse;
            this.penActive = true;
            this.isToolActive = true;

            // Start long press timer if it's the stylus tip (buttons === 1) and engine is available
            if (e.pointerType === 'pen' && e.buttons === 1 && this.engine) {
                this.lastPointerDownEvent = e;
                this.lassoLongPressOrigin = this.getCanvasLocalPoint(e);

                this.lassoLongPressTimer = window.setTimeout(() => {
                    this.lassoLongPressTimer = null;
                    this.lassoLongPressOrigin = null;

                    // Switch engine active tool to lasso
                    this.engine.setTool('lasso');

                    // Haptic feedback
                    if (navigator.vibrate) {
                        try {
                            navigator.vibrate(40);
                        } catch (err) {
                            // ignore vibration errors in sandboxed webviews
                        }
                    }

                    // Start the lasso path using lasso tool
                    this.currentDragTool = this.activeTool; // activeTool is now lasso
                    this.currentDragTool?.onPointerDown(this.lastPointerDownEvent!, this.toolContext);
                }, this.LASSO_LONG_PRESS_MS);
            } else {
                toolToUse?.onPointerDown(e, this.toolContext);
            }
        } else if (e.pointerType === 'touch') {
            if (this.penActive) {
                // Palm rejection: ignore touch while pen is active
                return;
            }

            // Check if active tool is Lasso and can handle the touch (i.e. has active selection and hit tests successfully)
            let handledByTool = false;
            if (this.activeTool && this.activeTool.name === 'Lasso') {
                const res = this.activeTool.onPointerDown(e, this.toolContext);
                if (res !== false) {
                    handledByTool = true;
                    this.currentDragTool = this.activeTool;
                    this.isToolActive = true;
                }
            }

            if (!handledByTool) {
                if (this.activePointers.size >= 2) {
                    // Two fingers: start pinch zoom
                    this.startPinch();
                } else {
                    // Single finger: start pan
                    this.isPanning = true;
                    this.lastPanX = e.clientX;
                    this.lastPanY = e.clientY;
                }
            }
        } else if (e.pointerType === 'mouse') {
            // Mouse: draw with tool
            this.currentDragTool = this.activeTool;
            this.isToolActive = true;
            this.currentDragTool?.onPointerDown(e, this.toolContext);
        }
    }

    private onPointerMove(e: PointerEvent): void {
        e.preventDefault();
        this.activePointers.set(e.pointerId, e);

        // Cancel long-press for context menu if pointer moved more than the slop threshold
        if (this.longPressOrigin) {
            const dx = e.clientX - this.longPressOrigin.clientX;
            const dy = e.clientY - this.longPressOrigin.clientY;
            if (Math.sqrt(dx * dx + dy * dy) > this.LONG_PRESS_SLOP_PX) {
                this.cancelLongPress();
            }
        }

        // Cancel long-press for lasso if pointer moved more than the slop threshold
        if (this.lassoLongPressTimer !== null && this.lassoLongPressOrigin !== null) {
            const canvasPos = this.getCanvasLocalPoint(e);
            const dist = distance(canvasPos, this.lassoLongPressOrigin);

            if (dist > this.LASSO_LONG_PRESS_SLOP_PX) {
                this.cancelLassoLongPress();
                // Retroactively send the original pointerdown to the tool,
                // then send this move event, so the stroke starts from the first touch point.
                this.currentDragTool?.onPointerDown(this.lastPointerDownEvent!, this.toolContext);
                this.currentDragTool?.onPointerMove(e, this.toolContext);
                return;
            }
            // Still within threshold — do not forward to any tool yet.
            return;
        }

        if (this.engine?.isReadOnly) {
            const element = this.getElementWithUrlAtPointer(e);
            const hasUrl = !!element;

            if (hasUrl) {
                this.canvas.style.cursor = 'pointer';
                if (this.canvas.parentElement) {
                    this.canvas.parentElement.style.cursor = 'none';
                    if (this.canvas.parentElement.parentElement) {
                        this.canvas.parentElement.parentElement.style.cursor = 'none';
                    }
                }
            } else {
                this.canvas.style.cursor = 'default';
                if (this.canvas.parentElement) {
                    this.canvas.parentElement.style.cursor = 'default';
                    if (this.canvas.parentElement.parentElement) {
                        this.canvas.parentElement.parentElement.style.cursor = 'default';
                    }
                }
            }

            if (hasUrl && element) {
                if (element.id !== this.lastHoveredElementId) {
                    this.lastHoveredElementId = element.id;
                    this.engine?.triggerHoverLink?.(element.url, e);
                }
            } else {
                this.lastHoveredElementId = null;
            }

            if (e.pointerType === 'touch' && this.activePointers.size >= 2) {
                this.handlePinch();
            } else if (this.isPanning) {
                const dx = e.clientX - this.lastPanX;
                const dy = e.clientY - this.lastPanY;
                this.viewport.pan(dx, dy);
                this.lastPanX = e.clientX;
                this.lastPanY = e.clientY;
                this.toolContext.requestFullRender();
            }
            return;
        }

        // While a finger long-press is still eligible for paste, do not pan on jitter.
        if (this.longPressTimer !== null && e.pointerType === 'touch') {
            return;
        }

        if (e.pointerType === 'pen' || (e.pointerType as string) === 'eraser' || e.pointerType === 'mouse') {
            if (this.isToolActive) {
                this.currentDragTool?.onPointerMove(e, this.toolContext);
            } else {
                this.activeTool?.onPointerMove(e, this.toolContext);
            }
        } else if (e.pointerType === 'touch') {
            if (this.penActive) return; // Palm rejection

            if (this.isToolActive) {
                this.currentDragTool?.onPointerMove(e, this.toolContext);
            } else if (this.activePointers.size >= 2) {
                this.handlePinch();
            } else if (this.isPanning) {
                if (this.longPressTimer !== null) {
                    return;
                }
                const dx = e.clientX - this.lastPanX;
                const dy = e.clientY - this.lastPanY;
                this.viewport.pan(dx, dy);
                this.lastPanX = e.clientX;
                this.lastPanY = e.clientY;
                this.toolContext.requestFullRender();
            }
        }
    }

    private onPointerUp(e: PointerEvent): void {
        this.isPointerDown = false;
        if (typeof this.canvas.hasPointerCapture === 'function' && this.canvas.hasPointerCapture(e.pointerId)) {
            this.canvas.releasePointerCapture(e.pointerId);
        }
        this.activePointers.delete(e.pointerId);
        this.cancelLongPress();

        if (this.engine?.isReadOnly) {
            if (this.readOnlyStartPoint) {
                const dx = e.clientX - this.readOnlyStartPoint.x;
                const dy = e.clientY - this.readOnlyStartPoint.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= 8) { // 8px tap threshold
                    const element = this.getElementWithUrlAtPointer(e);
                    if (element && element.url) {
                        this.engine.triggerNavigateLink(element.url);
                    }
                }
            }
            this.readOnlyStartPoint = null;
            this.isPanning = false;
            this.cancelLassoLongPress();
            return;
        }

        if (this.lassoLongPressTimer !== null) {
            // Stylus lifted before the timer fired — it was a tap, not a hold.
            // Cancel the timer and dispatch normally as a very short stroke or tap.
            this.cancelLassoLongPress();
            this.currentDragTool?.onPointerDown(this.lastPointerDownEvent!, this.toolContext);
            this.currentDragTool?.onPointerUp(e, this.toolContext);
            this.isToolActive = false;
            this.currentDragTool = null;
            return;
        }

        if (e.pointerType === 'pen' || (e.pointerType as string) === 'eraser') {
            if (this.isToolActive) {
                this.currentDragTool?.onPointerUp(e, this.toolContext);
                this.isToolActive = false;
                this.currentDragTool = null;
            }
            // Reset pen active after a short delay to allow touch to work again
            setTimeout(() => {
                if (this.activePointers.size === 0) {
                    this.penActive = false;
                }
            }, 300);
        } else if (e.pointerType === 'mouse') {
            if (this.isToolActive) {
                this.currentDragTool?.onPointerUp(e, this.toolContext);
                this.isToolActive = false;
                this.currentDragTool = null;
            }
        } else if (e.pointerType === 'touch') {
            if (this.isToolActive) {
                this.currentDragTool?.onPointerUp(e, this.toolContext);
                this.isToolActive = false;
                this.currentDragTool = null;
            }
            this.isPanning = false;
        }
    }

    private onPointerCancel(e: PointerEvent): void {
        this.isPointerDown = false;
        if (typeof this.canvas.hasPointerCapture === 'function' && this.canvas.hasPointerCapture(e.pointerId)) {
            this.canvas.releasePointerCapture(e.pointerId);
        }
        this.activePointers.delete(e.pointerId);
        this.cancelLongPress();
        this.cancelLassoLongPress();

        if (this.engine?.isReadOnly) {
            this.readOnlyStartPoint = null;
            this.isPanning = false;
            return;
        }

        if (this.isToolActive) {
            if (this.currentDragTool?.onPointerCancel) {
                this.currentDragTool.onPointerCancel(e, this.toolContext);
            } else {
                this.currentDragTool?.onPointerUp(e, this.toolContext);
            }
            this.isToolActive = false;
            this.currentDragTool = null;
        }
        this.isPanning = false;
    }

    private onPointerLeave(event: PointerEvent): void {
        if (this.engine?.isReadOnly) {
            this.isPointerDown = false;
            this.isPanning = false;
            this.readOnlyStartPoint = null;
            this.cancelLongPress();
            this.cancelLassoLongPress();
            return;
        }

        this.activeTool?.onPointerLeave?.(event, this.toolContext);

        if (!this.isPointerDown) return;
        if (typeof this.canvas.hasPointerCapture === 'function' && this.canvas.hasPointerCapture(event.pointerId)) {
            this.canvas.releasePointerCapture(event.pointerId);
        }

        // Finalize the stroke cleanly at the last valid in-bounds position,
        // exactly as if the user had lifted the stylus.
        if (this.isToolActive && this.currentDragTool) {
            this.currentDragTool.onPointerUp(event, this.toolContext);
            this.isToolActive = false;
            this.currentDragTool = null;
        }

        this.isPointerDown = false;
        this.cancelLongPress();
        this.cancelLassoLongPress();
    }

    private onWheel(e: WheelEvent): void {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        this.viewport.zoomAt(e.offsetX, e.offsetY, factor);
        this.toolContext.requestFullRender();
    }

    private onKeyDown(e: KeyboardEvent): void {
        if (e.key === 'Shift') {
            this.shiftHeld = true;
            this.toolContext.requestRender();
        }

        // Only handle when canvas or its parent is focused
        if (!this.canvas.closest('.ink-block-wrapper:focus-within')) return;

        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                this.toolContext.history.redo();
            } else {
                this.toolContext.history.undo();
            }
            this.toolContext.requestFullRender();
            this.toolContext.requestSave();
        }
    }

    private onKeyUp(e: KeyboardEvent): void {
        if (e.key === 'Shift') {
            this.shiftHeld = false;
            this.toolContext.requestRender();
        }
    }

    /** Start a pinch-zoom gesture. */
    private startPinch(): void {
        this.isPanning = false;
        const pointers = Array.from(this.activePointers.values());
        if (pointers.length < 2) return;

        const dx = pointers[0].clientX - pointers[1].clientX;
        const dy = pointers[0].clientY - pointers[1].clientY;
        this.pinchStartDist = Math.sqrt(dx * dx + dy * dy);
        this.pinchStartZoom = this.viewport.getZoom();
        this.pinchCenterX =
            (pointers[0].offsetX + pointers[1].offsetX) / 2;
        this.pinchCenterY =
            (pointers[0].offsetY + pointers[1].offsetY) / 2;
    }

    /** Handle ongoing pinch-zoom gesture. */
    private handlePinch(): void {
        const pointers = Array.from(this.activePointers.values());
        if (pointers.length < 2) return;

        const dx = pointers[0].clientX - pointers[1].clientX;
        const dy = pointers[0].clientY - pointers[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (this.pinchStartDist > 0) {
            const scale = dist / this.pinchStartDist;
            const centerX =
                (pointers[0].offsetX + pointers[1].offsetX) / 2;
            const centerY =
                (pointers[0].offsetY + pointers[1].offsetY) / 2;

            // Reset zoom to start and apply new scale
            this.viewport.zoomAt(centerX, centerY, scale / this.viewport.getZoom() * this.pinchStartZoom);
        }

        this.toolContext.requestFullRender();
    }

    private checkAndStartLongPress(e: PointerEvent): void {
        // Pen is reserved for lasso activation — exclude it from paste long-press.
        // Allow both touch (primary) and mouse (desktop testing).
        if (e.pointerType === 'pen') return;

        // Only start the timer if the clipboard has content to paste.
        if (!this.clipboardManager?.hasContent()) return;

        this.longPressOrigin = { clientX: e.clientX, clientY: e.clientY };

        this.longPressTimer = window.setTimeout(() => {
            this.longPressTimer = null;
            const origin = this.longPressOrigin;
            this.longPressOrigin = null;
            if (origin) {
                this.pasteMenu?.show(origin.clientX, origin.clientY);
            }
        }, this.LONG_PRESS_MS);
    }

    private cancelLongPress(): void {
        if (this.longPressTimer !== null) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
        this.longPressOrigin = null;
    }

    private cancelLassoLongPress(): void {
        if (this.lassoLongPressTimer !== null) {
            clearTimeout(this.lassoLongPressTimer);
            this.lassoLongPressTimer = null;
        }
        this.lassoLongPressOrigin = null;
    }

    private getCanvasLocalPoint(e: PointerEvent): Point {
        if (this.canvas && typeof this.canvas.getBoundingClientRect === 'function') {
            const rect = this.canvas.getBoundingClientRect();
            if (typeof e.clientX === 'number' && typeof e.clientY === 'number') {
                return {
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                };
            }
        }

        return {
            x: typeof e.offsetX === 'number' ? e.offsetX : 0,
            y: typeof e.offsetY === 'number' ? e.offsetY : 0,
        };
    }

    private hitTestCanvas: HTMLCanvasElement | null = null;
    private getHitTestCtx(): CanvasRenderingContext2D | null {
        if (typeof document === 'undefined') {
            // Test environment fallback
            return {
                save: () => {},
                restore: () => {},
                clearRect: () => {},
                setTransform: () => {},
                beginPath: () => {},
                moveTo: () => {},
                lineTo: () => {},
                closePath: () => {},
                isPointInPath: () => false,
                isPointInStroke: () => false,
            } as any;
        }
        if (!this.hitTestCanvas) {
            this.hitTestCanvas = document.createElement('canvas');
        }
        if (this.hitTestCanvas.width !== this.canvas.width || this.hitTestCanvas.height !== this.canvas.height) {
            this.hitTestCanvas.width = this.canvas.width;
            this.hitTestCanvas.height = this.canvas.height;
        }
        return this.hitTestCanvas.getContext('2d');
    }

    private getElementWithUrlAtPointer(e: PointerEvent): any | null {
        const elements = this.toolContext.page.elements;
        const dims = this.viewport.getPageDimensions();
        const pagePos = clientToPageCoords(e, this.canvas, dims.width, dims.height, this.viewport);
        
        const settings = this.engine?.settings;
        const padding = settings?.linkPadding !== undefined ? settings.linkPadding : 8;

        for (let i = elements.length - 1; i >= 0; i--) {
            const el = elements[i];
            if (!el.url) continue;

            let padBox = null;
            const groupId = (el as any).linkGroupId;

            if (groupId && typeof el.getBoundingBox === 'function') {
                const groupElements = elements.filter(item => (item as any).linkGroupId === groupId);
                if (groupElements.length > 0) {
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    for (const item of groupElements) {
                        const b = item.getBoundingBox();
                        if (b.x < minX) minX = b.x;
                        if (b.y < minY) minY = b.y;
                        if (b.right > maxX) maxX = b.right;
                        if (b.bottom > maxY) maxY = b.bottom;
                    }
                    padBox = {
                        x: minX - padding,
                        y: minY - padding,
                        width: (maxX - minX) + padding * 2,
                        height: (maxY - minY) + padding * 2
                    };
                }
            } else if (typeof el.getBoundingBox === 'function') {
                const b = el.getBoundingBox();
                padBox = {
                    x: b.x - padding,
                    y: b.y - padding,
                    width: b.width + padding * 2,
                    height: b.height + padding * 2
                };
            }

            if (padBox) {
                const inBox = pagePos.x >= padBox.x && pagePos.x <= padBox.x + padBox.width &&
                              pagePos.y >= padBox.y && pagePos.y <= padBox.y + padBox.height;
                if (inBox) {
                    return el;
                }
            } else {
                // Fallback for mock elements or tests
                if (typeof el.hitTest === 'function') {
                    const threshold = 10 / this.viewport.getZoom();
                    if (el.hitTest(pagePos.x, pagePos.y, threshold)) {
                        return el;
                    }
                } else {
                    return el;
                }
            }
        }
        return null;
    }
}
