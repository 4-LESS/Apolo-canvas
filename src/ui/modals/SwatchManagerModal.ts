import { App, Modal } from 'obsidian';
import type { Toolbar } from '../Toolbar';

export class SwatchManagerModal extends Modal {
    private activeTab: 'pen' | 'highlighter' | 'shape' = 'pen';
    private scrollStreamEl!: HTMLDivElement;

    constructor(app: App, private plugin: any, private toolbar: Toolbar) {
        super(app);
        
        // Default the tab to current active tool type
        const engine = this.toolbar.focusedEngineRef.get();
        const toolName = engine?.getToolName() ?? 'pen';
        this.activeTab = (toolName === 'highlighter' || toolName === 'shape') ? toolName : 'pen';
    }

    onOpen() {
        const { contentEl, titleEl } = this;
        contentEl.empty();
        
        // 1. Title Initialization
        titleEl.textContent = 'SWATCHES MANAGER';

        // 2. Sticky Tab Selector Row
        const tabRow = contentEl.createDiv({ cls: 'ink-modal-tab-row' });
        const tabs: Array<{ id: 'pen' | 'highlighter' | 'shape'; label: string }> = [
            { id: 'pen', label: 'PEN' },
            { id: 'highlighter', label: 'HIGHLIGHTER' },
            { id: 'shape', label: 'SHAPE PRIMITIVES' }
        ];

        const tabBtns: HTMLButtonElement[] = [];
        tabs.forEach((tab) => {
            const btn = tabRow.createEl('button', {
                cls: 'ink-modal-tab-btn',
                text: tab.label
            }) as HTMLButtonElement;
            if (this.activeTab === tab.id) {
                btn.classList.add('is-active');
            }
            btn.addEventListener('click', () => {
                this.activeTab = tab.id;
                tabBtns.forEach((b, idx) => {
                    b.classList.toggle('is-active', tabs[idx].id === this.activeTab);
                });
                this.refreshList();
            });
            tabBtns.push(btn);
        });

        // 3. Global Creator Strip
        const creatorBtn = contentEl.createEl('button', {
            cls: 'ink-modal-creator-btn',
            text: '+ Add New Custom Palette'
        }) as HTMLButtonElement;
        creatorBtn.addEventListener('click', () => {
            this.addNewPalette();
        });

        // 4. Scrollable List View Wrapper
        this.scrollStreamEl = contentEl.createDiv({ cls: 'ink-modal-scroll-stream' });

        // Initial render
        this.refreshList();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        
        // Explicitly dismiss active ColorPickerPopover floating open over the modal layer
        if (this.toolbar && this.toolbar.colorPickerPopover) {
            this.toolbar.colorPickerPopover.hide();
        }

        // Make sure we clear the toolbar reference to this modal
        if (this.toolbar.swatchManagerModal === this) {
            this.toolbar.swatchManagerModal = null;
        }
    }

    public refresh(): void {
        this.refreshList();
    }

    private addNewPalette() {
        const settings = this.plugin?.settings;
        if (!settings) return;

        let palettes: any[];
        if (this.activeTab === 'highlighter') {
            if (!settings.highlighterPalettes) settings.highlighterPalettes = [];
            palettes = settings.highlighterPalettes;
        } else if (this.activeTab === 'shape') {
            if (!settings.shapePalettes) settings.shapePalettes = [];
            palettes = settings.shapePalettes;
        } else {
            if (!settings.penPalettes) settings.penPalettes = [];
            palettes = settings.penPalettes;
        }

        const nextCustomPaletteIndex = palettes.reduce((max: number, p: any) => {
            const match = p.name?.match(/^Custom Palette(?:\s+(\d+))?$/i);
            return match ? Math.max(max, Number(match[1] ?? '1')) : max;
        }, 0);

        const colors = this.activeTab === 'highlighter'
            ? ['#ffff0080', '#00ff0080', '#ff00ff80', '#00ffff80']
            : ['#000000', '#ff0000', '#0000ff', '#00ff00'];

        const newPalette = {
            id: `custom_${Date.now()}`,
            name: `Custom Palette ${nextCustomPaletteIndex + 1}`,
            colors
        };

        palettes.push(newPalette);
        
        // Save and refresh
        const saved = this.plugin?.saveSettings?.();
        const done = () => {
            this.refreshList();
            this.toolbar.syncColorSlots(this.activeTab);
        };
        if (saved?.then) saved.then(done);
        else done();
    }

