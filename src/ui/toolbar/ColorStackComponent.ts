import type { Toolbar } from '../Toolbar';
import { ColorSwatchComponent } from './components/ColorSwatchComponent';

export interface ColorStackCallbacks {
    /** Single tap: apply the color at slotIndex immediately. */
    onSelect: (anchor: HTMLButtonElement, slotIndex: number) => void;
    /** Double-tap: open/close the color picker popover anchored to the slot button. */
    onOpenPicker: (anchor: HTMLButtonElement, slotIndex: number) => void;
}

export class ColorStackComponent {
    public containerEl: HTMLElement;

    /** Exposed for Toolbar getter shims required by existing tests. */
    public slotBtns: HTMLButtonElement[] = [];

    public penSwatch: ColorSwatchComponent;
    public highlighterSwatch: ColorSwatchComponent;
    private currentSwatch: ColorSwatchComponent;

    private callbacks: ColorStackCallbacks;
    private toolbar: Toolbar;
    private suppressNextDblClick = false;

    constructor(parent: HTMLElement, callbacks: ColorStackCallbacks, toolbar: Toolbar) {
        this.callbacks = callbacks;
        this.toolbar = toolbar;
        this.containerEl = parent.createDiv({ cls: 'ink-color-slot-stack' });

        this.penSwatch = new ColorSwatchComponent(this.containerEl, {
            orientation: 'vertical',
            toolType: 'pen'
        }, toolbar);

        this.highlighterSwatch = new ColorSwatchComponent(this.containerEl, {
            orientation: 'vertical',
            toolType: 'highlighter'
        }, toolbar);

        this.currentSwatch = this.penSwatch;
        this.slotBtns.push(...this.currentSwatch.slotBtns);

        // Hide the highlighter swatch initially
        this.highlighterSwatch.containerEl.style.display = 'none';

        this.bindEvents(this.penSwatch);
        this.bindEvents(this.highlighterSwatch);
    }

    public setOrientation(orientation: 'vertical' | 'horizontal'): void {
        this.penSwatch.setOrientation(orientation);
        this.highlighterSwatch.setOrientation(orientation);
        this.containerEl.classList.toggle('is-vertical', orientation === 'vertical');
        this.containerEl.classList.toggle('is-horizontal', orientation === 'horizontal');
    }

    private bindEvents(swatch: ColorSwatchComponent): void {
        swatch.slotBtns.forEach((btn, i) => {
            // ── Pointer-down: capture pointer ─────────────────────────────
            btn.addEventListener('pointerdown', (e) => {
                if (typeof btn.setPointerCapture === 'function') {
                    try { btn.setPointerCapture(e.pointerId); } catch { /* ignore */ }
                }
            });

            // ── Cancel capture on pointer leave / cancel ───────────────
            const cancelCapture = (e: PointerEvent) => {
                if (typeof btn.releasePointerCapture === 'function') {
                    try { btn.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
                }
            };
            btn.addEventListener('pointerleave', cancelCapture);
            btn.addEventListener('pointercancel', cancelCapture);

            // ── Pointer-up: single-tap action ────────────────────────────
            btn.addEventListener('pointerup', (e) => {
                if (typeof btn.releasePointerCapture === 'function') {
                    try { btn.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
                }
                e?.preventDefault?.();
                e?.stopPropagation?.();
                this.handleSlotClick(swatch, btn, i);
            });

            // ── Double-tap: color picker popover ─────────────────────────
            const onDblClick = (e: MouseEvent) => {
                e?.preventDefault?.();
                e?.stopPropagation?.();
                if (this.suppressNextDblClick) {
                    this.suppressNextDblClick = false;
                    return;
                }
                if (!this.isTrueSecondClick(swatch, i)) return;
                this.callbacks.onOpenPicker(btn, i);
            };
            btn.addEventListener('dblclick', onDblClick);
            // Typo alias kept for forward-compat with legacy event dispatch
            btn.addEventListener('dbclick', onDblClick as EventListener);

            btn.addEventListener('click', (e: MouseEvent) => {
                if (e.detail !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                this.handleSlotClick(swatch, btn, i);
            });
        });
    }

    private handleSlotClick(swatch: ColorSwatchComponent, btn: HTMLButtonElement, clickedIndex: number): void {
        if (this.isActiveSlot(swatch, clickedIndex)) {
            this.suppressNextDblClick = true;
            this.callbacks.onOpenPicker(btn, clickedIndex);
            return;
        }

        this.callbacks.onSelect(btn, clickedIndex);
    }

    private isTrueSecondClick(swatch: ColorSwatchComponent, clickedIndex: number): boolean {
        return this.isActiveSlot(swatch, clickedIndex);
    }

    private isActiveSlot(swatch: ColorSwatchComponent, clickedIndex: number): boolean {
        const toolType = swatch.config.toolType === 'highlighter' ? 'highlighter' : 'pen';
        const { activeIndex } = this.toolbar.getPaletteData(toolType === 'highlighter');
        return clickedIndex === activeIndex;
    }

    public resetClickCycle(): void {
        this.suppressNextDblClick = false;
    }

    /**
     * Update the background color and active selection border on each slot button.
     *
     * @param colors      Array of CSS color strings (length must match slotCount = 4).
     * @param activeIndex Index of the currently selected color slot.
     * @param toolName    Name of the currently active tool.
     */
    public syncColorSlots(colors: string[], activeIndex: number, toolName?: string): void {
        const activeTool = toolName ?? this.toolbar.focusedEngineRef.get()?.getToolName() ?? 'pen';
        if (activeTool === 'highlighter') {
            if (this.currentSwatch !== this.highlighterSwatch) this.resetClickCycle();
            this.penSwatch.containerEl.style.display = 'none';
            this.highlighterSwatch.containerEl.style.display = '';
            this.currentSwatch = this.highlighterSwatch;
        } else {
            if (this.currentSwatch !== this.penSwatch) this.resetClickCycle();
            this.highlighterSwatch.containerEl.style.display = 'none';
            this.penSwatch.containerEl.style.display = '';
            this.currentSwatch = this.penSwatch;
        }

        // Mutate array in-place to preserve any cached array references
        this.slotBtns.length = 0;
        this.slotBtns.push(...this.currentSwatch.slotBtns);

        this.currentSwatch.refresh();
    }
}
