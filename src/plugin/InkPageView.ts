import { MarkdownRenderChild, App, MarkdownView, setIcon } from 'obsidian';
import { InkEngine } from '../engine/InkEngine';
import { InkPage, PAGE_PRESETS, BackgroundType } from '../model/InkPage';
import { InkFileManager } from '../io/FileManager';
import { ApoloCanvasSettings } from './Settings';
import type InkPlugin from './InkPlugin';
import { debounce } from '../utils/debounce';
import { FocusedEngineRef } from '../engine/FocusedEngineRef';

import { SelectionMenu } from '../ui/SelectionMenu';
import { PasteMenu } from '../ui/PasteMenu';
import { ConfigMenu } from '../ui/ConfigMenu';
import { CanvasConfigSheetModal } from '../ui/CanvasConfigSheet';
import { Point, clientToPageCoords } from '../utils/geometry';
import { generateBlockId } from '../utils/id';

/**
 * Renders an ink page inside a Markdown code block.
 */
export class InkPageView extends MarkdownRenderChild {
    private engine: InkEngine | null = null;
    private page: InkPage | null = null;

    private canvasContainer: HTMLElement | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private saveDebounced: ((() => void) & { cancel: () => void }) | null = null;
    private configMenu: ConfigMenu | null = null;
    private outsideActiveListener: ((e: PointerEvent) => void) | null = null;
    private focusedEngineRef: FocusedEngineRef;
    private canvas!: HTMLCanvasElement;
    private fullscreenToggleEl: HTMLElement | null = null;
    private canvasActionsBtnEl: HTMLElement | null = null;
    private actionsDropdownEl: HTMLElement | null = null;

    get globalToolbar(): any {
        return null;
    }




    constructor(
        containerEl: HTMLElement,
        private notePath: string,
        private pageId: string,
        private height: number,
        private fileManager: InkFileManager,
        private settings: ApoloCanvasSettings,
        private app: App,
        private plugin: InkPlugin,
        private ctx?: any,
        private initialBackground?: BackgroundType,
        private initialGridSize?: number
    ) {
        super(containerEl);
        this.focusedEngineRef = plugin.focusedEngineRef;
    }

