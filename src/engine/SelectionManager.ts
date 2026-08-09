import { SelectionState } from '../model/SelectionState';
import { InkPage } from '../model/InkPage';
import { HistoryManager, MoveElementsCommand, ResizeElementsCommand, ChangeStyleCommand, SortElementsCommand, RotateElementsCommand, ChangeUrlCommand } from './HistoryManager';
import { Point, strokesInsidePolygon, pointInPolygon, rotatePoint } from '../utils/geometry';
import { InkElement } from '../model/InkElement';
import { BoundingBox, unionBounds } from '../model/BoundingBox';
import { Transform } from '../model/Transform';
import { Stroke } from '../model/Stroke';
import { ElementStyle } from '../model/ElementStyle';

/**
 * Manages the transient selection state (lasso path, selected elements, active drag).
 */
export class SelectionManager {
    private state: SelectionState;
    private page: InkPage;
    private history: HistoryManager;
    private renderer?: { fullRender(): void };
    
    private moveStartPointer: Point | null = null;
    private rotateStartAngle: number = 0;

    constructor(page: InkPage, history: HistoryManager, renderer?: { fullRender(): void }) {
        this.page = page;
        this.history = history;
        this.renderer = renderer;
        this.state = {
            selectedIds: new Set(),
            unifiedBounds: null,
            activeTransformDelta: null,
            pendingLassoPath: null,
            activeResizeScale: null,
            activeResizeAnchor: null,
            activeRotationAngle: 0
        };
    }

    /** Returns a read-only view of the current selection state. */
    getState(): Readonly<SelectionState> {
        return this.state;
    }

    /** Runs the lasso hit test and updates selectedIds and unifiedBounds. */
    commitLassoSelection(lassoPath: Point[]): void {
        if (lassoPath.length < 3) {
            this.state.selectedIds.clear();
            this.recomputeUnifiedBounds();
            this.state.pendingLassoPath = null;
            return;
        }

        const selectedIds = new Set<string>();

        // Find all strokes on the page
        const strokes = this.page.elements.filter(el => el.type === 'stroke') as Stroke[];
        const strokeSelectedIds = strokesInsidePolygon(strokes, lassoPath);
        for (const id of strokeSelectedIds) {
            selectedIds.add(id);
        }

        // Find shapes
        const shapes = this.page.elements.filter(el => el.type === 'shape');
        if (shapes.length > 0) {
            const lassoPointsAsArray = lassoPath.map(p => [p.x, p.y]);
            const lassoBox = BoundingBox.fromPoints(lassoPointsAsArray);

            for (const shape of shapes) {
                const shapeBox = shape.getBoundingBox();
                
                // Broad-phase BoundingBox intersection check
                if (!shapeBox.intersects(lassoBox)) {
                    continue;
                }

                // Containment check (only for closed shapes: not line/arrow)
                let lassoContained = false;
                const shapeEl = shape as any;
                if (shapeEl.shapeType !== 'line' && shapeEl.shapeType !== 'arrow') {
                    lassoContained = 
                        lassoBox.x >= shapeBox.x &&
                        lassoBox.right <= shapeBox.right &&
                        lassoBox.y >= shapeBox.y &&
                        lassoBox.bottom <= shapeBox.bottom;
                }

                if (lassoContained) {
                    selectedIds.add(shape.id);
                    continue;
                }

                // Generate test points
                const testPoints: Point[] = [];

                if (shapeEl.shapeType === 'line' || shapeEl.shapeType === 'arrow') {
                    const startLocal = shapeEl.points[0];
                    const endLocal = shapeEl.points[1];
                    if (startLocal && endLocal) {
                        const start = shapeEl.transform.applyToPoint(startLocal.x, startLocal.y);
                        const end = shapeEl.transform.applyToPoint(endLocal.x, endLocal.y);
                        testPoints.push(start);
                        testPoints.push(end);
                        for (let i = 1; i <= 10; i++) {
                            const t = 0.1 + (0.9 - 0.1) * (i - 1) / 9;
                            testPoints.push({
                                x: start.x + (end.x - start.x) * t,
                                y: start.y + (end.y - start.y) * t
                            });
                        }
                    }
                } else {
                    // For Rectangles/Ellipses/Triangles/Rounded Rectangles:
                    // 4 corners of the BoundingBox
                    testPoints.push({ x: shapeBox.x, y: shapeBox.y });
                    testPoints.push({ x: shapeBox.right, y: shapeBox.y });
                    testPoints.push({ x: shapeBox.right, y: shapeBox.bottom });
                    testPoints.push({ x: shapeBox.x, y: shapeBox.bottom });
                    // 4 midpoints of the BoundingBox edges
                    testPoints.push({ x: shapeBox.x + shapeBox.width / 2, y: shapeBox.y });
                    testPoints.push({ x: shapeBox.right, y: shapeBox.y + shapeBox.height / 2 });
                    testPoints.push({ x: shapeBox.x + shapeBox.width / 2, y: shapeBox.bottom });
                    testPoints.push({ x: shapeBox.x, y: shapeBox.y + shapeBox.height / 2 });
                }

                // If any test point falls inside the lasso, select it
                let anyPointInside = false;
                for (const pt of testPoints) {
                    if (pointInPolygon(pt, lassoPath)) {
                        anyPointInside = true;
                        break;
                    }
                }

                if (anyPointInside) {
                    selectedIds.add(shape.id);
                }
            }
        }

        // Update state
        this.state.selectedIds = selectedIds;
        this.recomputeUnifiedBounds();
        this.state.pendingLassoPath = null;
    }

