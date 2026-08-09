import { InkPage, BackgroundType } from '../model/InkPage';
import { ViewportManager } from './ViewportManager';
import { SelectionState } from '../model/SelectionState';
import { Stroke } from '../model/Stroke';
import { ElementStyle } from '../model/ElementStyle';
import { getLinkBackgroundColor } from '../utils/color';
import { ShapeElement } from '../model/ShapeElement';
import { ShapeRegistry } from '../shapes/ShapeRegistry';
import { Vec2 } from '../utils/geometry';
import { getElementCssSize, getElementCssWidth } from '../utils/dom';

/** Resolved link-highlight visuals, looked up once per render pass rather than once per element. */
interface LinkRenderSettings {
    bgColor: string;
    strokeColor: string;
    padding: number;
    radius: number;
}

/**
 * Four-layer Canvas 2D renderer for the ink engine.
 *
 *   bgCanvas        — Static background (grid, ruled, etc.)
 *   completedCanvas — Offscreen buffer with all finalized, non-selected strokes
 *   activeCanvas    — Visible canvas compositing bg + completed + active tool overlay (drawImage'd)
 *   overlayCanvas    — Separate stacked DOM canvas (z-index above activeCanvas) for selection UI
 *                       (lasso, bounds, handles, currently-selected elements). Not drawImage'd into
 *                       activeCanvas — it's a real layered element, the browser composites it.
 *
 * The active stroke is rendered directly (no rAF) for minimum latency.
 * Completed strokes are only re-rendered on structural changes (add/remove/undo).
 */
export class Renderer {
    private bgCanvas: HTMLCanvasElement;
    private completedCanvas: HTMLCanvasElement;
    private activeCanvas: HTMLCanvasElement;
    private overlayCanvas: HTMLCanvasElement;

    private bgCtx: CanvasRenderingContext2D;
    private completedCtx: CanvasRenderingContext2D;
    private activeCtx: CanvasRenderingContext2D;
    private overlayCtx: CanvasRenderingContext2D;

    private canvasWidth: number = 0;
    private canvasHeight: number = 0;
    private dpr: number;
    private lastPage: InkPage | null = null;
    private lastViewport: ViewportManager | null = null;
    private activeShapePreview: {
        shapeType: string;
        points: Vec2[];
        style: ElementStyle;
    } | null = null;

    private selectionState: SelectionState | null = null;

    setSelectionState(state: SelectionState): void {
        this.selectionState = state;
    }


    constructor(
        private container: HTMLElement,
        private pageWidth: number,
        private pageHeight: number
    ) {
        this.dpr = window.devicePixelRatio || 1;

        // Create three canvases
        this.bgCanvas = document.createElement('canvas');
        this.completedCanvas = document.createElement('canvas');
        this.activeCanvas = document.createElement('canvas');
        this.overlayCanvas = document.createElement('canvas');

        // Only the active canvas is visible for drawing, but overlay is visually on top
        this.activeCanvas.addClass('ink-canvas');
        this.overlayCanvas.addClass('ink-overlay');
        this.overlayCanvas.style.position = 'absolute';
        this.overlayCanvas.style.top = '0';
        this.overlayCanvas.style.left = '0';
        this.overlayCanvas.style.pointerEvents = 'none';
        this.overlayCanvas.style.zIndex = '10';

        // Setup contexts
        this.bgCtx = this.bgCanvas.getContext('2d')!;
        this.completedCtx = this.completedCanvas.getContext('2d')!;
        this.overlayCtx = this.overlayCanvas.getContext('2d')!;

        // Use desynchronized hint for lowest possible latency on Chromium
        this.activeCtx = this.activeCanvas.getContext('2d', {
            desynchronized: true,
        }) as CanvasRenderingContext2D;

        // Prevent browser gestures on canvas
        this.activeCanvas.style.touchAction = 'none';
        this.activeCanvas.style.userSelect = 'none';
        (this.activeCanvas.style as any).webkitUserSelect = 'none';
        this.activeCanvas.setAttribute('data-ignore-swipe', 'true');

        // Add to DOM
        this.container.appendChild(this.activeCanvas);
        this.container.appendChild(this.overlayCanvas);

        // Initial size
        const initialSize = getElementCssSize(container, 600, 400);
        this.resize(initialSize.width, initialSize.height);
    }

