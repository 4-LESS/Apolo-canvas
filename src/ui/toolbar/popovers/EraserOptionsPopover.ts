import { setIcon } from 'obsidian';
import { InkEngine } from '../../../engine/InkEngine';
import { BasePopover } from '../BasePopover';
import { buildSliderRow, buildToggleRow, SliderRowHandle, ToggleRowHandle } from '../components/controls';

export class EraserOptionsPopover extends BasePopover {
    private activeEngine: InkEngine | null = null;

    private sizeRow!: SliderRowHandle;
    private strokeToggle!: ToggleRowHandle;
    private scribbleToggle!: ToggleRowHandle;
    private highlighterToggle!: ToggleRowHandle;
    private autoDeselectToggle!: ToggleRowHandle;

    constructor(parent: HTMLElement, plugin: any, private getEraserButton: () => HTMLButtonElement | undefined, dismissBoundary?: HTMLElement) {
        super(parent, plugin, 'ink-eraser-options-popover', dismissBoundary);
        this.ensureBuilt();
    }

    protected buildContent(): void {
        this.sizeRow = buildSliderRow(this.el, {
            label: 'ERASER SIZE',
            min: 5, max: 100, step: 1, value: 20,
            onInput: (val) => {
                this.activeEngine?.setToolSize('eraser', val);
                this.activeEngine?.requestFullRender();
            }
        });

        this.strokeToggle = this.addToggle('ink-eraser-stroke-checkbox', 'Erase Whole Stroke', (checked, tool, engine) => {
            const mode = checked ? 'whole' : 'segment';
            tool.eraseMode = mode;
            engine.eraserMode = mode;
            this.syncEraserIcon(mode);
        });
        this.scribbleToggle = this.addToggle('ink-eraser-scribble-checkbox', 'Scribble to Erase', (checked, tool) => {
            tool.scribbleToErase = checked;
        });
        this.highlighterToggle = this.addToggle('ink-eraser-high-checkbox', 'Only Erase Highlighter', (checked, tool) => {
            tool.eraseHighlighterOnly = checked;
        });
        this.autoDeselectToggle = this.addToggle('ink-eraser-auto-checkbox', 'Auto Deselect', (checked, tool) => {
            tool.autoDeselect = checked;
        });
    }

    public showEraserOptions(triggerEl: HTMLElement, engine: InkEngine): void {
        this.ensureBuilt();
        this.activeEngine = engine;
        const tool = typeof engine.getTool === 'function' ? engine.getTool('eraser') as any : undefined;
        if (!tool) return;

        this.sizeRow.setValue(engine.getToolSize('eraser'));
        this.strokeToggle.setChecked(tool.eraseMode === 'whole');
        this.scribbleToggle.setChecked(!!tool.scribbleToErase);
        this.highlighterToggle.setChecked(!!tool.eraseHighlighterOnly);
        this.autoDeselectToggle.setChecked(!!tool.autoDeselect);
        this.show(triggerEl);
    }

    private addToggle(id: string, label: string, update: (checked: boolean, tool: any, engine: InkEngine) => void): ToggleRowHandle {
        return buildToggleRow(this.el, {
            id,
            label,
            onChange: (checked) => {
                const engine = this.activeEngine;
                const tool = engine && typeof engine.getTool === 'function' ? engine.getTool('eraser') as any : undefined;
                if (engine && tool) update(checked, tool, engine);
            }
        });
    }

    private syncEraserIcon(mode: 'segment' | 'whole'): void {
        const eraserBtn = this.getEraserButton();
        const iconSpan = eraserBtn?.querySelector?.('.ink-toolbar-icon') as HTMLElement | undefined;
        if (iconSpan) {
            iconSpan.empty();
            setIcon(iconSpan, mode === 'segment' ? 'scissors' : 'eraser');
        }
    }
}
