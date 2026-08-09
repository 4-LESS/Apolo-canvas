import { FileView, TFile, WorkspaceLeaf } from 'obsidian';
import { InkEngine } from '../engine/InkEngine';
import { BackgroundType, InkPage, PAGE_PRESETS } from '../model/InkPage';
import { InkFileManager } from '../io/FileManager';
import { ObsidianInkSettings } from './Settings';
import { debounce } from '../utils/debounce';
import { FocusedEngineRef } from '../engine/FocusedEngineRef';

import { SelectionMenu } from '../ui/SelectionMenu';
import { PasteMenu } from '../ui/PasteMenu';
import { Point, clientToPageCoords } from '../utils/geometry';

export const INK_FULL_VIEW_TYPE = 'ink-full-view';

/**
 * Full-page ink view that opens in an Obsidian tab.
 */
export class InkFullView extends FileView {
    private engine: InkEngine | null = null;
    private page: InkPage | null = null;
    private pageId: string = '';
    private fileManager: InkFileManager | null = null;
    private settings: ObsidianInkSettings | null = null;
    private saveDebounced: ((() => void) & { cancel: () => void }) | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private plugin: any = null;
    private focusedEngineRef: FocusedEngineRef | null = null;
    private canvas: HTMLCanvasElement | null = null;

    get globalToolbar(): any {
        return null;
    }

    constructor(leaf: WorkspaceLeaf, plugin?: any) {
        super(leaf);
        if (plugin) {
            this.plugin = plugin;
            this.fileManager = plugin.fileManager;
            this.settings = plugin.settings;
            this.focusedEngineRef = plugin.focusedEngineRef;
        }
    }

    getViewType(): string {
        return INK_FULL_VIEW_TYPE;
    }

    getDisplayText(): string {
        if (this.file) {
            return this.file.basename;
        }
        return 'Ink Canvas';
    }

    getIcon(): string {
        return 'pen-tool';
    }

    setData(
        pageId: string,
        page: InkPage,
        fileManager: InkFileManager,
        settings: ObsidianInkSettings
    ): void {
        this.pageId = pageId;
        this.page = page;
        this.fileManager = fileManager;
        this.settings = settings;
    }

    async onLoadFile(file: TFile): Promise<void> {
        this.file = file;
        this.pageId = file.basename;

        if (!this.fileManager && this.plugin) {
            this.fileManager = this.plugin.fileManager;
        }
        if (!this.settings && this.plugin) {
            this.settings = this.plugin.settings;
        }

        if (!this.fileManager || !this.settings) {
            return;
        }

        const page = await this.fileManager.loadPage(this.pageId);
        if (page) {
            this.page = page;
        } else {
            this.page = new InkPage(this.pageId, (this.settings.defaultBackground ?? 'grid') as BackgroundType);
        }

        await this.initializeView();
    }

    async onUnloadFile(file: TFile): Promise<void> {
        if (this.saveDebounced) {
            this.saveDebounced.cancel();
            if (this.page && this.fileManager) {
                await this.fileManager.savePage(this.page);
            }
        }
        this.resizeObserver?.disconnect();
        if (this.engine) {
            if (this.focusedEngineRef && this.focusedEngineRef.get() === this.engine) {
                this.focusedEngineRef.set(null);
            }
            if (this.plugin) {
                this.plugin.activeEngines.delete(this.engine);
            }
            this.engine.destroy();
            this.engine = null;
        }
        this.page = null;
    }

    async onOpen(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('ink-full-view');
    }

    async onClose(): Promise<void> {
        // Cleanup handled in onUnloadFile
    }

    private async initializeView(): Promise<void> {
        if (!this.page || !this.fileManager || !this.settings) {
            return;
        }

        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('ink-full-view');

        const wrapper = contentEl.createDiv({ cls: 'ink-full-wrapper' });

        const canvasContainer = wrapper.createDiv({
            cls: 'ink-canvas-container ink-canvas-full',
        });

        const isPreview = !!contentEl.closest('.hover-popover, .popover, .hover-editor') ||
            (this.leaf && (this.leaf as any).containerEl && !!(this.leaf as any).containerEl.closest('.hover-popover, .popover, .hover-editor'));

        const presetKey = this.settings.defaultPagePreset;
        const preset = PAGE_PRESETS[presetKey] ?? PAGE_PRESETS.A4;
        this.engine = new InkEngine(
            canvasContainer,
            this.page,
            preset.width,
            preset.height,
            this.settings ?? undefined
        );
        this.engine.setSmoothingLevels(this.settings?.penSmoothing ?? 0.3, this.settings?.highlighterSmoothing ?? 0.55);
        if (this.plugin) {
            this.plugin.activeEngines.add(this.engine);
        }
        this.canvas = this.engine.getCanvas();
        if (this.focusedEngineRef) {
            this.registerDomEvent(this.canvas, 'pointerdown', () => {
                // Focus Shift Guardrail
                if (this.globalToolbar?.isStylePanelOpen?.()) return;
                this.focusedEngineRef?.set(this.engine);
            }, { capture: true });
        }
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

        // Instantiate selection and paste menus
        const selectionMenu = new SelectionMenu(wrapper);
        selectionMenu.setApp(this.app);
        const pasteMenu = new PasteMenu(wrapper);

        this.engine.onSyncLink((url) => {
            // Standalone canvas files do not have Markdown frontmatter; register an empty callback.
        });

        this.engine.onHoverLink((url, event) => {
            // Standalone canvas files do not have Markdown hover previews; register an empty callback.
        });

        selectionMenu.onCut = () => this.engine?.cut();
        selectionMenu.onCopy = () => this.engine?.copy();

        pasteMenu.onPaste = (clientX?: number, clientY?: number) => {
            if (!this.engine || isPreview) return;
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



        this.engine.setPenColor(this.settings.defaultPenColor);
        this.engine.setPenSize(this.settings.defaultPenSize);

        if (!isPreview) {
            this.saveDebounced = debounce(async () => {
                if (!this.page || !this.fileManager) return;
                await this.fileManager.savePage(this.page);
            }, this.settings.autoSaveDebounceMs);

            this.engine.onSave(() => this.saveDebounced!());
        }

        this.resizeObserver = new ResizeObserver(() => {
            this.engine?.resize();
        });
        this.resizeObserver.observe(canvasContainer);
    }
}
