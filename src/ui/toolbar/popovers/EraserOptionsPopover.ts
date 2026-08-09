import { setIcon } from 'obsidian';
import { InkEngine } from '../../../engine/InkEngine';
import { BasePopover } from '../BasePopover';

export class EraserOptionsPopover extends BasePopover {
    private activeEngine: InkEngine | null = null;

    constructor(parent: HTMLElement, plugin: any, private getEraserButton: () => HTMLButtonElement | undefined, dismissBoundary?: HTMLElement) {
        super(parent, plugin, 'ink-eraser-options-popover', dismissBoundary);
    }

    protected buildContent(): void {
        const sizeRow = this.el.createDiv({ cls: 'ink-slider-row' });
        const sizeHeader = sizeRow.createDiv({ cls: 'ink-style-header-row' });
        sizeHeader.createDiv({ cls: 'ink-style-header', text: 'ERASER SIZE' });

        const sizeInputRow = sizeRow.createDiv({ cls: 'ink-slider-input-row' });
        const sizeSlider = sizeInputRow.createEl('input', {
            cls: 'ink-thickness-slider',
            attr: { type: 'range', min: '5', max: '100', step: '1', value: '20' }
        }) as HTMLInputElement;
        const sizeVal = sizeInputRow.createSpan({ cls: 'ink-popover-size-val', text: '20px' });
        const updateSize = (e?: Event) => {
            e?.stopPropagation?.();
            const slider = (e?.target as HTMLInputElement) || sizeSlider;
            const val = Number(slider?.value);
            if (isNaN(val)) return;
            if (sizeVal) sizeVal.textContent = `${val}px`;
            this.activeEngine?.setToolSize('eraser', val);
            this.activeEngine?.requestFullRender();
        };
        sizeSlider.addEventListener('input', updateSize);
        sizeSlider.addEventListener('change', updateSize);
        sizeSlider.addEventListener('pointerdown', (e) => e.stopPropagation());

        this.addToggle('ink-eraser-stroke-checkbox', 'Erase Whole Stroke', (checked, tool, engine) => {
            const mode = checked ? 'whole' : 'segment';
            tool.eraseMode = mode;
            engine.eraserMode = mode;
            this.syncEraserIcon(mode);
        });
        this.addToggle('ink-eraser-scribble-checkbox', 'Scribble to Erase', (checked, tool) => {
            tool.scribbleToErase = checked;
        });
        this.addToggle('ink-eraser-high-checkbox', 'Only Erase Highlighter', (checked, tool) => {
            tool.eraseHighlighterOnly = checked;
        });
        this.addToggle('ink-eraser-auto-checkbox', 'Auto Deselect', (checked, tool) => {
            tool.autoDeselect = checked;
        });
    }

    public showEraserOptions(triggerEl: HTMLElement, engine: InkEngine): void {
        this.activeEngine = engine;
        const tool = typeof engine.getTool === 'function' ? engine.getTool('eraser') as any : undefined;
        if (!tool) return;

        const sizeSlider = this.query('.ink-thickness-slider') as HTMLInputElement | null;
        const sizeVal = this.query('.ink-popover-size-val') as HTMLSpanElement | null;
        const size = engine.getToolSize('eraser');
        if (sizeSlider) sizeSlider.value = String(size);
        if (sizeVal) sizeVal.textContent = `${size}px`;
        this.setChecked('#ink-eraser-stroke-checkbox', tool.eraseMode === 'whole');
        this.setChecked('#ink-eraser-scribble-checkbox', !!tool.scribbleToErase);
        this.setChecked('#ink-eraser-high-checkbox', !!tool.eraseHighlighterOnly);
        this.setChecked('#ink-eraser-auto-checkbox', !!tool.autoDeselect);
        this.show(triggerEl);
    }

    private addToggle(id: string, label: string, update: (checked: boolean, tool: any, engine: InkEngine) => void): void {
        const row = this.el.createDiv({ cls: 'option-switch-row' });
        row.createEl('label', { attr: { for: id }, text: label });
        const checkbox = row.createEl('input', {
            cls: 'ink-option-checkbox',
            attr: { type: 'checkbox', id }
        }) as HTMLInputElement;
        checkbox.addEventListener('change', () => {
            const engine = this.activeEngine;
            const tool = engine && typeof engine.getTool === 'function' ? engine.getTool('eraser') as any : undefined;
            if (engine && tool) update(checkbox.checked, tool, engine);
        });
    }

    private query(selector: string): HTMLElement | null {
        if (typeof this.el.querySelector === 'function') return this.el.querySelector(selector) as HTMLElement | null;
        const all = typeof this.el.querySelectorAll === 'function' ? Array.from(this.el.querySelectorAll(selector)) : [];
        return (all[0] as HTMLElement | undefined) ?? null;
    }

    private setChecked(selector: string, checked: boolean): void {
        const checkbox = this.query(selector) as HTMLInputElement | null;
        if (checkbox) checkbox.checked = checked;
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