    /** Starts a lasso path selection. */
    beginLasso(pt: Point): void {
        this.state.pendingLassoPath = [pt];
    }

    /** Extends the current lasso path selection. */
    extendLasso(pt: Point): void {
        this.state.pendingLassoPath?.push(pt);
    }

    /** Begins an interactive move. Stores the initial pointer position. */
    beginMove(pointerStart: Point): void {
        this.moveStartPointer = pointerStart;
        this.state.activeTransformDelta = new Transform();
    }

    /** Updates activeTransformDelta during an interactive move. */
    updateMove(pointerCurrent: Point): void {
        if (!this.moveStartPointer || !this.state.activeTransformDelta) return;
        
        const dx = pointerCurrent.x - this.moveStartPointer.x;
        const dy = pointerCurrent.y - this.moveStartPointer.y;
        
        this.state.activeTransformDelta.x = dx;
        this.state.activeTransformDelta.y = dy;
    }

    /** Commits the accumulated delta to the actual point data. */
    commitMove(): void {
        if (!this.state.activeTransformDelta || this.state.selectedIds.size === 0) {
            this.moveStartPointer = null;
            this.state.activeTransformDelta = null;
            return;
        }

        const delta = this.state.activeTransformDelta;
        const movedElements: InkElement[] = [];

        // 1. Mutate the raw point arrays of every selected element IN PLACE.
        //    Do not clone. Do not create new elements. Translate the existing ones.
        for (const id of this.state.selectedIds) {
            const element = this.page.getElementById(id);
            if (!element) continue;

            if (element.type === 'stroke') {
                const stroke = element as Stroke;
                // Translate every point in the raw point array
                for (const pt of stroke.points) {
                    pt[0] += delta.x;
                    pt[1] += delta.y;
                }
                // If perfect-freehand caches an outline, invalidate it so it redraws
                stroke.invalidateCache();
                // Recompute the bounding box from the new point positions
                stroke.getBoundingBox();
            } else if (element.type === 'shape') {
                const shape = element as any;
                if (shape.points && Array.isArray(shape.points)) {
                    for (const pt of shape.points) {
                        pt.x += delta.x;
                        pt.y += delta.y;
                    }
                }
                shape.invalidateCache();
                shape.getBoundingBox();
            }

            movedElements.push(element);
        }

        // 2. Recompute the unified selection bounds from the new element positions
        this.state.unifiedBounds = unionBounds(
            movedElements.map(el => el.getBoundingBox())
        );

        // 3. Push ONE MoveElementsCommand to history for undo/redo.
        //    The command stores the original positions (before this move) so undo
        //    can reverse exactly. The delta passed here IS that reversal vector.
        this.history.push(
            new MoveElementsCommand(movedElements, delta, this.renderer)
        );

        // 4. Clear the transient delta — the move is now committed to real data.
        this.moveStartPointer = null;
        this.state.activeTransformDelta = null;
        this.renderer?.fullRender();
    }

    /** Cancels the active move, discarding any transient delta without committing or pushing history. */
    cancelMove(): void {
        this.state.activeTransformDelta = null;
        this.moveStartPointer = null;
        this.renderer?.fullRender();
    }

    /** Clears the selection state entirely. */
    clearSelection(): void {
        this.state.selectedIds.clear();
        this.state.unifiedBounds = null;
        this.state.activeTransformDelta = null;
        this.state.pendingLassoPath = null;
        this.moveStartPointer = null;
        this.renderer?.fullRender();
    }

    /** Clears only the pending lasso path from SelectionState. */
    clearLassoPath(): void {
        this.state.pendingLassoPath = null;
    }

