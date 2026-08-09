import { setIcon } from 'obsidian';
import { InkEngine } from '../../../engine/InkEngine';
import { BasePopover } from '../BasePopover';
import type { Toolbar } from '../../Toolbar';
import { ShapeRegistry } from '../../../shapes/ShapeRegistry';
import { ColorSwatchComponent } from '../components/ColorSwatchComponent';

export class ShapeOptionsPopover extends BasePopover {
    private _activeEngine: InkEngine | null = null;
    private get activeEngine(): InkEngine | null {
        return this._activeEngine || (this.toolbar ? (this.toolbar.focusedEngineRef?.get() ?? null) : null);
    }
    private set activeEngine(engine: InkEngine | null) {
        this._activeEngine = engine;
    }
    private shapeGridButtons: Map<string, HTMLButtonElement> = new Map();
    private thicknessValSpan!: HTMLSpanElement;
    private thicknessSlider!: HTMLInputElement;
    private fillCheckbox!: HTMLInputElement;
    private fillSwatchesComponent: ColorSwatchComponent | null = null;
    private fillSwatchesContainerEl!: HTMLDivElement;
    private fillSwatchesEl!: HTMLElement;

    constructor(parent: HTMLElement, plugin: any, private toolbar: Toolbar, dismissBoundary?: HTMLElement) {
        super(parent, plugin, 'ink-shape-options-popover', dismissBoundary);
    }

    protected buildContent(): void {
        this.shapeGridButtons = new Map();
        this.el.createDiv({ cls: 'ink-style-header', text: 'SHAPE' });
        const shapeGrid = this.el.createDiv({ cls: 'ink-shape-grid' });
        const shapes = ShapeRegistry.getAll();

        shapes.forEach((def) => {
            const btn = shapeGrid.createEl('button', {
                cls: 'ink-tool-btn shape-grid-btn',
                attr: { title: def.name }
            }) as HTMLButtonElement;
            const iconSpan = btn.createSpan({ cls: 'ink-toolbar-icon' });
            setIcon(iconSpan, def.icon);

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.activeEngine) {
                    const shapeTool = this.activeEngine.getTool('shape') as any;
                    shapeTool?.setActiveShape?.(def.id);
                    this.activeEngine.requestFullRender();
                    this.highlightActiveShape(def.id);
                }
            });
            this.shapeGridButtons.set(def.id, btn);
        });

        const thicknessRow = this.el.createDiv({ cls: 'ink-slider-row' });
        const thicknessHeader = thicknessRow.createDiv({ cls: 'ink-style-header-row' });
        thicknessHeader.createDiv({ cls: 'ink-style-header', text: 'THICKNESS' });

        const thicknessInputRow = thicknessRow.createDiv({ cls: 'ink-slider-input-row' });
        this.thicknessSlider = thicknessInputRow.createEl('input', {
            cls: 'ink-thickness-slider',
            attr: { type: 'range', min: '1', max: '30', step: '1', value: '3' }
        }) as HTMLInputElement;
        this.thicknessValSpan = thicknessInputRow.createSpan({ cls: 'ink-popover-size-val', text: '3px' });

        const updateThickness = (e?: Event) => {
            e?.stopPropagation?.();
            const slider = (e?.target as HTMLInputElement) || this.thicknessSlider;
            const val = Number(slider?.value);
            if (isNaN(val)) return;
            if (this.thicknessValSpan) this.thicknessValSpan.textContent = `${val}px`;
            if (this.activeEngine) {
                this.activeEngine.setToolSize('shape', val);
                this.activeEngine.requestFullRender();
            }
        };

        this.thicknessSlider.addEventListener('input', updateThickness);
        this.thicknessSlider.addEventListener('change', updateThickness);
        this.thicknessSlider.addEventListener('pointerdown', (e) => e.stopPropagation());

        const fillSwitchRow = this.el.createDiv({ cls: 'option-switch-row' });
        fillSwitchRow.createEl('label', {
            attr: { for: 'ink-popover-shape-fill-checkbox' },
            text: 'Fill Shape'
        });
        this.fillCheckbox = fillSwitchRow.createEl('input', {
            cls: 'ink-option-checkbox',
            attr: { type: 'checkbox', id: 'ink-popover-shape-fill-checkbox' }
        }) as HTMLInputElement;

        this.fillSwatchesContainerEl = this.el.createDiv({ cls: 'ink-popover-shape-fill-swatches-container' });

        this.fillCheckbox.addEventListener('change', () => {
            const isChecked = this.fillCheckbox.checked;
            if (this.activeEngine) {
                const currentColor = this.activeEngine.toolContext.currentColor || '#1a1a1a';
                this.activeEngine.currentFillColor = isChecked ? currentColor : 'transparent';
                this.activeEngine.requestFullRender();
            }
            if (isChecked && this.fillSwatchesEl) {
                this.fillSwatchesEl.classList.remove('is-hidden');
            } else if (this.fillSwatchesEl) {
                this.fillSwatchesEl.classList.add('is-hidden');
            }
        });
    }

    public showShapeOptions(anchorBtn: HTMLElement, engine: InkEngine): void {
        this.activeEngine = engine;

        // 1. Open card immediately
        this.show(anchorBtn);

        // 2. Populate contents safely inside try-catch block
        try {
            this.populateShapeContent(engine);
        } catch (err) {
            console.error('[Apolo Canvas] Error populating shape options popover:', err);
        }

        this.reposition();
    }

    private populateShapeContent(engine: InkEngine): void {
        if (!this.fillSwatchesComponent && this.fillSwatchesContainerEl && this.toolbar) {
            this.fillSwatchesComponent = new ColorSwatchComponent(this.fillSwatchesContainerEl, {
                orientation: 'horizontal',
                toolType: 'shape',
                onSlotClick: (_idx, color) => {
                    if (this.activeEngine) {
                        this.activeEngine.currentFillColor = color;
                        this.activeEngine.requestFullRender();
                    }
                }
            }, this.toolbar);
            this.fillSwatchesEl = this.fillSwatchesComponent.containerEl;
            this.fillSwatchesEl.classList.add('is-hidden');
        }

        const shapeTool = engine.getTool('shape') as any;
        const currentShape = shapeTool?.getActiveShapeId?.() ?? 'line';
        const thickness = typeof engine.getToolSize === 'function' ? engine.getToolSize('shape') : 3;
        const fillColor = engine.currentFillColor ?? 'transparent';
        const isFilled = fillColor !== 'transparent' && fillColor !== 'none';

        this.highlightActiveShape(currentShape);
        if (this.thicknessSlider && this.thicknessValSpan) {
            this.thicknessSlider.value = String(thickness);
            this.thicknessValSpan.textContent = `${thickness}px`;
        }

        if (this.fillCheckbox) {
            this.fillCheckbox.checked = isFilled;
        }

        if (isFilled && this.fillSwatchesEl) {
            this.fillSwatchesEl.classList.remove('is-hidden');
        } else if (this.fillSwatchesEl) {
            this.fillSwatchesEl.classList.add('is-hidden');
        }

        if (this.fillSwatchesComponent) {
            this.fillSwatchesComponent.refresh();
        }
    }

    private highlightActiveShape(shapeId: string): void {
        this.shapeGridButtons.forEach((btn, id) => {
            btn.classList.toggle('is-selected', id === shapeId);
        });
    }
}