    /* ---------------------------------------------------------------- *
     * Shared rendering helpers
     *
     * The link-highlight backdrop, per-element rotation wrap, read-only
     * link-color override, and stroke/shape/default dispatch used to be
     * written out twice — once for completed (non-selected) elements in
     * renderCompleted(), once for selected elements in drawOverlay(). Same
     * logic, two copies that could silently drift. Pulled into one place.
     * ---------------------------------------------------------------- */

    /** Resolves the active visual theme for a page, falling back to a background-derived default. */
    private resolveTheme(page: InkPage): string {
        return (page as any).theme
            || (page.background === 'grid' ? 'grid-mesh' : page.background === 'dotted' ? 'isometric-dots' : 'light-paper');
    }

    private getLinkRenderSettings(settings?: any): LinkRenderSettings {
        return {
            bgColor: getLinkBackgroundColor(settings),
            strokeColor: settings?.linkRenderColor || '#ffffff',
            padding: settings?.linkPadding ?? 8,
            radius: settings?.linkBorderRadius ?? 8,
        };
    }

    /** Traces a rounded rect path (native roundRect when available, hand-rolled fallback otherwise) and fills it. */
    private fillRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number): void {
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(x, y, w, h, radius);
        } else {
            const r = Math.min(radius, w / 2, h / 2);
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
        }
        ctx.fill();
    }

    /**
     * Draws the shared "this is one clickable link" backdrop for a
     * read-only linked element or link group. Draws at most once per
     * groupId per pass (tracked via `renderedGroups`); the box is the union
     * of bounding boxes of every member of `members` that shares the group.
     *
     * NOTE: `members` is intentionally pass-specific (non-selected elements
     * for the completed pass, selected elements for the overlay pass) to
     * match the pre-existing split rendering of completed vs. selected
     * elements across the two canvases. One consequence worth knowing: if a
     * link group is PARTIALLY selected, you'll get two separate highlight
     * boxes (one static box around the unselected members on the cached
     * completedCanvas, one live box around the selected members on the
     * overlay) rather than one box around the whole group. That's how the
     * original code behaved too — I didn't change it, since merging them
     * would mean the completedCanvas's cached backdrop has to track a
     * live drag/transform, which defeats the point of caching it. Flagging
     * in case partial-group selection isn't actually supposed to be
     * reachable (e.g. selecting any member should select the whole group).
     */
    private renderLinkHighlight(
        ctx: CanvasRenderingContext2D,
        element: any,
        members: any[],
        renderedGroups: Set<string>,
        cfg: LinkRenderSettings,
    ): void {
        const groupId = element.linkGroupId;
        let padBox: { x: number; y: number; width: number; height: number } | undefined;

        if (groupId) {
            if (renderedGroups.has(groupId)) return;
            renderedGroups.add(groupId);

            const groupElements = members.filter(el => el.linkGroupId === groupId);
            if (groupElements.length === 0) return;

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const el of groupElements) {
                const b = el.getBoundingBox();
                if (b.x < minX) minX = b.x;
                if (b.y < minY) minY = b.y;
                if (b.right > maxX) maxX = b.right;
                if (b.bottom > maxY) maxY = b.bottom;
            }
            padBox = {
                x: minX - cfg.padding,
                y: minY - cfg.padding,
                width: (maxX - minX) + cfg.padding * 2,
                height: (maxY - minY) + cfg.padding * 2,
            };
        } else {
            const b = element.getBoundingBox();
            padBox = {
                x: b.x - cfg.padding,
                y: b.y - cfg.padding,
                width: b.width + cfg.padding * 2,
                height: b.height + cfg.padding * 2,
            };
        }

        ctx.save();
        ctx.fillStyle = cfg.bgColor;
        this.fillRoundedRect(ctx, padBox.x, padBox.y, padBox.width, padBox.height, cfg.radius);
        ctx.restore();
    }

    /** Wraps `fn` in this element's own per-element rotation transform, if it has one. */
    private withElementRotation(ctx: CanvasRenderingContext2D, element: any, fn: () => void): void {
        const hasRotation = element.rotation !== undefined && element.rotation !== 0;
        if (!hasRotation) { fn(); return; }

        ctx.save();
        const elBox = element.getBoundingBox();
        const cx = elBox.centerX;
        const cy = elBox.centerY;
        ctx.translate(cx, cy);
        ctx.rotate(element.rotation);
        ctx.translate(-cx, -cy);
        fn();
        ctx.restore();
    }

    /** Temporarily overrides strokeColor/fillColor to the link render color (read-only link mode) while `fn` runs. */
    private withLinkColorOverride(element: any, isReadOnly: boolean | undefined, linkStrokeColor: string, fn: () => void): void {
        const isRO = !!isReadOnly;
        const shouldOverride = isRO && element.url && linkStrokeColor !== 'original' && element.style;
        let originalStyle: any = null;

        if (shouldOverride) {
            originalStyle = { ...element.style };
            element.style.strokeColor = linkStrokeColor;
            if (element.style.fillColor && element.style.fillColor !== 'transparent') {
                element.style.fillColor = linkStrokeColor;
            }
        }

        fn();

        if (originalStyle) {
            element.style.strokeColor = originalStyle.strokeColor;
            element.style.fillColor = originalStyle.fillColor;
        }
    }

    /** Dispatches to the right render path for an element's type. */
    private renderElementContent(ctx: CanvasRenderingContext2D, element: any): void {
        if (element.type === 'stroke') {
            this.renderStroke(ctx, element as Stroke);
        } else if (element.type === 'shape') {
            this.renderShape(ctx, element as ShapeElement);
        } else {
            element.render(ctx);
        }
    }

    private renderShape(ctx: CanvasRenderingContext2D, el: ShapeElement): void {
        const def = ShapeRegistry.get(el.shapeType);
        if (!def) {
            // Unknown shape — placeholder box
            ctx.save();
            ctx.strokeStyle = '#ff000066';
            ctx.lineWidth   = 1;
            ctx.setLineDash([4, 4]);
            const bounds = el.getBoundingBox();
            ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
            ctx.restore();
            return;
        }
        ctx.save();
        el.transform.applyToContext(ctx);
        def.render(ctx, el.points, el.style, false);
        ctx.restore();
    }

    private renderStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
        stroke.render(ctx);
    }

    /**
     * Re-render all completed strokes onto the offscreen buffer.
     * Called on page load, undo/redo, and element add/remove.
     */
    renderCompleted(page: InkPage, viewport: ViewportManager, settings?: any, isReadOnly?: boolean): void {
        const ctx = this.completedCtx;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

        ctx.save();
        viewport.applyTransform(ctx);

        const isRO = !!isReadOnly;
        const linkCfg = this.getLinkRenderSettings(settings);
        const renderedLinkGroups = new Set<string>();
        // Hoisted once instead of re-filtering the whole page every time a new group is first seen.
        const nonSelectedElements = page.elements.filter(el => !this.selectionState?.selectedIds.has(el.id));

        for (const element of page.elements) {
            if (this.selectionState?.selectedIds.has(element.id)) {
                continue;
            }

            if (isRO && element.url) {
                this.renderLinkHighlight(ctx, element, nonSelectedElements, renderedLinkGroups, linkCfg);
            }

            this.withElementRotation(ctx, element, () => {
                this.withLinkColorOverride(element, isReadOnly, linkCfg.strokeColor, () => {
                    this.renderElementContent(ctx, element);
                });
            });
        }

        ctx.restore();
    }

    setPageDimensions(width: number, height: number): void {
        this.pageWidth = width;
        this.pageHeight = height;
    }

    renderBackground(
        background: BackgroundType,
        page: InkPage,
        viewport: ViewportManager,
        pageWidth: number,
        pageHeight: number
    ): void {
        const ctx = this.bgCtx;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

        const theme = this.resolveTheme(page);

        // Fill with app background
        ctx.fillStyle = theme === 'dark-canvas' ? '#121212' : '#f8f9fa';
        ctx.fillRect(0, 0, this.canvasWidth / this.dpr, this.canvasHeight / this.dpr);

        ctx.save();
        viewport.applyTransform(ctx);

        // Draw page rectangle (the "paper")
        ctx.fillStyle = theme === 'dark-canvas' ? '#1e1e1e' : '#ffffff';
        ctx.fillRect(0, 0, pageWidth, pageHeight);

        // Page shadow
        ctx.shadowColor = theme === 'dark-canvas' ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.12)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.fillRect(0, 0, pageWidth, pageHeight);
        ctx.shadowColor = 'transparent';

        // Page border
        ctx.strokeStyle = theme === 'dark-canvas' ? '#333333' : '#d0d0d0';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, pageWidth, pageHeight);

        ctx.restore();

        // Draw unified background pattern in screen space
        this.drawBackground(ctx, page, viewport);
    }

    private drawBackground(
        ctx: CanvasRenderingContext2D,
        page: InkPage,
        viewport: ViewportManager
    ): void {
        const theme = this.resolveTheme(page);

        // NOTE (unchanged behaviour, just flagging): when `page.theme` is
        // explicitly set to 'light-paper' but page.background is 'grid' or
        // 'dotted', this collapses bgType to 'blank'/'ruled' and the
        // grid/dots pattern is dropped. That round-trips correctly for the
        // common case (no explicit theme), so I left it as-is rather than
        // guess whether that collapsing is intentional (theme overriding
        // the legacy background field) or a latent bug.
        let bgType = page.background;
        if (theme === 'dark-canvas') {
            bgType = 'grid';
        } else if (theme === 'grid-mesh') {
            bgType = 'grid';
        } else if (theme === 'isometric-dots') {
            bgType = 'dotted';
        } else if (theme === 'light-paper') {
            bgType = page.background === 'ruled' ? 'ruled' : 'blank';
        }

        if (bgType === 'blank') return;

        const scale = viewport.getEffectiveScale();
        const pan = viewport.getOffset();
        const zoom = viewport.getZoom();
        const gridSize = page.gridSize;

        // Establish the page-space boundaries in screen coordinates
        const x = pan.x;
        const y = pan.y;
        const dims = viewport.getPageDimensions();
        const width = dims.width * scale;
        const height = dims.height * scale;

        ctx.save();

        // Clip to the page bounding box in screen-space
        ctx.beginPath();
        ctx.rect(x, y, width, height);
        ctx.clip();

        // Determine subdivision interval (in page space)
        let subdiv = gridSize;
        let stepFactor = 1;
        if (zoom >= 3.0) {
            subdiv = gridSize / 4;
            stepFactor = 4;
        } else if (zoom >= 1.5) {
            subdiv = gridSize / 2;
            stepFactor = 2;
        }

        // Loop variables
        const xCount = Math.floor(dims.width / subdiv);
        const yCount = Math.floor(dims.height / subdiv);

        // Standard styles/opacity adapting to theme colors
        const baseGridColor = theme === 'dark-canvas' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(160, 160, 160, 0.25)';
        const subdivGridColor = theme === 'dark-canvas' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(160, 160, 160, 0.125)';

        const baseLineColor = theme === 'dark-canvas' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(180, 200, 220, 0.4)';
        const subdivLineColor = theme === 'dark-canvas' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(180, 200, 220, 0.15)';

        const baseDotColor = theme === 'dark-canvas' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(170, 180, 190, 0.4)';
        const subdivDotColor = theme === 'dark-canvas' ? 'rgba(255, 255, 255, 0.09)' : 'rgba(170, 180, 190, 0.15)';

        if (bgType === 'grid') {
            // Draw vertical lines
            for (let i = 1; i < xCount; i++) {
                const px = i * subdiv;
                const sx = x + px * scale;
                
                const isBase = i % stepFactor === 0;
                ctx.strokeStyle = isBase ? baseGridColor : subdivGridColor;
                ctx.lineWidth = isBase ? 1.0 : 0.5; // 50% thickness
                
                ctx.beginPath();
                ctx.moveTo(sx, y);
                ctx.lineTo(sx, y + height);
                ctx.stroke();
            }
            
            // Draw horizontal lines
            for (let j = 1; j < yCount; j++) {
                const py = j * subdiv;
                const sy = y + py * scale;
                
                const isBase = j % stepFactor === 0;
                ctx.strokeStyle = isBase ? baseGridColor : subdivGridColor;
                ctx.lineWidth = isBase ? 1.0 : 0.5; // 50% thickness
                
                ctx.beginPath();
                ctx.moveTo(x, sy);
                ctx.lineTo(x + width, sy);
                ctx.stroke();
            }
        } else if (bgType === 'ruled') {
            // Draw horizontal lines only
            for (let j = 1; j < yCount; j++) {
                const py = j * subdiv;
                const sy = y + py * scale;
                
                const isBase = j % stepFactor === 0;
                ctx.strokeStyle = isBase ? baseLineColor : subdivLineColor;
                ctx.lineWidth = 0.5;
                
                ctx.beginPath();
                ctx.moveTo(x, sy);
                ctx.lineTo(x + width, sy);
                ctx.stroke();
            }
        } else if (bgType === 'dotted') {
            // Draw circles at X/Y intersections
            for (let i = 1; i < xCount; i++) {
                const px = i * subdiv;
                const sx = x + px * scale;
                const isBaseX = i % stepFactor === 0;

                for (let j = 1; j < yCount; j++) {
                    const py = j * subdiv;
                    const sy = y + py * scale;
                    const isBaseY = j % stepFactor === 0;
                    
                    const isBase = isBaseX && isBaseY;
                    ctx.fillStyle = isBase ? baseDotColor : subdivDotColor;
                    const radius = isBase ? 2.0 : 1.0;
                    
                    ctx.beginPath();
                    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        ctx.restore();
    }

    /**
     * Composite all layers and render a frame.
     * Called during active drawing for every pointer move.
     */
    renderFrame(
        page: InkPage,
        viewport: ViewportManager,
        overlayFn?: (ctx: CanvasRenderingContext2D) => void,
        settings?: any,
        isReadOnly?: boolean
    ): void {
        const ctx = this.activeCtx;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

        // Layer 1: Background
        ctx.drawImage(
            this.bgCanvas,
            0, 0,
            this.canvasWidth, this.canvasHeight,
            0, 0,
            this.canvasWidth / this.dpr, this.canvasHeight / this.dpr
        );

        // Layer 2: Completed strokes
        ctx.drawImage(
            this.completedCanvas,
            0, 0,
            this.canvasWidth, this.canvasHeight,
            0, 0,
            this.canvasWidth / this.dpr, this.canvasHeight / this.dpr
        );

        // Layer 3: Active tool overlay (e.g. stroke being drawn)
        if (overlayFn || this.activeShapePreview) {
            ctx.save();
            viewport.applyTransform(ctx);
            if (overlayFn) {
                overlayFn(ctx);
            }
            if (this.activeShapePreview) {
                const { shapeType, points, style } = this.activeShapePreview;
                const def = ShapeRegistry.get(shapeType);
                if (def) {
                    def.render(ctx, points, style, true);
                }
            }
            ctx.restore();
        }
    }

    setShapePreview(shapeType: string, points: Vec2[], style: ElementStyle): void {
        this.activeShapePreview = { shapeType, points, style };
    }

    clearShapePreview(): void {
        this.activeShapePreview = null;
    }


    /** Explicitly set the active page for caching. */
    setActivePage(page: InkPage): void {
        this.lastPage = page;
    }

    /**
     * Full render: background + completed + overlay.
     * Used when the page changes, viewport changes, or on initial load.
     */
    fullRender(
        page?: InkPage,
        viewport?: ViewportManager,
        background?: BackgroundType,
        overlayFn?: (ctx: CanvasRenderingContext2D) => void,
        settings?: any,
        isReadOnly?: boolean
    ): void {
        if (page) this.lastPage = page;
        if (viewport) this.lastViewport = viewport;

        const actualPage = this.lastPage;
        const actualViewport = this.lastViewport;

        if (!actualPage || !actualViewport) return;

        const bg = background ?? actualPage.background;
        this.renderBackground(bg, actualPage, actualViewport, this.pageWidth, this.pageHeight);
        this.renderCompleted(actualPage, actualViewport, settings, isReadOnly);
        this.renderFrame(actualPage, actualViewport, overlayFn, settings, isReadOnly);
    }

    /** Clears the overlay canvas at the start of a render tick. */
    clearOverlay(): void {
        this.overlayCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.overlayCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    }

    /** Draws the selection state (lasso path, bounds, handles) on the overlay canvas. */
    drawOverlay(selectionState: SelectionState, viewport: ViewportManager, page: InkPage, settings?: any, isReadOnly?: boolean): void {
        const ctx = this.overlayCtx;
        
        ctx.save();
        viewport.applyTransform(ctx);

        if (selectionState.pendingLassoPath && selectionState.pendingLassoPath.length > 0) {
            ctx.strokeStyle = 'rgba(99, 179, 237, 0.8)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 3]);
            ctx.beginPath();
            
            const path = selectionState.pendingLassoPath;
            ctx.moveTo(path[0].x, path[0].y);
            for (let i = 1; i < path.length; i++) {
                ctx.lineTo(path[i].x, path[i].y);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.setLineDash([]);
        }

        if (selectionState.selectedIds.size > 0 && selectionState.unifiedBounds) {
            let box = selectionState.unifiedBounds;
            
            ctx.save();
            // Apply active transform delta if any
            if (selectionState.activeTransformDelta && !selectionState.activeTransformDelta.isIdentity()) {
                box = box.clone();
                box.x += selectionState.activeTransformDelta.x;
                box.y += selectionState.activeTransformDelta.y;
                ctx.translate(selectionState.activeTransformDelta.x, selectionState.activeTransformDelta.y);
            } else if (selectionState.activeResizeScale !== null && selectionState.activeResizeAnchor !== null) {
                const scale = selectionState.activeResizeScale;
                const anchor = selectionState.activeResizeAnchor;
                box = box.clone();
                
                const x1 = anchor.x + (box.x - anchor.x) * scale.x;
                const y1 = anchor.y + (box.y - anchor.y) * scale.y;
                const x2 = anchor.x + (box.right - anchor.x) * scale.x;
                const y2 = anchor.y + (box.bottom - anchor.y) * scale.y;
                
                box.x = Math.min(x1, x2);
                box.y = Math.min(y1, y2);
                box.width = Math.abs(x2 - x1);
                box.height = Math.abs(y2 - y1);

                ctx.translate(anchor.x, anchor.y);
                ctx.scale(scale.x, scale.y);
                ctx.translate(-anchor.x, -anchor.y);
            } else if (selectionState.activeRotationAngle !== 0) {
                const cx = box.centerX;
                const cy = box.centerY;
                ctx.translate(cx, cy);
                ctx.rotate(selectionState.activeRotationAngle);
                ctx.translate(-cx, -cy);
            }

            const renderedSelectedLinkGroups = new Set<string>();
            const isRO = !!isReadOnly;
            const linkCfg = this.getLinkRenderSettings(settings);
            // Hoisted once instead of re-filtering the whole page per newly-seen group.
            const selectedElements = page.elements.filter(el => selectionState.selectedIds.has(el.id));

            // Draw the selected elements using their native style (allowing real-time previews)
            for (const id of selectionState.selectedIds) {
                const element = page.getElementById(id);
                if (!element) continue;

                if (isRO && element.url) {
                    this.renderLinkHighlight(ctx, element, selectedElements, renderedSelectedLinkGroups, linkCfg);
                }

                this.withElementRotation(ctx, element, () => {
                    this.withLinkColorOverride(element, isReadOnly, linkCfg.strokeColor, () => {
                        this.renderElementContent(ctx, element);
                    });
                });
            }
            ctx.restore();

            // Draw sleek, subtle dashed bounding box around the selected elements
            ctx.save();
            if (selectionState.activeRotationAngle !== 0) {
                const cx = selectionState.unifiedBounds.centerX;
                const cy = selectionState.unifiedBounds.centerY;
                ctx.translate(cx, cy);
                ctx.rotate(selectionState.activeRotationAngle);
                ctx.translate(-cx, -cy);
            }
            
            ctx.strokeStyle = 'rgba(100, 150, 255, 0.5)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.rect(box.x, box.y, box.width, box.height);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw handles at the corners and midpoints of the updated box
            ctx.fillStyle = 'rgba(100, 150, 255, 0.5)';
            ctx.strokeStyle = 'rgba(100, 150, 255, 0.5)';
            const zoom = viewport.getZoom();
            ctx.lineWidth = 2 / zoom;
            const hSize = 20 / zoom;
            const hHalf = hSize / 2;
            
            const drawHandle = (hx: number, hy: number) => {
                ctx.beginPath();
                ctx.rect(hx - hHalf, hy - hHalf, hSize, hSize);
                ctx.fill();
                ctx.stroke();
            };

            // Corner handles
            drawHandle(box.x, box.y);
            drawHandle(box.right, box.y);
            drawHandle(box.right, box.bottom);
            drawHandle(box.x, box.bottom);

            // Midpoint handles
            drawHandle(box.x + box.width / 2, box.y);
            drawHandle(box.right, box.y + box.height / 2);
            drawHandle(box.x + box.width / 2, box.bottom);
            drawHandle(box.x, box.y + box.height / 2);

            // Floating rotation handle (only rendered when not actively rotating)
            if (selectionState.activeRotationAngle === 0) {
                const handleOffset = 45 / zoom;
                const canvasEl = this.overlayCanvas;
                const effScale = viewport.getEffectiveScale();
                const vpOffset = viewport.getOffset();
                const screenRight = box.right * effScale + vpOffset.x;
                const screenLimit = getElementCssWidth(canvasEl, canvasEl.width / this.dpr || this.pageWidth);
                
                const isExceeded = (screenRight + 45 > screenLimit) || (box.right + 45 > this.pageWidth);
                const rotX = isExceeded ? (box.x - handleOffset) : (box.right + handleOffset);
                const rotY = box.centerY;
                
                const rRadius = 24 / zoom;
                
                ctx.save();
                ctx.fillStyle = 'rgba(100, 150, 255, 0.5)'; // Matching dashed box fill
                ctx.strokeStyle = 'rgba(100, 150, 255, 0.5)'; // Matching dashed box stroke
                ctx.lineWidth = 2 / zoom;
                ctx.beginPath();
                ctx.arc(rotX, rotY, rRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                
                // Draw two rotating arrows symbol inside it (white color)
                ctx.strokeStyle = '#ffffff';
                ctx.fillStyle = '#ffffff';
                ctx.lineWidth = 2.5 / zoom;
                
                const arcRadius = rRadius * 0.45;
                
                // Top-right arrow arc
                ctx.beginPath();
                ctx.arc(rotX, rotY, arcRadius, Math.PI * 1.15, Math.PI * 1.8);
                ctx.stroke();
                
                // Top-right arrowhead at Math.PI * 1.8
                const tipX1 = rotX + arcRadius * Math.cos(Math.PI * 1.8);
                const tipY1 = rotY + arcRadius * Math.sin(Math.PI * 1.8);
                ctx.save();
                ctx.translate(tipX1, tipY1);
                ctx.rotate(Math.PI * 1.8 + Math.PI / 2);
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(-5 / zoom, -7 / zoom);
                ctx.lineTo(5 / zoom, -7 / zoom);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
                
                // Bottom-left arrow arc
                ctx.beginPath();
                ctx.arc(rotX, rotY, arcRadius, Math.PI * 0.15, Math.PI * 0.8);
                ctx.stroke();
                
                // Bottom-left arrowhead at Math.PI * 0.8
                const tipX2 = rotX + arcRadius * Math.cos(Math.PI * 0.8);
                const tipY2 = rotY + arcRadius * Math.sin(Math.PI * 0.8);
                ctx.save();
                ctx.translate(tipX2, tipY2);
                ctx.rotate(Math.PI * 0.8 + Math.PI / 2);
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(-5 / zoom, -7 / zoom);
                ctx.lineTo(5 / zoom, -7 / zoom);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
                
                ctx.restore();
            }
            
            ctx.restore();

            // Draw Angle HUD if rotating (remains unrotated/horizontal above the selection)
            if (selectionState.activeRotationAngle !== 0) {
                ctx.save();
                let degrees = Math.round((selectionState.activeRotationAngle * 180) / Math.PI);
                degrees = (degrees % 360 + 360) % 360; // Clean 0-360 scale
                const degreeText = `${degrees}°`;

                ctx.font = `bold ${18 / zoom}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
                ctx.shadowBlur = 4;

                const textWidth = ctx.measureText(degreeText).width;
                const textHeight = 18 / zoom;
                const paddingX = 12 / zoom;
                const paddingY = 8 / zoom;
                
                const badgeW = textWidth + paddingX * 2;
                const badgeH = textHeight + paddingY * 2;
                const badgeX = box.centerX - badgeW / 2;
                const badgeY = box.y - (55 / zoom) - badgeH / 2;

                // Draw solid background pill
                ctx.fillStyle = 'rgba(30, 41, 59, 0.9)'; // Dark slate background
                ctx.strokeStyle = 'rgba(100, 150, 255, 0.5)'; // Matching blue border
                ctx.lineWidth = 2 / zoom;
                this.fillRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 6 / zoom);
                ctx.stroke();

                // Draw text
                ctx.fillStyle = '#ffffff';
                ctx.fillText(degreeText, box.centerX, box.y - (55 / zoom));
                ctx.restore();
            }
        }

        ctx.restore();
    }

    /** Resize all canvases to match container dimensions. */
    resize(width: number, height: number): void {
        this.dpr = window.devicePixelRatio || 1;
        this.canvasWidth = Math.max(1, Math.round(width * this.dpr));
        this.canvasHeight = Math.max(1, Math.round(height * this.dpr));

        for (const canvas of [
            this.bgCanvas,
            this.completedCanvas,
            this.activeCanvas,
            this.overlayCanvas,
        ]) {
            canvas.width = this.canvasWidth;
            canvas.height = this.canvasHeight;
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
        }

        // Setting .width/.height on a canvas clears its bitmap per spec —
        // without this, bgCanvas/completedCanvas would go blank after any
        // resize until the next structural change happened to trigger a
        // redraw. fullRender() is a safe no-op here on the very first call
        // (from the constructor, above), since lastPage/lastViewport aren't
        // set yet.
        this.fullRender();
    }

    /** Get the visible (active) canvas element. */
    getCanvas(): HTMLCanvasElement {
        return this.activeCanvas;
    }

    /** Clean up and remove canvas from DOM. */
    destroy(): void {
        this.activeCanvas.remove();
        this.overlayCanvas.remove();
    }
}
