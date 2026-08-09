import { App, Modal } from 'obsidian';
import { InkEngine } from '../engine/InkEngine';
import { InkPage, BackgroundType } from '../model/InkPage';

export class DeleteConfirmModal extends Modal {
    private onConfirm: () => void;

    constructor(app: App, onConfirm: () => void) {
        super(app);
        this.onConfirm = onConfirm;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Delete Ink Data' });
        contentEl.createEl('p', {
            text: 'Are you sure you want to permanently delete this ink block and its underlying data file? This action cannot be undone.'
        });

        const btnContainer = contentEl.createDiv({ cls: 'ink-modal-buttons' });
        btnContainer.style.display = 'flex';
        btnContainer.style.justifyContent = 'flex-end';
        btnContainer.style.gap = '12px';
        btnContainer.style.marginTop = '20px';

        const cancelBtn = btnContainer.createEl('button', {
            cls: 'ink-modal-btn',
            text: 'Cancel'
        });
        cancelBtn.addEventListener('click', () => {
            this.close();
        });

        const deleteBtn = btnContainer.createEl('button', {
            cls: 'ink-modal-btn mod-warning',
            text: 'Delete'
        });
        deleteBtn.addEventListener('click', () => {
            this.onConfirm();
            this.close();
        });

        // Set default focus on cancel button
        cancelBtn.focus();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class ConfigMenu {
    private element: HTMLElement;
    private outsideClickListener: ((e: PointerEvent) => void) | null = null;
    private btnEl: HTMLElement;
    public onRemoveFromNote: (() => void) | null = null;
    public onDeleteInkData: (() => void) | null = null;

    constructor(
        private mountTarget: HTMLElement,
        private engine: InkEngine,
        private page: InkPage,
        btnEl: HTMLElement,
        private app: App
    ) {
        this.btnEl = btnEl;
        this.element = this.createChild(mountTarget, 'div', { cls: 'ink-config-popover' });
        this.element.style.display = 'none';
        this.buildMenu();
    }

    private createChild(parent: HTMLElement, tag: string, attrs?: any): HTMLElement {
        if (parent && typeof parent.createEl === 'function' && !(parent as any).isMock) {
            return parent.createEl(tag as any, attrs);
        }
        const mockChild = {
            isMock: true,
            style: {},
            addEventListener: () => {},
            setAttribute: () => {},
            classList: {
                add: (c: string) => { mockChild.className = (mockChild.className || '') + ' ' + c; },
                remove: (c: string) => { mockChild.className = (mockChild.className || '').replace(c, ''); },
            },
            empty: () => { mockChild.innerHTML = ''; },
            createEl: (t: string, a?: any) => { return this.createChild(mockChild, t, a); },
            createDiv: (a?: any) => { return this.createChild(mockChild, 'div', a); },
            createSpan: (a?: any) => { return this.createChild(mockChild, 'span', a); },
            innerHTML: '',
            textContent: '',
            className: attrs?.cls || '',
        } as any;
        return mockChild;
    }

    private buildMenu(): void {
        if (typeof this.element.empty === 'function') {
            this.element.empty();
        } else {
            this.element.innerHTML = '';
        }

        // --- Canvas Config (Active) ---
        const canvasTitle = this.createChild(this.element, 'div', { cls: 'ink-config-section-title', text: 'Canvas Config' });
        canvasTitle.style.fontWeight = 'bold';
        canvasTitle.style.marginBottom = '8px';
        canvasTitle.style.fontSize = '12px';

        // Background Type Label
        const bgLabelRow = this.createChild(this.element, 'div', { cls: 'ink-config-row' });
        this.createChild(bgLabelRow, 'span', { text: 'Background' });

        // Background Type Buttons Row
        const bgButtonsRow = this.createChild(this.element, 'div', { cls: 'ink-config-bg-row' });
        const bgOptions: { value: BackgroundType; label: string }[] = [
            { value: 'grid', label: 'Grid' },
            { value: 'ruled', label: 'Lines' },
            { value: 'dotted', label: 'Dots' },
            { value: 'blank', label: 'Blank' }
        ];

        const bgButtons: HTMLButtonElement[] = [];
        bgOptions.forEach(opt => {
            const btn = this.createChild(bgButtonsRow, 'button', {
                cls: 'ink-config-bg-btn',
                text: opt.label
            }) as HTMLButtonElement;
            
            if (this.page.background === opt.value) {
                btn.classList.add('is-active');
            }

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                this.page.background = opt.value;
                
                bgButtons.forEach(b => b.classList.remove('is-active'));
                btn.classList.add('is-active');
                
                this.engine.requestFullRender();
                this.engine.requestSave();
            });

            bgButtons.push(btn);
        });

        // Grid Size
        const gridRow = this.createChild(this.element, 'div', { cls: 'ink-config-row flex-column' });
        const sliderHeader = this.createChild(gridRow, 'div', { cls: 'ink-popover-slider-header' });
        this.createChild(sliderHeader, 'span', { text: 'Grid Size' });
        const sizeLabel = this.createChild(sliderHeader, 'span', {
            cls: 'ink-popover-size-val',
            text: `${this.page.gridSize ?? 20}px`
        });

        const initialSize = this.page.gridSize ?? 20;
        const gridSlider = this.createChild(gridRow, 'input', {
            cls: 'ink-popover-slider',
            attr: {
                type: 'range',
                min: '10',
                max: '150',
                step: '5',
                value: String(initialSize)
            }
        }) as HTMLInputElement;

        gridSlider.addEventListener('input', () => {
            const val = parseInt(gridSlider.value, 10);
            sizeLabel.textContent = `${val}px`;
            this.page.gridSize = val;
            this.engine.requestFullRender();
            this.engine.requestSave();
        });

        // Separator
        this.createChild(this.element, 'hr', { cls: 'ink-popover-separator' });

        // --- Future Configs (Disabled Placeholders) ---
        const futureTitle = this.createChild(this.element, 'div', { cls: 'ink-config-section-title', text: 'Future Configs' });
        futureTitle.style.fontWeight = 'bold';
        futureTitle.style.margin = '8px 0';
        futureTitle.style.fontSize = '12px';

        // Canvas Size
        const sizeRow = this.createChild(this.element, 'div', { cls: 'ink-config-row is-disabled' });
        sizeRow.setAttribute('title', 'Coming Soon');
        this.createChild(sizeRow, 'span', { text: 'Canvas Size' });
        const sizeSelect = this.createChild(sizeRow, 'select', { cls: 'ink-config-select' }) as HTMLSelectElement;
        sizeSelect.disabled = true;
        this.createChild(sizeSelect, 'option', { text: 'A4' });

        // Appearance
        const appearanceRow = this.createChild(this.element, 'div', { cls: 'ink-config-row is-disabled' });
        appearanceRow.setAttribute('title', 'Coming Soon');
        this.createChild(appearanceRow, 'span', { text: 'Appearance' });
        const appToggle = this.createChild(appearanceRow, 'button', {
            cls: 'ink-config-toggle-btn',
            text: 'Light'
        }) as HTMLButtonElement;
        appToggle.disabled = true;

        // Separator
        this.createChild(this.element, 'hr', { cls: 'ink-popover-separator' });

        // Remove from Note Row
        const removeRow = this.createChild(this.element, 'div', { cls: 'ink-config-row' });
        const removeBtn = this.createChild(removeRow, 'button', {
            cls: 'ink-config-remove-btn',
            text: 'Remove from Note'
        }) as HTMLButtonElement;

        removeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.hide();
            this.onRemoveFromNote?.();
        });

        // Delete Ink Data Row
        const deleteRow = this.createChild(this.element, 'div', { cls: 'ink-config-row' });
        const deleteBtn = this.createChild(deleteRow, 'button', {
            cls: 'ink-config-delete-btn',
            text: 'Delete Ink Data'
        }) as HTMLButtonElement;

        deleteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.hide();
            const modal = new DeleteConfirmModal(this.app, () => {
                this.onDeleteInkData?.();
            });
            modal.open();
        });
    }

    show(): void {
        this.element.style.display = 'flex';
        if (this.btnEl && typeof this.btnEl.addClass === 'function') {
            this.btnEl.addClass('is-active');
        }

        setTimeout(() => {
            if (!this.outsideClickListener) {
                this.outsideClickListener = (e: PointerEvent) => {
                    const target = e.target as Node;
                    if (!this.element.contains(target) && !this.btnEl.contains(target)) {
                        this.hide();
                    }
                };
                document.addEventListener('pointerdown', this.outsideClickListener);
            }
        }, 0);
    }

    hide(): void {
        this.element.style.display = 'none';
        if (this.btnEl && typeof this.btnEl.removeClass === 'function') {
            this.btnEl.removeClass('is-active');
        }
        if (this.outsideClickListener) {
            document.removeEventListener('pointerdown', this.outsideClickListener);
            this.outsideClickListener = null;
        }
    }

    isOpen(): boolean {
        return this.element.style.display === 'flex';
    }
}