    async onload(): Promise<void> {
        const wrapper = this.containerEl.createDiv({ cls: 'ink-block-wrapper' });
        wrapper.setAttribute('tabindex', '0'); // Make focusable for keyboard shortcuts

        // Toggle is-active on wrapper pointerdown
        wrapper.addEventListener('pointerdown', () => {
            wrapper.addClass('is-active');
        });

        this.outsideActiveListener = (e: PointerEvent) => {
            const target = e.target as Node;
            if (!wrapper.contains(target)) {
                wrapper.removeClass('is-active');
            }
        };
        document.addEventListener('pointerdown', this.outsideActiveListener);

        // Load or create ink data
        await this.loadData();
        if (!this.page) return;

        // Register canvas with Cache Hijack Coordinator
        this.plugin.cacheWorker.registerCanvas(this.page.id, this.notePath);


        // Create canvas container with fixed height
        this.canvasContainer = wrapper.createDiv({ cls: 'ink-canvas-container' });
        this.canvasContainer.style.height = `${this.height}px`;

        // Detect if it is inside a preview popover
        const isPreview = !!wrapper.closest('.hover-popover, .popover, .hover-editor');

        // Create engine
        const presetKey = this.settings.defaultPagePreset;
        const preset = PAGE_PRESETS[presetKey] ?? PAGE_PRESETS.A4;
        const pageWidth = (this.page as any).width ?? preset.width;
        const pageHeight = (this.page as any).height ?? preset.height;
        this.engine = new InkEngine(
            this.canvasContainer,
            this.page,
            pageWidth,
            pageHeight,
            this.settings
        );
        this.engine.setSmoothingLevels(this.settings.penSmoothing ?? 0.3, this.settings.highlighterSmoothing ?? 0.55);
        this.plugin.activeEngines.add(this.engine);
        this.canvas = this.engine.getCanvas();
        this.registerDomEvent(this.canvas, 'pointerdown', () => {
            // Focus Shift Guardrail
            if (this.globalToolbar?.isStylePanelOpen?.()) return;
            this.focusedEngineRef.set(this.engine);
        }, { capture: true });

        if (isPreview) {
            this.engine.isReadOnly = true;
        }

        // Re-render the canvas when Obsidian's theme or accent color changes
        this.registerEvent(
            this.app.workspace.on('css-change', () => {
                const engine = this.engine;
                if (engine) {
                    setTimeout(() => {
                        engine.render();
                    }, 50);
                }
            })
        );

        this.engine.onElementsUpdated((elements) => {
            const links = elements
                .map(el => el.url)
                .filter((url): url is string => typeof url === 'string' && url.trim().length > 0);
            this.plugin.cacheWorker.updateCanvasLinks(this.page!.id, links);
        });
        this.engine.triggerElementsUpdated();

        this.engine.onNavigateLink((url: string) => {
            const cleanUrl = url.replace(/^\[\[(.*)\]\]$/, '$1');
            this.app.workspace.openLinkText(cleanUrl, this.notePath, false);
        });


        this.engine.onHoverLink((url: string, event: PointerEvent) => {
            const cleanUrl = url.replace(/^\[\[(.*)\]\]$/, '$1');
            this.app.workspace.trigger('hover-link', {
                event: event,
                source: 'apolo-canvas',
                hoverParent: this.engine?.getCanvas(),
                targetEl: this.engine?.getCanvas(),
                linktext: cleanUrl,
                sourcePath: this.notePath
            });
        });

        // Instantiate selection and paste menus
        const selectionMenu = new SelectionMenu(wrapper);
        selectionMenu.setApp(this.app);
        const pasteMenu = new PasteMenu(wrapper);

        selectionMenu.onCut = () => this.engine?.cut();
        selectionMenu.onCopy = () => this.engine?.copy();
        selectionMenu.onPaste = () => this.engine?.paste();
        selectionMenu.setSelectionManager(this.engine.getSelectionManager());
        selectionMenu.setEngine(this.engine);

        pasteMenu.onPaste = (clientX?: number, clientY?: number) => {
            if (!this.engine) return;
            let targetPos: Point | undefined;
            if (clientX !== undefined && clientY !== undefined) {
                const canvas = this.engine.getCanvas();
                const dims = this.engine.getViewport().getPageDimensions();
                const mockEvent = { clientX, clientY } as PointerEvent;
                targetPos = clientToPageCoords(mockEvent, canvas, dims.width, dims.height, this.engine.getViewport());
            }
            const pasted = this.engine.getClipboardManager().paste(
                this.engine.getActivePage(),
                this.engine.getHistoryManager(),
                targetPos
            );

            // Select the pasted elements and switch to lasso tool
            if (pasted.length > 0) {
                this.engine.getSelectionManager().selectElements(pasted);
                this.engine.setTool('lasso'); // puts user in lasso/selection mode on the new paste
            }

            this.engine.render();
            this.engine.triggerSave();
        };

        // Inject menus into engine's inputHandler and lassoTool
        const inputHandler = this.engine.getInputHandler();
        inputHandler.setMenus(selectionMenu, pasteMenu);
        
        const lassoTool = this.engine.getTool('lasso') as any;
        if (lassoTool) {
            lassoTool.setSelectionMenu(selectionMenu);
        }

        // Store engine on wrapper DOM node for global shortcut routing
        (wrapper as any).engine = this.engine;

        // Set initial pen style from settings
        this.engine.setPenColor(this.settings.defaultPenColor);
        this.engine.setPenSize(this.settings.defaultPenSize);

        if (!isPreview) {
            // Setup save indicator
            const saveIndicator = wrapper.createDiv({
                cls: 'ink-save-status-indicator',
            });
            setIcon(saveIndicator, 'check');

            // Setup auto-save
            this.saveDebounced = debounce(async () => {
                saveIndicator.empty();
                setIcon(saveIndicator, 'save');
                saveIndicator.addClass('is-saving');
                await this.save();
                saveIndicator.empty();
                setIcon(saveIndicator, 'check');
                saveIndicator.removeClass('is-saving');
            }, this.settings.autoSaveDebounceMs);

            this.engine.onSave(() => {
                saveIndicator.empty();
                setIcon(saveIndicator, 'save');
                saveIndicator.addClass('is-saving');
                this.saveDebounced!();
            });
        }

        // Handle resize
        this.resizeObserver = new ResizeObserver(() => {
            this.engine?.resize();
        });
        this.resizeObserver.observe(this.canvasContainer);

        if (!isPreview) {
            // Create "+" Add Ink Block button (visible on focus)
            this.createAddBlockButton(wrapper);

            // Set up Milestone 5 Outside Header actions UI
            this.setupHeaderActions(wrapper);
        }
    }

    onunload(): void {
        // Flush pending save
        if (this.saveDebounced) {
            this.saveDebounced.cancel();
            this.save();
        }

        const wrapper = this.containerEl.querySelector('.ink-block-wrapper') as any;
        if (wrapper) {
            delete wrapper.engine;
        }

        this.resizeObserver?.disconnect();
        if (this.engine) {
            if (this.focusedEngineRef.get() === this.engine) {
                this.focusedEngineRef.set(null);
            }
            this.plugin.activeEngines.delete(this.engine);
            this.engine.destroy();
        }
        this.configMenu?.hide();
        this.configMenu = null;
        this.fullscreenToggleEl?.remove();
        this.fullscreenToggleEl = null;
        this.canvasActionsBtnEl?.remove();
        this.canvasActionsBtnEl = null;
        this.closeActionsDropdown();

        if (this.outsideActiveListener) {
            document.removeEventListener('pointerdown', this.outsideActiveListener);
            this.outsideActiveListener = null;
        }
    }




