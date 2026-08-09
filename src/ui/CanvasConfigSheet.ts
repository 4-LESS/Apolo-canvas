import { App, Modal } from 'obsidian';
import { InkEngine } from '../engine/InkEngine';
import { DeleteConfirmModal } from './modals/DeleteConfirmModal';

export interface CanvasConfigSaveData {
    pageSize: string;
    background: 'grid' | 'dotted' | 'ruled' | 'blank';
    gridSize: number;
    theme: 'grid-mesh' | 'isometric-dots' | 'dark-canvas' | 'light-paper';
}

export class CanvasConfigSheetModal extends Modal {
    constructor(
        app: App,
        private engine: InkEngine,
        private onSaveCallback?: (data: CanvasConfigSaveData) => void
    ) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('ink-config-sheet-modal');

        contentEl.createEl('h2', { text: 'Canvas Settings' });

        const page = this.engine.getActivePage();
        const currentSize = (page as any).pageSize || 'A4';
        const currentTheme = (page as any).theme || (page.background === 'grid' ? 'grid-mesh' : page.background === 'dotted' ? 'isometric-dots' : 'light-paper');
        const currentGridSize = page.gridSize || 20;

        // 1. Page Size setting row
        const sizeContainer = contentEl.createDiv({ cls: 'ink-modal-setting-row' });
        sizeContainer.createEl('label', { text: 'Page Size' });
        const sizeSelect = sizeContainer.createEl('select', { cls: 'ink-modal-select' });
        const sizeOptions = ['A4', 'A3', 'Letter', 'Infinite'];
        sizeOptions.forEach(opt => {
            const o = sizeSelect.createEl('option', { text: opt, value: opt });
            if (opt === currentSize) {
                o.selected = true;
            }
        });

        // 2. Theme & Background setting row
        const themeContainer = contentEl.createDiv({ cls: 'ink-modal-setting-row flex-column' });
        themeContainer.createEl('label', { text: 'Theme and Background' });
        const themeOptionsRow = themeContainer.createDiv({ cls: 'ink-theme-options-row' });
        
        let selectedTheme = currentTheme;
        const themeButtons: HTMLButtonElement[] = [];
        const themes = [
            { id: 'grid-mesh', label: 'Grid Mesh' },
            { id: 'isometric-dots', label: 'Isometric Dots' },
            { id: 'dark-canvas', label: 'Dark Canvas' },
            { id: 'light-paper', label: 'Light Paper' }
        ];

        themes.forEach(t => {
            const btn = themeOptionsRow.createEl('button', {
                cls: 'ink-theme-option-btn',
                text: t.label
            }) as HTMLButtonElement;
            if (t.id === selectedTheme) {
                btn.addClass('is-active');
            }
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                themeButtons.forEach(b => b.removeClass('is-active'));
                btn.addClass('is-active');
                selectedTheme = t.id;
            });
            themeButtons.push(btn);
        });

        // 3. Grid Size setting row
        const gridContainer = contentEl.createDiv({ cls: 'ink-modal-setting-row flex-column' });
        const gridHeader = gridContainer.createDiv({ cls: 'ink-popover-slider-header' });
        gridHeader.createEl('label', { text: 'Grid Size' });
        const gridValSpan = gridHeader.createSpan({ cls: 'ink-popover-size-val', text: `${currentGridSize}px` });
        const gridSlider = gridContainer.createEl('input', {
            cls: 'ink-modal-slider',
            attr: {
                type: 'range',
                min: '10',
                max: '150',
                step: '5',
                value: String(currentGridSize)
            }
        }) as HTMLInputElement;
        gridSlider.addEventListener('input', () => {
            gridValSpan.textContent = `${gridSlider.value}px`;
        });

        // 4. Danger zone: clear all ink data on this canvas
        const dangerContainer = contentEl.createDiv({ cls: 'ink-modal-setting-row ink-modal-danger-row' });
        dangerContainer.createEl('label', { text: 'Danger Zone' });
        const deleteDataBtn = dangerContainer.createEl('button', {
            cls: 'ink-modal-btn mod-warning',
            text: 'Delete Ink Data'
        });
        deleteDataBtn.addEventListener('click', (e) => {
            e.preventDefault();
            new DeleteConfirmModal(this.app, () => {
                page.elements = [];
                this.engine.requestFullRender();
                this.engine.requestSave();
                this.close();
            }).open();
        });

        // 5. Buttons row
        const btnContainer = contentEl.createDiv({ cls: 'ink-modal-buttons' });
        btnContainer.style.display = 'flex';
        btnContainer.style.justifyContent = 'flex-end';
        btnContainer.style.gap = '12px';
        btnContainer.style.marginTop = '20px';

        const cancelBtn = btnContainer.createEl('button', {
            cls: 'ink-modal-btn',
            text: 'Cancel'
        });
        cancelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.close();
        });

        const saveBtn = btnContainer.createEl('button', {
            cls: 'ink-modal-btn mod-cta',
            text: 'Save'
        });
        saveBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // 1. Update Page Size
            const selectedSize = sizeSelect.value;
            let width = 2480;
            let height = 3508;
            if (selectedSize === 'A3') {
                width = 3508;
                height = 4960;
            } else if (selectedSize === 'Letter') {
                width = 2550;
                height = 3300;
            } else if (selectedSize === 'Infinite') {
                width = 100000;
                height = 100000;
            }
            
            (page as any).pageSize = selectedSize;
            (page as any).width = width;
            (page as any).height = height;
            this.engine.setPageDimensions(width, height);

            // 2. Update Theme
            (page as any).theme = selectedTheme;
            let bg: 'grid' | 'dotted' | 'ruled' | 'blank' = 'grid';
            if (selectedTheme === 'grid-mesh') {
                bg = 'grid';
            } else if (selectedTheme === 'isometric-dots') {
                bg = 'dotted';
            } else if (selectedTheme === 'dark-canvas') {
                bg = 'grid';
            } else if (selectedTheme === 'light-paper') {
                bg = 'blank';
            }
            page.background = bg;

            // 3. Update Grid Size
            const gSize = parseInt(gridSlider.value, 10);
            page.gridSize = gSize;

            // Render and save
            this.engine.requestFullRender();
            this.engine.requestSave();

            if (this.onSaveCallback) {
                this.onSaveCallback({
                    pageSize: selectedSize,
                    background: bg,
                    gridSize: gSize,
                    theme: selectedTheme as any
                });
            }

            this.close();
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}
