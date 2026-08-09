import { Point } from '../utils/geometry';

/**
 * Overlay menu that appears on touch long-press to trigger pasting.
 */
export class PasteMenu {
    private element: HTMLElement;
    private outsideClickListener: ((e: PointerEvent) => void) | null = null;
    private pendingPastePosition: Point | null = null;

    constructor(mountTarget: HTMLElement) {
        this.element = mountTarget.createEl('div', { cls: 'ink-paste-menu' });
        this.element.style.display = 'none';
        this.element.style.position = 'absolute';
        this.element.style.zIndex = '1001';

        const btn = this.element.createEl('button', {
            cls: 'ink-menu-item',
            text: 'Paste',
        });
        btn.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            this.paste();
            this.hide();
        });
    }

    onPaste: ((clientX?: number, clientY?: number) => void) | null = null;

    show(clientX: number, clientY: number): void {
        this.pendingPastePosition = { x: clientX, y: clientY };
        this.element.style.display = 'flex';

        const parentRect = this.element.parentElement?.getBoundingClientRect() || { left: 0, top: 0 };
        this.element.style.left = `${clientX - parentRect.left}px`;
        this.element.style.top = `${clientY - parentRect.top}px`;

        // Bind outside tap listener in the next macrotask to prevent immediate self-closure
        setTimeout(() => {
            if (!this.outsideClickListener) {
                this.outsideClickListener = (e: PointerEvent) => {
                    if (!this.element.contains(e.target as Node)) {
                        this.hide();
                    }
                };
                document.addEventListener('pointerdown', this.outsideClickListener);
            }
        }, 0);
    }

    private paste(): void {
        if (!this.onPaste) return;
        if (this.pendingPastePosition) {
            this.onPaste(this.pendingPastePosition.x, this.pendingPastePosition.y);
        } else {
            this.onPaste();
        }
        this.pendingPastePosition = null;
    }

    hide(): void {
        this.element.style.display = 'none';
        this.pendingPastePosition = null;
        if (this.outsideClickListener) {
            document.removeEventListener('pointerdown', this.outsideClickListener);
            this.outsideClickListener = null;
        }
    }
}
