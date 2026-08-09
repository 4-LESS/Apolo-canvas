import { StrokePattern } from '../../../model/ElementStyle';
import { BasePopover } from '../BasePopover';
import type { Toolbar } from '../../Toolbar';

const PATTERNS: { id: StrokePattern; svg: string; title: string }[] = [
    { id: 'solid', title: 'Solid', svg: '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><line x1="4" y1="12" x2="20" y2="12" stroke-linecap="round"/></svg>' },
    { id: 'dashed', title: 'Dashed', svg: '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><line x1="4" y1="12" x2="20" y2="12" stroke-dasharray="4,4" stroke-linecap="round"/></svg>' },
    { id: 'dotted', title: 'Dotted', svg: '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><line x1="4" y1="12" x2="20" y2="12" stroke-dasharray="1,4" stroke-linecap="round"/></svg>' }
];

export class PatternPopover extends BasePopover {
    constructor(parent: HTMLElement, plugin: any, private toolbar: Toolbar, dismissBoundary?: HTMLElement) {
        super(parent, plugin, 'ink-pattern-popover', dismissBoundary);
    }

    protected buildContent(): void {
        this.el.createEl('div', { cls: 'ink-style-header', text: 'PATTERN' });
        const row = this.el.createDiv({ cls: 'ink-style-row pattern-row' });
        PATTERNS.forEach((pat) => {
            const btn = row.createEl('button', {
                cls: 'ink-tool-btn pattern-btn',
                attr: { title: pat.title, 'data-pattern': pat.id }
            }) as HTMLButtonElement;
            btn.innerHTML = pat.svg;
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const engine = this.toolbar.focusedEngineRef.get();
                if (!engine) return;
                engine.currentPattern = pat.id;
                engine.requestFullRender();
                this.toolbar.syncToolState();
                this.toolbar.closeAllPopovers();
            });
        });
    }

    public showPatternMenu(triggerEl: HTMLElement): void {
        this.toolbar.closeAllPopovers(this.el);
        const activePattern = this.toolbar.focusedEngineRef.get()?.currentPattern ?? 'solid';
        this.el.querySelectorAll('.pattern-btn').forEach((element) => {
            const btn = element as HTMLButtonElement;
            if (btn.getAttribute('data-pattern') === activePattern) this.addClass(btn, 'is-active');
            else this.removeClass(btn, 'is-active');
        });
        this.show(triggerEl);
        this.addClass(this.toolbar.patternToggleBtn, 'is-active-popover');
    }

    public hide(): void {
        super.hide();
        if (this.toolbar.patternToggleBtn) this.removeClass(this.toolbar.patternToggleBtn, 'is-active-popover');
    }
}
