import { setIcon } from 'obsidian';

export interface ToolPillCallbacks {
    onToolSelect: (toolId: string) => void;
    onToolReselect: (toolId: string) => void;
    onSnapToggle: () => void;
    onUndo: () => void;
    onRedo: () => void;
}

/**
 * ToolPillComponent owns the vertical drawing-tool button strip.
 *
 * Rendering responsibility:
 *   – Pen, Highlighter, Eraser, Lasso, Shape buttons with Lucide icons.
 *   – Snap-to-Grid toggle, separator, Undo/Redo history buttons.
 *
 * Click engine (selection-aware state machine):
 *   Rule 1  – Tap an INACTIVE tool  → fire onToolSelect(id) silently (no secondary panel).
 *   Rule 2  – Tap an ALREADY-ACTIVE tool (panel closed) → fire onToolReselect(id).
 *   Rule 3  – Tap an ALREADY-ACTIVE tool (panel open)   → fire onToolSelect(id) to toggle closed.
 *
 * The Toolbar router decides which panel to reveal/hide; this component only
 * fires callbacks and manages the `.is-active` button highlight ring.
 */
export class ToolPillComponent {
    public containerEl: HTMLElement;

    // Exposed for Toolbar getter shims (required by tests)
    public toolButtons: Map<string, HTMLButtonElement> = new Map();
    public snapBtn!: HTMLButtonElement;
    public undoBtn!: HTMLButtonElement;
    public redoBtn!: HTMLButtonElement;

    private callbacks: ToolPillCallbacks;

    constructor(parent: HTMLElement, callbacks: ToolPillCallbacks) {
        this.callbacks = callbacks;
        this.containerEl = parent.createDiv({ cls: 'ink-tool-pill' });
        this.buildTools();
    }

    // ─────────────────────────────────────────── internal build helpers ────

    private buildTools(): void {
        const toolDefs = [
            { id: 'pen',         icon: 'pen-line',    title: 'Pen (P)' },
            { id: 'highlighter', icon: 'highlighter', title: 'Highlighter (H)' },
            { id: 'eraser',      icon: 'eraser',      title: 'Eraser (E)' },
            { id: 'lasso',       icon: 'lasso',       title: 'Lasso (L)' },
            { id: 'shape',       icon: 'shapes',      title: 'Shapes' },
        ];

        toolDefs.forEach((def) => {
            const btn = this.containerEl.createEl('button', {
                cls: 'ink-tool-btn',
                attr: { title: def.title }
            }) as HTMLButtonElement;

            const iconSpan = btn.createSpan({ cls: 'ink-toolbar-icon' });
            setIcon(iconSpan, def.icon);

            const fire = () => {
                if (btn.hasClass('is-active')) {
                    // Already selected — delegate re-tap to router
                    this.callbacks.onToolReselect(def.id);
                } else {
                    this.callbacks.onToolSelect(def.id);
                }
            };

            let suppressNextClick = false;

            btn.addEventListener('pointerup', (e) => {
                e?.preventDefault?.();
                e?.stopPropagation?.();
                suppressNextClick = true;
                fire();
            });

            btn.addEventListener('click', (e) => {
                e?.preventDefault?.();
                e?.stopPropagation?.();
                if (suppressNextClick) {
                    suppressNextClick = false;
                    return;
                }
                fire();
            });

            this.toolButtons.set(def.id, btn);
        });
    }

    public buildActionRow(): void {
        if (this.snapBtn) return;

        // Snap-to-Grid
        this.snapBtn = this.containerEl.createEl('button', {
            cls: 'ink-tool-btn ink-snap-toggle',
            attr: { title: 'Snap to Grid (S)' }
        }) as HTMLButtonElement;
        const snapIcon = this.snapBtn.createSpan({ cls: 'ink-toolbar-icon' });
        setIcon(snapIcon, 'grid');
        this.snapBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.callbacks.onSnapToggle();
        });

        // Separator
        this.containerEl.createDiv({ cls: 'ink-separator' });

        // Undo
        this.undoBtn = this.containerEl.createEl('button', {
            cls: 'ink-tool-btn',
            attr: { title: 'Undo (Ctrl+Z)' }
        }) as HTMLButtonElement;
        const undoIcon = this.undoBtn.createSpan({ cls: 'ink-toolbar-icon' });
        setIcon(undoIcon, 'undo-2');
        this.undoBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.callbacks.onUndo();
        });

        // Redo
        this.redoBtn = this.containerEl.createEl('button', {
            cls: 'ink-tool-btn',
            attr: { title: 'Redo (Ctrl+Shift+Z)' }
        }) as HTMLButtonElement;
        const redoIcon = this.redoBtn.createSpan({ cls: 'ink-toolbar-icon' });
        setIcon(redoIcon, 'redo-2');
        this.redoBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.callbacks.onRedo();
        });
    }

    // ─────────────────────────────────────────────────── public API ────────

    /**
     * Refresh the `.is-active` highlight ring to match the currently active tool.
     * Call this whenever the engine reports a tool change.
     */
    public highlightActiveTool(toolId: string): void {
        this.toolButtons.forEach((btn, id) => {
            if (id === toolId) {
                if (typeof btn.addClass === 'function') {
                    btn.addClass('is-active');
                } else {
                    btn.classList.add('is-active');
                }
            } else {
                if (typeof btn.removeClass === 'function') {
                    btn.removeClass('is-active');
                } else {
                    btn.classList.remove('is-active');
                }
            }
        });
    }

    /**
     * Reflect the current snap state on the snap button.
     */
    public setSnapActive(active: boolean): void {
        if (active) {
            if (typeof this.snapBtn.addClass === 'function') {
                this.snapBtn.addClass('is-active');
            } else {
                this.snapBtn.classList.add('is-active');
            }
        } else {
            if (typeof this.snapBtn.removeClass === 'function') {
                this.snapBtn.removeClass('is-active');
            } else {
                this.snapBtn.classList.remove('is-active');
            }
        }
    }

    /**
     * Enable or disable the undo/redo history buttons.
     */
    public setHistoryState(canUndo: boolean, canRedo: boolean): void {
        this.undoBtn.disabled = !canUndo;
        this.redoBtn.disabled = !canRedo;
    }

    /**
     * Disable/enable snap button (used when no engine is focused).
     */
    public setSnapDisabled(disabled: boolean): void {
        this.snapBtn.disabled = disabled;
        if (disabled) {
            this.snapBtn.removeClass?.('is-active') ?? this.snapBtn.classList.remove('is-active');
        }
    }
}
