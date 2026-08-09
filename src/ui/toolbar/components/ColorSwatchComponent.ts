import type { Toolbar } from '../../Toolbar';
import { isColorMatch } from '../colorUtils';

export interface ColorSwatchComponentConfig {
    orientation: 'vertical' | 'horizontal';
    toolType: 'pen' | 'highlighter' | 'shape';
    onSlotClick?: (colorIndex: number, colorValue: string) => void;
    isStatic?: boolean;
}

export class ColorSwatchComponent {
    public containerEl!: HTMLElement;
    public dotsStripEl!: HTMLElement;
    public slotBtns: HTMLButtonElement[] = [];
    public config: ColorSwatchComponentConfig;
    private toolbar: Toolbar;

    // Track instances for cross-instance sync
    private static instances: Set<ColorSwatchComponent> = new Set();

    // Event listener references for clean teardown
    private pointerDownListener: ((e: PointerEvent) => void) | null = null;
    private activeOnPointerUp: ((e: PointerEvent) => void) | null = null;
    private activeOnPointerCancel: ((e: PointerEvent) => void) | null = null;

    constructor(parent: HTMLElement, config: ColorSwatchComponentConfig, toolbar: Toolbar) {
        this.config = config;
        this.toolbar = toolbar;
        
        this.buildUI(parent);
        ColorSwatchComponent.instances.add(this);
    }