    /** Load existing ink data or create a new page. */
    private async loadData(): Promise<void> {
        try {
            let page = await this.fileManager.loadPage(this.pageId);
            if (!page) {
                const bg = this.initialBackground ?? (this.settings.defaultBackground as BackgroundType);
                page = new InkPage(this.pageId, bg);
                if (this.initialGridSize !== undefined) {
                    page.gridSize = this.initialGridSize;
                } else if (this.settings.defaultGridSize !== undefined) {
                    page.gridSize = this.settings.defaultGridSize;
                }
                await this.fileManager.savePage(page);
            }
            this.page = page;
        } catch (err) {
            console.error('[ApoloCanvas] Failed to load ink page data:', err);
            this.containerEl.createDiv({
                cls: 'ink-error',
                text: `Error al cargar datos de tinta: ${err}`,
            });
        }
    }

    /** Save the current page to disk. */
    private async save(): Promise<void> {
        if (!this.page) return;
        try {
            await this.fileManager.savePage(this.page);
        } catch (err) {
            console.error('[ApoloCanvas] Auto-save failed:', err);
        }
    }

    /** Create Add Ink Block button. */
    private createAddBlockButton(wrapper: HTMLElement): void {
        const addBtn = wrapper.createDiv({ cls: 'ink-add-block-btn' });
        setIcon(addBtn, 'circle-plus');
        addBtn.setAttribute('title', 'Add Ink Block');
        addBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (!this.ctx) return;
            const sectionInfo = this.ctx.getSectionInfo(this.containerEl);
            if (!sectionInfo) return;

            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!activeView) return;

            const editor = activeView.editor;
            const { lineEnd } = sectionInfo;
            const id = generateBlockId();

            // Contextual inheritance: inherit background and grid size from the current page
            const bg = this.page ? this.page.background : (this.settings.defaultBackground ?? 'grid');
            const gridSz = this.page ? this.page.gridSize : (this.settings.defaultGridSize ?? 20);
            const height = this.height;

            const text = `\`\`\`ink\nid: ${id}\ntype: handwriting\nheight: ${height}\nbackground: ${bg}\ngridSize: ${gridSz}\n\`\`\`\n\n`;

            // Insert immediately after the current code block
            const lineCount = editor.lineCount();
            const targetLine = Math.min(lineEnd + 1, lineCount);
            if (typeof (editor as any).transaction === 'function') {
                (editor as any).transaction({
                    changes: [
                        {
                            from: { line: targetLine, ch: 0 },
                            to: { line: targetLine, ch: 0 },
                            text: text
                        }
                    ]
                });
            } else {
                editor.replaceRange(text, { line: targetLine, ch: 0 });
            }

