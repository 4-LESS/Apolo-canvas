import { setIcon } from 'obsidian';
import { InkEngine } from '../../../engine/InkEngine';
import { BasePopover } from '../BasePopover';
import type { Toolbar } from '../../Toolbar';
import { ShapeRegistry } from '../../../shapes/ShapeRegistry';
import { ColorSwatchComponent } from '../components/ColorSwatchComponent';
import { buildSectionHeader, buildSliderRow, buildToggleRow, SliderRowHandle, ToggleRowHandle } from '../components/controls';

export class ShapeOptionsPopover extends BasePopover {
    private _activeEngine: InkEngine | null = null;
    private get activeEngine(): InkEngine | null {
        return this._activeEngine || (this.toolbar ? (this.toolbar.focusedEngineRef?.get() ?? null) : null);
    }
    private set activeEngine(engine: InkEngine | null) {
        this._activeEngine = engine;
    }
    private shapeGridButtons: Map<string, HTMLButtonElement> = new Map();
    private thicknessRow!: SliderRowHandle;
    private fillToggle!: ToggleRowHandle;
    private fillSwatchesComponent: ColorSwatchComponent | null = null;
    private fillSwatchesContainerEl!: HTMLDivElement;
    private fillSwatchesEl!: HTMLElement;

    constructor(parent: HTMLElement, plugin: any, private toolbar: Toolbar, dismissBoundary?: HTMLElement) {
        super(parent, plugin, 'ink-shape-options-popover', dismissBoundary);
        this.ensureBuilt();
    }

    protected buildContent(): void {
        this.shapeGridButtons = new Map();
        buildSectionHeader(this.el, 'SHAPE');
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

        this.thicknessRow = buildSliderRow(this.el, {
            label: 'THICKNESS',
            min: 1, max: 30, step: 1, value: 3,
            onInput: (val) => {
                if (this.activeEngine) {
                    this.activeEngine.setToolSize('shape', val);
                    this.activeEngine.requestFullRender();
                }
            }
        });

        this.fillToggle = buildToggleRow(this.el, {
            id: 'ink-popover-shape-fill-checkbox',
            label: 'Fill Shape',
            onChange: (isChecked) => {
                if (this.activeEngine) {
                    const currentColor = this.activeEngine.toolContext.currentColor || '#1a1a1a';
                    this.activeEngine.currentFillColor = isChecked ? currentColor : 'transparent';
                    this.activeEngine.requestFullRender();
                }
                if (this.fillSwatchesEl) {
                    this.fillSwatchesEl.classList.toggle('is-hidden', !isChecked);
                }
            }
        });

        this.fillSwatchesContainerEl = this.el.createDiv({ cls: 'ink-popover-shape-fill-swatches-container' });
    }

    public showShapeOptions(anchorBtn: HTMLElement, engine: InkEngine): void {
        this.activeEngine = engine;
        this.showWithContent(anchorBtn, () => this.populateShapeContent(engine));
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
        this.thicknessRow?.setValue(thickness);
        this.fillToggle?.setChecked(isFilled);

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