    private refreshList() {
        this.scrollStreamEl.empty();
        
        const settings = this.plugin?.settings;
        if (!settings) return;

        let palettes: any[];
        let activePaletteId: string;
        if (this.activeTab === 'highlighter') {
            palettes = settings.highlighterPalettes ?? [];
            activePaletteId = settings.activeHighlighterPaletteId ?? 'classic';
        } else if (this.activeTab === 'shape') {
            palettes = settings.shapePalettes ?? [];
            activePaletteId = settings.activeShapePaletteId ?? 'classic';
        } else {
            palettes = settings.penPalettes ?? [];
            activePaletteId = settings.activePenPaletteId ?? 'classic';
        }

        let draggedIndex: number | null = null;

        palettes.forEach((pal, idx) => {
            const row = this.scrollStreamEl.createDiv({ cls: 'ink-manager-palette-row' });
            row.setAttribute('data-id', pal.id);
            row.setAttribute('data-index', String(idx));
            
            if (pal.id === activePaletteId) {
                row.classList.add('is-active');
            }

            // Drag-and-drop reordering setup
            row.draggable = true;
            row.addEventListener('dragstart', (e) => {
                draggedIndex = idx;
                row.classList.add('is-dragging');
                if (e.dataTransfer) {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(idx));
                }
            });

            row.addEventListener('dragend', () => {
                row.classList.remove('is-dragging');
                draggedIndex = null;
            });

            row.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = 'move';
                }
            });

            row.addEventListener('drop', (e) => {
                e.preventDefault();
                if (draggedIndex !== null && draggedIndex !== idx) {
                    const temp = palettes[draggedIndex];
                    palettes.splice(draggedIndex, 1);
                    palettes.splice(idx, 0, temp);

                    const saved = this.plugin?.saveSettings?.();
                    const done = () => {
                        this.refreshList();
                        this.toolbar.syncColorSlots(this.activeTab);
                    };
                    if (saved?.then) saved.then(done);
                    else done();
                }
            });

            // Drag Grip indicator
            row.createDiv({ cls: 'ink-drag-grip', text: '⠿' });

            // Inline Title input
            const titleInput = row.createEl('input', {
                cls: 'ink-row-name-field',
                attr: { type: 'text', value: pal.name ?? 'Untitled' }
            }) as HTMLInputElement;

            titleInput.addEventListener('input', () => {
                pal.name = titleInput.value.trim() || 'Untitled';
                this.plugin?.saveSettings?.();
            });

            // Colors Sequence Strip
            const colorsStrip = row.createDiv({ cls: 'ink-colors-sequence-strip' });
            pal.colors.forEach((color: string, colorIdx: number) => {
                const colorCircle = colorsStrip.createDiv({ cls: 'ink-palette-color-circle' });
                colorCircle.style.backgroundColor = color;
                
                let activeColorIndex = 0;
                if (this.activeTab === 'highlighter') {
                    activeColorIndex = settings.activeHighlighterColorIndex ?? 0;
                } else if (this.activeTab === 'shape') {
                    activeColorIndex = settings.activeShapeColorIndex ?? 0;
                } else {
                    activeColorIndex = settings.activePenColorIndex ?? 0;
                }

                if (pal.id === activePaletteId && colorIdx === activeColorIndex) {
                    colorCircle.classList.add('is-active-slot');
                }

                colorCircle.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    // Tapping color circle activates this palette and slot!
                    if (this.activeTab === 'highlighter') {
                        settings.activeHighlighterPaletteId = pal.id;
                        settings.activeHighlighterColorIndex = colorIdx;
                        settings.lastHighlighterColorHex = color;
                    } else if (this.activeTab === 'shape') {
                        settings.activeShapePaletteId = pal.id;
                        settings.activeShapeColorIndex = colorIdx;
                        settings.lastShapeColorHex = color;
                    } else {
                        settings.activePenPaletteId = pal.id;
                        settings.activePenColorIndex = colorIdx;
                        settings.lastPenColorHex = color;
                    }

                    // Set engine color
                    const engine = this.toolbar.focusedEngineRef.get();
                    if (engine) {
                        engine.setPenColor(color);
                        if (this.activeTab === 'shape') {
                            if (engine.currentFillColor && engine.currentFillColor !== 'transparent') {
                                engine.currentFillColor = color;
                            }
                        }
                        engine.requestFullRender();
                    }

                    // Save settings, sync toolbar, and open ColorPickerPopover right over the modal/button!
                    const saved = this.plugin?.saveSettings?.();
                    const done = () => {
                        this.toolbar.syncColorSlots(this.activeTab);
                        this.refreshList(); // to update active state border
                        
                        // Close any existing picker popovers
                        this.toolbar.closeAllMenus();
                        // Open the custom 2D ColorPickerPopover right over the circle element
                        if (engine) {
                            this.toolbar.colorPickerPopover.showColorPicker(colorCircle, colorIdx, engine);
                        }
                    };
                    if (saved?.then) saved.then(done);
                    else done();
                });
            });

            // Inline Deletion Tool
            const deleteBtn = row.createEl('button', {
                cls: 'ink-row-delete-btn',
                text: '✖'
            }) as HTMLButtonElement;

            deleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                row.classList.add('is-removing');
                row.addEventListener('animationend', () => {
                    const idxToRemove = palettes.findIndex(p => p.id === pal.id);
                    if (idxToRemove !== -1) {
                        palettes.splice(idxToRemove, 1);
                    }
                    
                    // If the active palette was deleted, set the first one as active
                    if (pal.id === activePaletteId && palettes.length > 0) {
                        if (this.activeTab === 'highlighter') {
                            settings.activeHighlighterPaletteId = palettes[0].id;
                        } else if (this.activeTab === 'shape') {
                            settings.activeShapePaletteId = palettes[0].id;
                        } else {
                            settings.activePenPaletteId = palettes[0].id;
                        }
                    }

                    const saved = this.plugin?.saveSettings?.();
                    const done = () => {
                        this.refreshList();
                        this.toolbar.syncColorSlots(this.activeTab);
                    };
                    if (saved?.then) saved.then(done);
                    else done();
                });
            });
        });
    }
}