            // Move the cursor after the newly inserted block to trigger rendering
            const lines = text.split('\n');
            editor.setCursor({ line: targetLine + lines.length - 1, ch: 0 });
        });
    }

    /** Remove the Markdown code block of this ink block from the active note editor. */
    private removeBlockFromEditor(): void {
        if (!this.ctx) return;
        const sectionInfo = this.ctx.getSectionInfo(this.containerEl);
        if (!sectionInfo) return;

        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) return;

        const editor = activeView.editor;
        const { lineStart, lineEnd } = sectionInfo;
        const lineCount = editor.lineCount();
        const endLine = Math.min(lineEnd + 1, lineCount - 1);
        const endCh = endLine === lineEnd ? editor.getLine(lineEnd).length : 0;
        
        if (typeof (editor as any).transaction === 'function') {
            (editor as any).transaction({
                changes: [
                    {
                        from: { line: lineStart, ch: 0 },
                        to: { line: endLine, ch: endCh },
                        text: ""
                    }
                ]
            });
        } else {
            editor.replaceRange(
                "",
                { line: lineStart, ch: 0 },
                { line: endLine, ch: endCh }
            );
        }
    }

    private updateBlockInEditor(newConfig: { background?: string; gridSize?: number }): void {
        if (!this.ctx) return;
        const sectionInfo = this.ctx.getSectionInfo(this.containerEl);
        if (!sectionInfo) return;

        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) return;

        const editor = activeView.editor;
        const { lineStart, lineEnd } = sectionInfo;

        const lines: string[] = [];
        for (let i = lineStart; i <= lineEnd; i++) {
            lines.push(editor.getLine(i));
        }

        const updatedLines = lines.map(line => {
            const match = line.match(/^(\w+):\s*"?([^"\n]*)"?\s*$/);
            if (match) {
                const key = match[1].trim();
                if (key === 'background' && newConfig.background !== undefined) {
                    return `background: ${newConfig.background}`;
                }
                if (key === 'gridSize' && newConfig.gridSize !== undefined) {
                    return `gridSize: ${newConfig.gridSize}`;
                }
            }
            return line;
        });

        const text = updatedLines.join('\n');
        if (typeof (editor as any).transaction === 'function') {
            (editor as any).transaction({
                changes: [
                    {
                        from: { line: lineStart, ch: 0 },
                        to: { line: lineEnd, ch: editor.getLine(lineEnd).length },
                        text: text
                    }
                ]
            });
        } else {
            editor.replaceRange(
                text,
                { line: lineStart, ch: 0 },
                { line: lineEnd, ch: editor.getLine(lineEnd).length }
            );
        }
    }

    private async countCanvasReferences(canvasId: string): Promise<number> {
        const files = this.app.vault.getMarkdownFiles();
        let count = 0;
        for (const file of files) {
            const content = await this.app.vault.cachedRead(file);
            if (content.includes(`id: ${canvasId}`)) {
                count++;
            }
        }
        return count;
    }



    private setupHeaderActions(wrapper: HTMLElement): void {
        this.fullscreenToggleEl = wrapper.createDiv({ cls: 'ink-fullscreen-toggle-btn' });
        setIcon(this.fullscreenToggleEl, 'maximize');
        this.fullscreenToggleEl.setAttribute('title', 'Toggle Fullscreen');

        this.canvasActionsBtnEl = wrapper.createDiv({ cls: 'ink-canvas-actions-btn' });
        setIcon(this.canvasActionsBtnEl, 'more-vertical');
        this.canvasActionsBtnEl.setAttribute('title', 'Canvas Actions');

        this.canvasActionsBtnEl.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleActionsDropdown(wrapper);
        });
    }

    private toggleActionsDropdown(wrapper: HTMLElement): void {
        if (this.actionsDropdownEl) {
            this.closeActionsDropdown();
            return;
        }

        const dropdown = wrapper.createDiv({ cls: 'ink-actions-dropdown' });
        this.actionsDropdownEl = dropdown;

        const clickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            if (dropdown && !dropdown.contains(target) && e.target !== this.canvasActionsBtnEl && !this.canvasActionsBtnEl?.contains(target)) {
                this.closeActionsDropdown();
                document.removeEventListener('click', clickOutside);
            }
        };
        setTimeout(() => {
            document.addEventListener('click', clickOutside);
        }, 0);

        // Item 1: Export
        const exportItem = dropdown.createDiv({ cls: 'ink-dropdown-item', text: 'Export' });
        exportItem.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.closeActionsDropdown();
            this.handleExportAction();
        });

        // Divider 1
        dropdown.createEl('hr', { cls: 'ink-dropdown-divider' });

        // Item 2: Canvas Settings
        const settingsItem = dropdown.createDiv({ cls: 'ink-dropdown-item', text: 'Canvas Settings' });
        settingsItem.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.closeActionsDropdown();
            if (this.engine) {
                const modal = new CanvasConfigSheetModal(this.app, this.engine, (data) => {
                    this.updateBlockInEditor({
                        background: data.background,
                        gridSize: data.gridSize
                    });
                });
                modal.open();
            }
        });

        // Divider 2
        dropdown.createEl('hr', { cls: 'ink-dropdown-divider' });

        // Item 3: Erase content
        const eraseItem = dropdown.createDiv({ cls: 'ink-dropdown-item ink-danger', text: 'Erase content' });
        eraseItem.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.closeActionsDropdown();
            if (this.engine) {
                this.engine.clearCanvasElements();
            }
        });

        // Divider 3
        dropdown.createEl('hr', { cls: 'ink-dropdown-divider' });

        // Item 4: Remove Embed
        const removeItem = dropdown.createDiv({ cls: 'ink-dropdown-item ink-danger', text: 'Remove Embed' });
        removeItem.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.closeActionsDropdown();
            this.removeBlockFromEditor();
        });
    }

    private closeActionsDropdown(): void {
        if (this.actionsDropdownEl) {
            this.actionsDropdownEl.remove();
            this.actionsDropdownEl = null;
        }
    }

    private handleExportAction(): void {
        if (!this.engine) return;
        const canvas = this.engine.getCanvas();
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `ink-canvas-${this.pageId}.png`;
        link.href = dataUrl;
        link.click();
    }
}