    private buildUI(parent: HTMLElement): void {
        this.containerEl = parent.createDiv({
            cls: `ink-swatch-carousel-wrapper is-${this.config.orientation}`
        });

        // 1. Paging Controls: Up/Left arrow (Omit if static)
        if (!this.config.isStatic) {
            const prevSvg = this.config.orientation === 'vertical'
                ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 8l-6 6h12z"/></svg>'
                : '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M14 6l-6 6 6 6z"/></svg>';

            this.prevArrowEl = this.containerEl.createEl('button', {
                cls: 'ink-swatch-nav-arrow',
                attr: { type: 'button', 'aria-label': 'Previous Palette' }
            }) as HTMLButtonElement;
            this.prevArrowEl.innerHTML = prevSvg;
            this.prevArrowEl.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.shiftPalette('prev');
            });
        }

        // 2. Dots Strip Container
        this.dotsStripEl = this.containerEl.createDiv({
            cls: 'ink-swatch-dots-strip'
        });
        this.dotsStripEl.style.touchAction = 'none'; // prevent touch scrolling from canceling pointer events

        // 3. Circle Button Slots (exactly 4)
        for (let i = 0; i < 4; i++) {
            const btn = this.dotsStripEl.createEl('button', {
                cls: 'ink-color-slot',
                attr: { type: 'button' }
            }) as HTMLButtonElement;
            this.slotBtns.push(btn);

            btn.addEventListener('click', (e) => {
                if (this.config.onSlotClick) {
                    if (this.config.isStatic) {
                        const recentColors = this.toolbar.plugin?.settings?.recentColors ?? [];
                        const color = recentColors[i] ?? '';
                        if (color) {
                            this.config.onSlotClick(i, color);
                        }
                    } else {
                        const isHighlighter = this.config.toolType === 'highlighter';
                        const { palette } = this.toolbar.getPaletteData(isHighlighter);
                        const color = palette.colors[i] ?? (isHighlighter ? '#ffff0080' : '#000000');
                        this.config.onSlotClick(i, color);
                    }
                }
            });
        }

        // 4. Paging Controls: Down/Right arrow (Omit if static)
        if (!this.config.isStatic) {
            const nextSvg = this.config.orientation === 'vertical'
                ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 16l-6-6h12z"/></svg>'
                : '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M10 6l6 6-6 6z"/></svg>';

            this.nextArrowEl = this.containerEl.createEl('button', {
                cls: 'ink-swatch-nav-arrow',
                attr: { type: 'button', 'aria-label': 'Next Palette' }
            }) as HTMLButtonElement;
            this.nextArrowEl.innerHTML = nextSvg;
            this.nextArrowEl.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.shiftPalette('next');
            });
        }

        // 5. Wire touch gesture tracking (Omit if static)
        if (!this.config.isStatic) {
            this.wireTouchSwiping();
        }

        // 6. Populate colors
        this.refresh();
    }

    public prevArrowEl: HTMLButtonElement | null = null;
    public nextArrowEl: HTMLButtonElement | null = null;

    public setOrientation(orientation: 'vertical' | 'horizontal'): void {
        if (this.config.orientation === orientation) return;
        this.config.orientation = orientation;
        this.containerEl.classList.toggle('is-vertical', orientation === 'vertical');
        this.containerEl.classList.toggle('is-horizontal', orientation === 'horizontal');

        if (this.prevArrowEl) {
            this.prevArrowEl.innerHTML = orientation === 'vertical'
                ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 8l-6 6h12z"/></svg>'
                : '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M14 6l-6 6 6 6z"/></svg>';
        }

        if (this.nextArrowEl) {
            this.nextArrowEl.innerHTML = orientation === 'vertical'
                ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 16l-6-6h12z"/></svg>'
                : '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M10 6l6 6-6 6z"/></svg>';
        }
    }

    private wireTouchSwiping(): void {
        const strip = this.dotsStripEl;
        let startX = 0;
        let startY = 0;
        let startTime = 0;

        const target = (typeof window !== 'undefined' && typeof window.addEventListener === 'function')
            ? window
            : strip;

        this.pointerDownListener = (e: PointerEvent) => {
            startX = e.clientX;
            startY = e.clientY;
            startTime = Date.now();

            const onPointerUp = (upEvent: PointerEvent) => {
                this.cleanupTransientListeners(target);

                const diffX = upEvent.clientX - startX;
                const diffY = upEvent.clientY - startY;
                const duration = Date.now() - startTime;
                const distance = Math.sqrt(diffX * diffX + diffY * diffY);

                // If displacement >= 5px, treat strictly as swipe and suppress default click
                if (distance >= 5) {
                    if (typeof upEvent.preventDefault === 'function') {
                        upEvent.preventDefault();
                    }
                    if (typeof upEvent.stopPropagation === 'function') {
                        upEvent.stopPropagation();
                    }

                    if (duration < 500) {
                        const dist = this.config.orientation === 'vertical' ? diffY : diffX;
                        const velocity = Math.abs(dist) / duration;
                        
                        // Threshold: distance > 30px, velocity > 0.15 px/ms
                        if (Math.abs(dist) > 30 && velocity > 0.15) {
                            if (dist > 0) {
                                this.shiftPalette('prev');
                            } else {
                                this.shiftPalette('next');
                            }
                        }
                    }
                }
            };

            const onPointerCancel = () => {
                this.cleanupTransientListeners(target);
            };

            this.activeOnPointerUp = onPointerUp;
            this.activeOnPointerCancel = onPointerCancel;

            target.addEventListener('pointerup', onPointerUp as EventListener, { passive: false });
            target.addEventListener('pointercancel', onPointerCancel as EventListener);
        };

        strip.addEventListener('pointerdown', this.pointerDownListener);
    }

    private cleanupTransientListeners(target?: any): void {
        const t = target || ((typeof window !== 'undefined' && typeof window.addEventListener === 'function') ? window : this.dotsStripEl);
        if (this.activeOnPointerUp && t && typeof t.removeEventListener === 'function') {
            t.removeEventListener('pointerup', this.activeOnPointerUp);
            this.activeOnPointerUp = null;
        }
        if (this.activeOnPointerCancel && t && typeof t.removeEventListener === 'function') {
            t.removeEventListener('pointercancel', this.activeOnPointerCancel);
            this.activeOnPointerCancel = null;
        }
    }

    public shiftPalette(dir: 'prev' | 'next'): void {
        const isHighlighter = this.config.toolType === 'highlighter';
        const { palettes, activePaletteId } = this.toolbar.getPaletteData(isHighlighter);
        if (palettes.length <= 1) return;

        let currentIdx = palettes.findIndex((p: any) => p.id === activePaletteId);
        if (currentIdx === -1) currentIdx = 0;

        let nextIdx = currentIdx;
        if (dir === 'prev') {
            nextIdx = (currentIdx - 1 + palettes.length) % palettes.length;
        } else {
            nextIdx = (currentIdx + 1) % palettes.length;
        }

        const newPalette = palettes[nextIdx];
        const settings = this.toolbar.plugin?.settings;
        if (isHighlighter) {
            if (settings) settings.activeHighlighterPaletteId = newPalette.id;
        } else {
            if (settings) settings.activePenPaletteId = newPalette.id;
        }

        const activeColorIdx = (isHighlighter ? settings?.activeHighlighterColorIndex : settings?.activePenColorIndex) ?? 0;
        const newColor = newPalette.colors[activeColorIdx] ?? newPalette.colors[0];

        const engine = this.toolbar.focusedEngineRef.get();
        if (engine) {
            if (this.config.toolType === 'shape') {
                if (engine.currentFillColor && engine.currentFillColor !== 'transparent') {
                    engine.currentFillColor = newColor;
                }
            } else {
                if (isHighlighter) {
                    if (settings) settings.lastHighlighterColorHex = newColor;
                } else {
                    if (settings) settings.lastPenColorHex = newColor;
                }
                engine.setPenColor(newColor);
            }
            engine.requestFullRender();
        }

        const saved = this.toolbar.plugin?.saveSettings?.();
        const finalize = () => {
            // Synchronously refresh all instances sharing this tool category/allocation
            ColorSwatchComponent.refreshAll(this.config.toolType);
            this.toolbar.syncToolState();

            // Refresh popover contents if open to match the newly shifted palette
            if (this.toolbar.colorPickerPopover.isOpen && this.toolbar.activePickerSlotIdx !== null) {
                const picker = this.toolbar.colorPickerPopover;
                if (picker.activeTriggerEl && picker.activeEngine) {
                    picker.showColorPicker(picker.activeTriggerEl, this.toolbar.activePickerSlotIdx, picker.activeEngine);
                }
            }
        };

        if (saved?.then) {
            saved.then(finalize);
        } else {
            finalize();
        }
    }

    public refresh(): void {
        if (this.config.isStatic) {
            const recentColors = this.toolbar.plugin?.settings?.recentColors ?? [];
            this.slotBtns.forEach((btn, idx) => {
                const color = recentColors[idx];
                if (color) {
                    btn.style.backgroundColor = color;
                    btn.style.display = '';

                    const engine = this.toolbar.focusedEngineRef.get();
                    const currentColor = engine ? engine.toolContext.currentColor : null;
                    if (currentColor && isColorMatch(btn.style.backgroundColor, currentColor)) {
                        btn.classList.add('is-selected');
                    } else {
                        btn.classList.remove('is-selected');
                    }
                } else {
                    btn.style.backgroundColor = 'transparent';
                    btn.style.display = 'none';
                }
            });
            return;
        }

        const isHighlighter = this.config.toolType === 'highlighter';
        const { palette, activeIndex } = this.toolbar.getPaletteData(isHighlighter);

        this.slotBtns.forEach((btn, idx) => {
            const color = palette.colors[idx] ?? (isHighlighter ? '#ffff0080' : '#000000');
            btn.style.backgroundColor = color;

            if (this.config.toolType !== 'shape') {
                if (idx === activeIndex) {
                    btn.classList.add('is-selected');
                } else {
                    btn.classList.remove('is-selected');
                }
            } else {
                const engine = this.toolbar.focusedEngineRef.get();
                const fillColor = engine?.currentFillColor ?? 'transparent';
                if (fillColor !== 'transparent' && isColorMatch(btn.style.backgroundColor, fillColor)) {
                    btn.classList.add('is-selected');
                } else {
                    btn.classList.remove('is-selected');
                }
            }
        });
    }

    public static refreshAll(toolType: 'pen' | 'highlighter' | 'shape'): void {
        ColorSwatchComponent.instances.forEach(inst => {
            const t1 = inst.config.toolType;
            const t2 = toolType;

            const share = (t1 === t2) || 
                          (t1 === 'pen' && t2 === 'shape') || 
                          (t1 === 'shape' && t2 === 'pen');

            if (share) {
                inst.refresh();
            }
        });
    }

    public destroy(): void {
        ColorSwatchComponent.instances.delete(this);
        this.cleanupTransientListeners();
        if (this.dotsStripEl) {
            if (this.pointerDownListener && typeof this.dotsStripEl.removeEventListener === 'function') {
                this.dotsStripEl.removeEventListener('pointerdown', this.pointerDownListener);
            }
        }
        if (this.containerEl && typeof this.containerEl.remove === 'function') {
            this.containerEl.remove();
        }
    }
}
