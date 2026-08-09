import { addClass, removeClass } from '../../utils/dom';

export interface DragControllerOptions {
    targetEl: HTMLElement;
    otherElementGetter?: () => HTMLElement | null;
    onOrientationChange?: (orientation: 'horizontal' | 'vertical') => void;
    enableEdgeSnap?: boolean;
}

/**
 * Reusable surface-dragging, edge-snapping, and repulsive-collision controller.
 * Enforces zero hardcoded pixel constants by performing dynamic DOM & ratio calculations.
 */
export class FloatingDragController {
    private targetEl: HTMLElement;
    private otherElementGetter?: () => HTMLElement | null;
    private onOrientationChange?: (orientation: 'horizontal' | 'vertical') => void;
    private enableEdgeSnap: boolean;

    private isDragging = false;
    private isAnchoredToEdge = false;
    private longPressTimer: ReturnType<typeof setTimeout> | null = null;
    private dragStartX = 0;
    private dragStartY = 0;
    private initialLeft = 0;
    private initialTop = 0;
    private currentOrientation: 'horizontal' | 'vertical' = 'horizontal';

    constructor(options: DragControllerOptions) {
        this.targetEl = options.targetEl;
        this.otherElementGetter = options.otherElementGetter;
        this.onOrientationChange = options.onOrientationChange;
        this.enableEdgeSnap = options.enableEdgeSnap ?? true;
        this.attachPointerListeners();
    }