    /** Checks if a point hits any corner of the selection bounding box. */
    getCornerHandleAt(pt: Point, zoom: number = 1.0): number {
        if (!this.state.unifiedBounds) return -1;
        const box = this.state.unifiedBounds;
        const corners = [
            { x: box.x, y: box.y }, // 0: Top-Left
            { x: box.right, y: box.y }, // 1: Top-Right
            { x: box.right, y: box.bottom }, // 2: Bottom-Right
            { x: box.x, y: box.bottom } // 3: Bottom-Left
        ];
        
        const threshold = 12 / zoom; // 12 screen pixels threshold
        for (let i = 0; i < 4; i++) {
            const dx = pt.x - corners[i].x;
            const dy = pt.y - corners[i].y;
            if (Math.sqrt(dx * dx + dy * dy) <= threshold) {
                return i;
            }
        }
        return -1;
    }

    /** Checks if a point hits any midpoint of the selection bounding box edges. */
    getMidpointHandleAt(pt: Point, zoom: number = 1.0): number {
        if (!this.state.unifiedBounds) return -1;
        const box = this.state.unifiedBounds;
        const midpoints = [
            { x: box.x + box.width / 2, y: box.y },       // 0: Top
            { x: box.right, y: box.y + box.height / 2 },  // 1: Right
            { x: box.x + box.width / 2, y: box.bottom },  // 2: Bottom
            { x: box.x, y: box.y + box.height / 2 }       // 3: Left
        ];
        
        const threshold = 12 / zoom; // 12 screen pixels threshold
        for (let i = 0; i < 4; i++) {
            const dx = pt.x - midpoints[i].x;
            const dy = pt.y - midpoints[i].y;
            if (Math.sqrt(dx * dx + dy * dy) <= threshold) {
                return i;
            }
        }
        return -1;
    }

    /** Begins active rotation session based on starting pointer position. */
    beginRotate(pt: Point): void {
        if (!this.state.unifiedBounds) return;
        const cx = this.state.unifiedBounds.centerX;
        const cy = this.state.unifiedBounds.centerY;
        this.rotateStartAngle = Math.atan2(pt.y - cy, pt.x - cx);
        this.state.activeRotationAngle = 0;
    }

    /** Updates rotation angle based on current pointer drag position. */
    updateRotate(currentPointer: Point, isShiftHeld?: boolean): void {
        if (!this.state.unifiedBounds) return;
        const cx = this.state.unifiedBounds.centerX;
        const cy = this.state.unifiedBounds.centerY;
        const currentAngle = Math.atan2(currentPointer.y - cy, currentPointer.x - cx);
        const rawAngle = currentAngle - this.rotateStartAngle;
        
        // Snap to nearest 90 degrees if within MAGNETIC_THRESHOLD
        const nearest90 = Math.round(rawAngle / (Math.PI / 2)) * (Math.PI / 2);
        const MAGNETIC_THRESHOLD = Math.PI / 12; // 15 degrees
        if (Math.abs(rawAngle - nearest90) < MAGNETIC_THRESHOLD) {
            this.state.activeRotationAngle = nearest90;
        } else {
            this.state.activeRotationAngle = rawAngle;
        }
    }

    /** Commits the rotation to selected elements. */
    commitRotate(): void {
        const angle = this.state.activeRotationAngle;
        if (angle === 0 || !this.state.unifiedBounds || this.state.selectedIds.size === 0) {
            this.state.activeRotationAngle = 0;
            return;
        }
        
        const cx = this.state.unifiedBounds.centerX;
        const cy = this.state.unifiedBounds.centerY;
        const center = { x: cx, y: cy };
        const rotatedElements: InkElement[] = [];
        
        for (const id of this.state.selectedIds) {
            const element = this.page.getElementById(id);
            if (!element) continue;
            
            if (element.type === 'stroke') {
                const stroke = element as Stroke;
                for (const pt of stroke.points) {
                    const rotated = rotatePoint({ x: pt[0], y: pt[1] }, center, angle);
                    pt[0] = rotated.x;
                    pt[1] = rotated.y;
                }
                stroke.invalidateCache();
                stroke.getBoundingBox();
            } else if (element.type === 'shape') {
                const shape = element as any;
                const box = shape.getBoundingBox();
                const shCx = box.centerX;
                const shCy = box.centerY;
                const newCenter = rotatePoint({ x: shCx, y: shCy }, center, angle);
                const dx = newCenter.x - shCx;
                const dy = newCenter.y - shCy;
                if (shape.points && Array.isArray(shape.points)) {
                    for (const pt of shape.points) {
                        pt.x += dx;
                        pt.y += dy;
                    }
                }
                shape.rotation = (shape.rotation || 0) + angle;
                shape.invalidateCache();
                shape.getBoundingBox();
            }
            rotatedElements.push(element);
        }
        
        this.recomputeUnifiedBounds();
        
        this.history.push(
            new RotateElementsCommand(rotatedElements, angle, center, this.renderer)
        );
        
        this.state.activeRotationAngle = 0;
        this.renderer?.fullRender();
    }

