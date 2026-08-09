import { BasePopover } from '../BasePopover';
import type { Toolbar } from '../../Toolbar';
import { PATTERNS } from '../patterns';

export class PatternPopover extends BasePopover {
    constructor(parent: HTMLElement, plugin: any, private toolbar: Toolbar, dismissBoundary?: HTMLElement) {
        super(parent, plugin, 'ink-pattern-popover', dismissBoundary);
        this.ensureBuilt();
    }

    protected buildContent(): void {
        this.el.createEl('div', { cls: 'ink-popover-header', text: 'PATTERN' });
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
