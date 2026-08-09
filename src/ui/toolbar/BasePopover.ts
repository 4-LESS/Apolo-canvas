export abstract class BasePopover {
    public el: HTMLElement;
    public isOpen = false;
    protected plugin: any;
    private outsideListener: ((e: PointerEvent) => void) | null = null;
    private activeAnchor: HTMLElement | null = null;
    private mountedInModal = false;

    /**
     * `overlayParent` is deliberately separate from `dismissBoundary`.
     *
     * Global toolbar popovers live in the workspace root so changing leaves cannot
     * detach them.  Their trigger buttons remain in the toolbar, however, so the
     * toolbar still forms part of the click-away boundary.
     */
    constructor(
        private readonly overlayParent: HTMLElement,
        plugin: any,
        className: string,
        private readonly dismissBoundary: HTMLElement = overlayParent
    ) {
        this.plugin = plugin;
        this.el = overlayParent.createDiv({ cls: `ink-popover ${className} is-hidden` });
        this.buildContent();
    }

    protected abstract buildContent(): void;

    protected onOutsidePointerDown(): void {
        // Optional hook for popovers with external state to reset.
    }

    public toggle(anchorEl: HTMLElement): void {
        this.isOpen ? this.hide() : this.show(anchorEl);
    }

    public show(anchorEl: HTMLElement): void {
        const isInsideModal = typeof anchorEl.closest === 'function' && (anchorEl.closest('.modal') !== null || anchorEl.closest('.ink-manager-palette-row') !== null);
        this.mountedInModal = isInsideModal;
        if (isInsideModal && typeof document !== 'undefined' && document.body) {
            document.body.appendChild(this.el);
            this.el.style.zIndex = '10005';
        } else {
            if (this.el.parentElement !== this.overlayParent) {
                if (typeof this.overlayParent.appendChild === 'function') {
                    this.overlayParent.appendChild(this.el);
                }
            }
            this.el.style.zIndex = '';
        }

        this.removeClass(this.el, 'is-hidden');
        this.isOpen = true;
        this.activeAnchor = anchorEl;
        this.alignToAnchor(anchorEl);
        this.registerOutsideClickGuard();
    }

    public hide(): void {
        this.addClass(this.el, 'is-hidden');
        this.isOpen = false;
        this.activeAnchor = null;
        this.teardownOutsideClickGuard();
        if (this.el.parentElement !== this.overlayParent) {
            if (typeof this.overlayParent.appendChild === 'function') {
                this.overlayParent.appendChild(this.el);
            }
        }
        this.mountedInModal = false;
        this.el.style.zIndex = '';
    }

    public reposition(): void {
        if (this.isOpen && this.activeAnchor) {
            this.alignToAnchor(this.activeAnchor);
        }
    }

    public destroy(): void {
        this.teardownOutsideClickGuard();
        this.activeAnchor = null;
        this.el.remove();
    }

    protected addClass(el: HTMLElement, cls: string): void {
        if (typeof el.addClass === 'function') el.addClass(cls);
        else el.classList.add(cls);
    }

    protected removeClass(el: HTMLElement, cls: string): void {
        if (typeof el.removeClass === 'function') el.removeClass(cls);
        else el.classList.remove(cls);
    }

    protected alignToAnchor(anchorEl: HTMLElement): void {
        const parent = this.el.parentElement;
        if (!parent) return;

        const isViewportOverlay = typeof document !== 'undefined' && parent === document.body;
        this.el.style.position = isViewportOverlay ? 'fixed' : 'absolute';
        const parentRect = parent.getBoundingClientRect?.();
        const anchorRect = anchorEl.getBoundingClientRect?.();
        const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 800;
        const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 600;
        const parentLeft = isViewportOverlay ? 0 : (parentRect?.left ?? 0);
        const parentTop = isViewportOverlay ? 0 : (parentRect?.top ?? 0);
        const parentWidth = isViewportOverlay ? screenWidth : (parentRect?.width || screenWidth);
        const parentHeight = isViewportOverlay ? screenHeight : (parentRect?.height || screenHeight);
        const anchorLeft = anchorRect?.left ?? 0;
        const anchorTop = anchorRect?.top ?? 0;
        const anchorWidth = anchorRect?.width ?? 0;
        const anchorHeight = anchorRect?.height ?? 0;
        const anchorRight = anchorRect?.right ?? (anchorLeft + anchorWidth);
        const anchorBottom = anchorRect?.bottom ?? (anchorTop + anchorHeight);
        const gap = 12;

        const isInsideModal = typeof anchorEl.closest === 'function' && (anchorEl.closest('.modal') !== null || anchorEl.closest('.ink-manager-palette-row') !== null);
        if (isInsideModal) {
            const popoverWidth = this.el.getBoundingClientRect?.().width || 220;
            const left = Math.max(gap, Math.min(parentWidth - popoverWidth - gap, anchorLeft - parentLeft + (anchorWidth - popoverWidth) / 2));
            const top = anchorBottom - parentTop + gap;
            this.el.style.left = `${left}px`;
            this.el.style.top = `${top}px`;
        } else {
            const toolbarRect = this.dismissBoundary.getBoundingClientRect?.();
            const toolbarLeft = toolbarRect?.left ?? 0;
            const toolbarTop = toolbarRect?.top ?? 0;
            const toolbarRight = toolbarRect?.right ?? toolbarLeft;
            const toolbarBottom = toolbarRect?.bottom ?? toolbarTop;
            const isVert = this.dismissBoundary.classList?.contains?.('is-vertical-orientation') ?? true;

            const popoverRect = this.el?.getBoundingClientRect?.() ?? { width: 210, height: 200 };
            const popoverWidth = popoverRect.width > 50 ? popoverRect.width : 210;
            const popoverHeight = popoverRect.height > 50 ? popoverRect.height : 220;

            const toolbarMidX = (toolbarLeft + toolbarRight) / 2;
            const isLeftHalf = toolbarMidX < parentLeft + parentWidth / 2;
            const toolbarMidY = (toolbarTop + toolbarBottom) / 2;
            const isTopHalf = toolbarMidY < parentTop + parentHeight / 2;
            let left: number;
            let top: number;

            if (isVert) {
                if (isLeftHalf) {
                    left = toolbarRight - parentLeft + gap;
                } else {
                    left = toolbarLeft - parentLeft - popoverWidth - gap;
                }
                top = anchorTop - parentTop;
            } else {
                if (isTopHalf) {
                    top = toolbarBottom - parentTop + gap;
                } else {
                    top = toolbarTop - parentTop - popoverHeight - gap;
                }
                left = anchorLeft - parentLeft + anchorWidth / 2 - popoverWidth / 2;
            }

            left = Math.max(gap, Math.min(Math.max(gap, parentWidth - popoverWidth - gap), left));
            top = Math.max(gap, Math.min(Math.max(gap, parentHeight - popoverHeight - gap), top));
            this.el.style.left = `${left}px`;
            this.el.style.top = `${top}px`;
        }
    }

    private registerOutsideClickGuard(): void {
        this.teardownOutsideClickGuard();
        if (typeof document === 'undefined') return;
        this.outsideListener = (e: PointerEvent) => {
            const target = e.target as Node;
            const targetEl = target instanceof Element ? target : null;
            if (this.mountedInModal) {
                if (!this.el.contains(target) && (!targetEl || !targetEl.closest('.ink-palette-color-circle'))) {
                    this.onOutsidePointerDown();
                    this.hide();
                }
            } else {
                if (!this.el.contains(target) && !this.dismissBoundary.contains(target)) {
                    this.onOutsidePointerDown();
                    this.hide();
                }
            }
        };
        if (this.plugin?.registerDomEvent) {
            this.plugin.registerDomEvent(document, 'pointerdown', this.outsideListener);
        } else {
            document.addEventListener('pointerdown', this.outsideListener);
        }
    }

    private teardownOutsideClickGuard(): void {
        if (!this.outsideListener) return;
        if (typeof document !== 'undefined') {
            document.removeEventListener('pointerdown', this.outsideListener);
        }
        this.outsideListener = null;
    }
}