    /** Cancels the active rotation session. */
    cancelRotate(): void {
        this.state.activeRotationAngle = 0;
    }

    /** Begins active resize session with a fixed anchor point. */
    beginResize(anchor: Point): void {
        this.state.activeResizeAnchor = anchor;
        this.state.activeResizeScale = { x: 1.0, y: 1.0 };
    }

    /** Updates scale factor relative to anchor based on pointer drag position and axis constraints. */
    updateResize(dragPt: Point, anchor: Point, originBounds: BoundingBox, axisLock: 'x' | 'y' | null = null): void {
        const C = {
            x: anchor.x === originBounds.x ? originBounds.right : originBounds.x,
            y: anchor.y === originBounds.y ? originBounds.bottom : originBounds.y
        };
        
        let scaleX = 1.0;
        let scaleY = 1.0;
        
        // If X is not locked, compute scaleX
        if (axisLock !== 'x') {
            const vx = C.x - anchor.x;
            if (vx !== 0) {
                const ux = dragPt.x - anchor.x;
                scaleX = ux / vx;
            }
        }
        
        // If Y is not locked, compute scaleY
        if (axisLock !== 'y') {
            const vy = C.y - anchor.y;
            if (vy !== 0) {
                const uy = dragPt.y - anchor.y;
                scaleY = uy / vy;
            }
        }

        if (axisLock === null) {
            // Corner handles: uniform proportional scaling
            const absX = Math.abs(scaleX);
            const absY = Math.abs(scaleY);
            const uniformScale = Math.max(0.01, Math.max(absX, absY));
            // Preserve signs of scaleX/scaleY to allow mirroring/flipping across anchor
            const signX = scaleX >= 0 ? 1 : -1;
            const signY = scaleY >= 0 ? 1 : -1;
            scaleX = signX * uniformScale;
            scaleY = signY * uniformScale;
        } else {
            // Midpoint handles: apply minimum scale constraint on active axis
            scaleX = scaleX >= 0 ? Math.max(0.01, scaleX) : Math.min(-0.01, scaleX);
            scaleY = scaleY >= 0 ? Math.max(0.01, scaleY) : Math.min(-0.01, scaleY);
        }
        
        this.state.activeResizeScale = { x: scaleX, y: scaleY };
    }

    /** Commits the resize scaling to selected elements. */
    commitResize(originBounds: BoundingBox): void {
        const scale = this.state.activeResizeScale;
        const anchor = this.state.activeResizeAnchor;
        
        if (scale === null || anchor === null || this.state.selectedIds.size === 0) {
            this.state.activeResizeScale = null;
            this.state.activeResizeAnchor = null;
            return;
        }
        
        const resizedElements: InkElement[] = [];
        
        for (const id of this.state.selectedIds) {
            const element = this.page.getElementById(id);
            if (!element) continue;
            
            if (element.type === 'stroke') {
                const stroke = element as Stroke;
                for (const pt of stroke.points) {
                    pt[0] = anchor.x + (pt[0] - anchor.x) * scale.x;
                    pt[1] = anchor.y + (pt[1] - anchor.y) * scale.y;
                }
                stroke.invalidateCache();
                stroke.getBoundingBox();
            } else if (element.type === 'shape') {
                const shape = element as any;
                if (shape.points && Array.isArray(shape.points)) {
                    for (const pt of shape.points) {
                        pt.x = anchor.x + (pt.x - anchor.x) * scale.x;
                        pt.y = anchor.y + (pt.y - anchor.y) * scale.y;
                    }
                }
                shape.invalidateCache();
                shape.getBoundingBox();
            }
            resizedElements.push(element);
        }
        
        // Recompute bounds after mutation
        this.recomputeUnifiedBounds();
        
        // Push command to history
        this.history.push(
            new ResizeElementsCommand(resizedElements, scale, anchor, this.renderer)
        );
        
        this.state.activeResizeScale = null;
        this.state.activeResizeAnchor = null;
        this.renderer?.fullRender();
    }

    /** Cancels the active resize session without modifying any element data. */
    cancelResize(): void {
        this.state.activeResizeScale = null;
        this.state.activeResizeAnchor = null;
        this.renderer?.fullRender();
    }