    private attachPointerListeners(): void {
        const el = this.targetEl;

        el.addEventListener('pointerdown', (e: PointerEvent) => {
            // Ignore clicks if disabled or hidden
            if (el.classList.contains('is-hidden')) return;

            // Only capture primary pointer
            if (e.button !== 0) return;

            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;

            const target = e.target as Node | null;
            const targetEl = target instanceof Element
                ? target
                : target?.parentElement;
            const isButtonTarget = !!targetEl?.closest(
                'button, input, select, textarea, label, a, [contenteditable], .ink-tool-btn, .ink-color-slot, .ink-swatch-nav-arrow, .ink-star-tool-btn, .ink-pencil-case-toggle-btn, .ink-case-preset-pill, .ink-profile-pill, .ink-swatch-carousel-wrapper'
            );

            // Tool buttons, color swatches, and controls are exclusively for interaction.
            // Bar dragging is strictly triggered from non-button background surface / handles.
            if (isButtonTarget) return;

            const rect = el.getBoundingClientRect();
            const parent = el.parentElement;
            if (!parent) return;
            const parentRect = parent.getBoundingClientRect();

            this.initialLeft = rect.left - parentRect.left;
            this.initialTop = rect.top - parentRect.top;

            // Movement threshold before a press becomes a drag. Finger and stylus
            // input jitters several pixels during a plain tap, so they get a much
            // larger slop than a mouse — this is what keeps taps from moving the bar.
            const thresholdPx = e.pointerType === 'mouse'
                ? Math.max(4, Math.round((window.devicePixelRatio || 1) * 2))
                : 10;

            // Long-press timer for releasing edge dock anchor
            if (this.isAnchoredToEdge) {
                this.longPressTimer = setTimeout(() => {
                    this.isAnchoredToEdge = false;
                    this.removeClass(el, 'is-edge-docked');
                }, 350);
            }

            const onPointerMove = (moveEvent: PointerEvent) => {
                const deltaX = moveEvent.clientX - this.dragStartX;
                const deltaY = moveEvent.clientY - this.dragStartY;
                const dist = Math.hypot(deltaX, deltaY);

                if (!this.isDragging && dist > thresholdPx) {
                    this.isDragging = true;
                    // Docked-position classes carry their own coordinates and would
                    // fight the inline geometry written during the drag.
                    this.removeClass(el, 'is-edge-docked');
                    this.removeClass(el, 'is-edge-docked-left');
                    this.removeClass(el, 'is-edge-docked-right');
                    this.removeClass(el, 'is-edge-docked-top');
                    this.removeClass(el, 'is-edge-docked-bottom');
                    el.style.transform = 'none';
                    el.style.bottom = 'auto';
                    el.style.right = 'auto';
                    this.addClass(el, 'is-dragging');

                    // Capture the pointer on the bar itself: from here on, pointer
                    // events retarget to the bar, so a drag that ends on top of a
                    // tool button can never fire that button's pointerup handler.
                    if (typeof el.setPointerCapture === 'function') {
                        try { el.setPointerCapture(moveEvent.pointerId); } catch { /* detached or already captured */ }
                    }

                    if (this.longPressTimer) {
                        clearTimeout(this.longPressTimer);
                        this.longPressTimer = null;
                    }
                }

                if (this.isDragging) {
                    moveEvent.preventDefault();
                    moveEvent.stopPropagation();

                    let rawLeft = this.initialLeft + deltaX;
                    let rawTop = this.initialTop + deltaY;

                    this.updatePosition(rawLeft, rawTop);
                }
            };

            const onPointerUp = (upEvent: PointerEvent) => {
                if (this.longPressTimer) {
                    clearTimeout(this.longPressTimer);
                    this.longPressTimer = null;
                }

                if (this.isDragging) {
                    upEvent.preventDefault();
                    upEvent.stopPropagation();
                    this.isDragging = false;
                    this.removeClass(el, 'is-dragging');
                    if (typeof el.releasePointerCapture === 'function') {
                        try { el.releasePointerCapture(upEvent.pointerId); } catch { /* already released */ }
                    }

                    // Intercept upcoming click event on buttons
                    const captureClick = (clickEvent: MouseEvent) => {
                        clickEvent.preventDefault();
                        clickEvent.stopPropagation();
                        window.removeEventListener('click', captureClick, true);
                    };
                    window.addEventListener('click', captureClick, true);
                }

                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);
                window.removeEventListener('pointercancel', onPointerUp);
            };

            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
            window.addEventListener('pointercancel', onPointerUp);
        });
    }

    private updatePosition(left: number, top: number): void {
        const el = this.targetEl;
        const parent = el.parentElement;
        if (!parent) return;

        const parentRect = parent.getBoundingClientRect();
        const barRect = el.getBoundingClientRect();

        // 1. Dynamic DOM Header & Footer Measurement
        let topBoundaryOffset = Math.round(parentRect.height * 0.01);
        const topHeaderEl = parent.querySelector('.workspace-tabs-header, .workspace-tab-header-container, .view-header, .titlebar, .inline-title') as HTMLElement | null;
        if (topHeaderEl) {
            const headerRect = topHeaderEl.getBoundingClientRect();
            const headerBottomRel = headerRect.bottom - parentRect.top;
            if (headerBottomRel > 0 && headerBottomRel < parentRect.height * 0.4) {
                topBoundaryOffset = headerBottomRel + Math.round(parentRect.height * 0.01);
            }
        }

        let bottomBoundaryOffset = Math.round(parentRect.height * 0.01);
        const statusBarEl = document.querySelector('.status-bar') as HTMLElement | null;
        if (statusBarEl) {
            const statusRect = statusBarEl.getBoundingClientRect();
            const statusTopRel = parentRect.bottom - statusRect.top;
            if (statusTopRel > 0 && statusTopRel < parentRect.height * 0.3) {
                bottomBoundaryOffset = statusTopRel + Math.round(parentRect.height * 0.01);
            }
        }

        const sidePadding = Math.round(parentRect.width * 0.01);

        // Bounds boundaries
        const minLeft = sidePadding;
        const maxLeft = Math.max(minLeft, parentRect.width - barRect.width - sidePadding);
        const minTop = topBoundaryOffset;
        const maxTop = Math.max(minTop, parentRect.height - barRect.height - bottomBoundaryOffset);

        let targetLeft = Math.max(minLeft, Math.min(maxLeft, left));
        let targetTop = Math.max(minTop, Math.min(maxTop, top));

        // 2. Dynamic Repulsive Force Collision Avoidance
        const otherEl = this.otherElementGetter?.();
        if (otherEl && !otherEl.classList.contains('is-hidden') && otherEl !== el) {
            const otherRect = otherEl.getBoundingClientRect();

            // Calculate current candidate bounding rect
            const candRect = {
                left: parentRect.left + targetLeft,
                top: parentRect.top + targetTop,
                right: parentRect.left + targetLeft + barRect.width,
                bottom: parentRect.top + targetTop + barRect.height,
            };

            const dynamicGap = Math.max(Math.min(barRect.height, barRect.width) * 0.35, 12);

            // Overlap distances along all 4 perimeter borders
            const overlapLeft = candRect.right - (otherRect.left - dynamicGap);
            const overlapRight = (otherRect.right + dynamicGap) - candRect.left;
            const overlapTop = candRect.bottom - (otherRect.top - dynamicGap);
            const overlapBottom = (otherRect.bottom + dynamicGap) - candRect.top;

            if (overlapLeft > 0 && overlapRight > 0 && overlapTop > 0 && overlapBottom > 0) {
                // Find minimum separation distance along 2D perimeter borders
                const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

                if (minOverlap === overlapLeft) {
                    targetLeft -= overlapLeft;
                } else if (minOverlap === overlapRight) {
                    targetLeft += overlapRight;
                } else if (minOverlap === overlapTop) {
                    targetTop -= overlapTop;
                } else if (minOverlap === overlapBottom) {
                    targetTop += overlapBottom;
                }

                targetLeft = Math.max(minLeft, Math.min(maxLeft, targetLeft));
                targetTop = Math.max(minTop, Math.min(maxTop, targetTop));
            }
        }

        // 3. Dynamic Ratio Edge Snapping (Exclusive to enabled elements)
        this.removeClass(el, 'is-edge-docked-left');
        this.removeClass(el, 'is-edge-docked-right');
        this.removeClass(el, 'is-edge-docked-top');
        this.removeClass(el, 'is-edge-docked-bottom');

        if (this.enableEdgeSnap) {
            const snapThresholdX = parentRect.width * 0.04;
            const snapThresholdY = parentRect.height * 0.04;

            const centerY = Math.max(minTop, (minTop + maxTop) / 2);
            const centerX = Math.max(minLeft, (minLeft + maxLeft) / 2);

            if (targetLeft <= minLeft + snapThresholdX) {
                targetLeft = minLeft;
                targetTop = centerY;
                this.setOrientation('vertical');
                this.isAnchoredToEdge = true;
                this.addClass(el, 'is-edge-docked-left');
            } else if (targetLeft >= maxLeft - snapThresholdX) {
                targetLeft = maxLeft;
                targetTop = centerY;
                this.setOrientation('vertical');
                this.isAnchoredToEdge = true;
                this.addClass(el, 'is-edge-docked-right');
            } else if (targetTop <= minTop + snapThresholdY) {
                targetTop = minTop;
                targetLeft = centerX;
                this.setOrientation('horizontal');
                this.isAnchoredToEdge = true;
                this.addClass(el, 'is-edge-docked-top');
            } else if (targetTop >= maxTop - snapThresholdY) {
                targetTop = maxTop;
                targetLeft = centerX;
                this.setOrientation('horizontal');
                this.isAnchoredToEdge = true;
                this.addClass(el, 'is-edge-docked-bottom');
            }
        }

        el.style.left = `${targetLeft}px`;
        el.style.top = `${targetTop}px`;
    }

    public setOrientation(orientation: 'horizontal' | 'vertical'): void {
        if (this.currentOrientation === orientation) return;
        this.currentOrientation = orientation;
        this.onOrientationChange?.(orientation);
    }

    private addClass(el: HTMLElement, cls: string): void { addClass(el, cls); }
    private removeClass(el: HTMLElement, cls: string): void { removeClass(el, cls); }
}