    /**
     * Programmatically sets the selection to the given elements.
     * Used after paste to make pasted content immediately selectable.
     */
    selectElements(elements: InkElement[]): void {
        this.state.selectedIds = new Set(elements.map(el => el.id));
        this.state.unifiedBounds = unionBounds(elements.map(el => el.getBoundingBox()));
        this.state.activeTransformDelta = null;
        this.state.activeResizeScale = null;
        this.state.activeResizeAnchor = null;
    }

    /** Applies a styling update to all currently selected elements and pushes to history. */
    applyStyleToSelection(stylePartial: Partial<ElementStyle>): void {
        if (this.state.selectedIds.size === 0) return;

        const updates: { element: InkElement; oldStyle: ElementStyle; newStyle: ElementStyle }[] = [];
        for (const id of this.state.selectedIds) {
            const element = this.page.getElementById(id);
            if (!element) continue;

            const styledEl = element as any;
            if (styledEl.style) {
                const oldStyle = { ...styledEl.style };
                
                // Filter out fillColor updates for non-shape elements
                const filteredPartial = { ...stylePartial };
                if (element.type !== 'shape') {
                    delete filteredPartial.fillColor;
                }

                if (Object.keys(filteredPartial).length === 0) {
                    continue;
                }

                const newStyle = { ...oldStyle, ...filteredPartial };
                updates.push({ element, oldStyle, newStyle });
            }
        }

        if (updates.length === 0) return;

        const cmd = new ChangeStyleCommand(updates, this.renderer);
        this.history.execute(cmd);
        
        // Recompute the unified bounding box since changing stroke widths can affect it
        this.recomputeUnifiedBounds();
    }

    /** Applies a URL update to all currently selected elements and pushes to history. */
    applyUrlToSelection(url?: string): void {
        if (this.state.selectedIds.size === 0) return;

        // If linking multiple elements simultaneously, assign a unique linkGroupId to combine them
        const newGroupId = (url && url.trim().length > 0 && this.state.selectedIds.size > 1) 
            ? 'lg-' + Math.random().toString(36).substring(2, 9) 
            : undefined;

        const updates: {
            element: InkElement;
            oldUrl?: string;
            newUrl?: string;
            oldGroupId?: string;
            newGroupId?: string;
        }[] = [];

        for (const id of this.state.selectedIds) {
            const element = this.page.getElementById(id);
            if (!element) continue;

            const oldUrl = element.url;
            const newUrl = url === '' ? undefined : url;
            const oldGroupId = (element as any).linkGroupId;
            
            updates.push({
                element,
                oldUrl,
                newUrl,
                oldGroupId,
                newGroupId: newUrl ? newGroupId : undefined
            });
        }

        if (updates.length === 0) return;

        const cmd = new ChangeUrlCommand(updates, this.renderer);
        this.history.execute(cmd);
    }

    /** Helper function to recalculate the unified bounding box. */
    private recomputeUnifiedBounds(): void {
        if (this.state.selectedIds.size === 0) {
            this.state.unifiedBounds = null;
            return;
        }

        const boxes: BoundingBox[] = [];
        for (const id of this.state.selectedIds) {
            const el = this.page.getElementById(id);
            if (el) {
                boxes.push(el.getBoundingBox());
            }
        }

        if (boxes.length === 0) {
            this.state.unifiedBounds = null;
        } else {
            this.state.unifiedBounds = unionBounds(boxes);
        }
    }

    bringSelectionToFront(): void {
        if (this.state.selectedIds.size === 0) return;

        const originalOrder = [...this.page.elements];
        const selectedElements: InkElement[] = [];
        const remainingElements: InkElement[] = [];

        for (const el of this.page.elements) {
            if (this.state.selectedIds.has(el.id)) {
                selectedElements.push(el);
            } else {
                remainingElements.push(el);
            }
        }

        const newOrder = [...remainingElements, ...selectedElements];

        const cmd = new SortElementsCommand(this.page, originalOrder, newOrder, this.renderer);
        this.history.execute(cmd);
    }

    sendSelectionToBack(): void {
        if (this.state.selectedIds.size === 0) return;

        const originalOrder = [...this.page.elements];
        const selectedElements: InkElement[] = [];
        const remainingElements: InkElement[] = [];

        for (const el of this.page.elements) {
            if (this.state.selectedIds.has(el.id)) {
                selectedElements.push(el);
            } else {
                remainingElements.push(el);
            }
        }

        const newOrder = [...selectedElements, ...remainingElements];

        const cmd = new SortElementsCommand(this.page, originalOrder, newOrder, this.renderer);
        this.history.execute(cmd);
    }
}
