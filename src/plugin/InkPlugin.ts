import { Plugin, App, MarkdownView, TFile } from 'obsidian';
import { InkFileManager } from '../io/FileManager';
import {
    ApoloCanvasSettings,
    DEFAULT_SETTINGS,
    ApoloCanvasSettingsTab
} from './Settings';
import { registerInkProcessor } from './InkCodeBlockProcessor';
import { InkFullView, INK_FULL_VIEW_TYPE } from './InkFullView';
import { generateBlockId } from '../utils/id';
import { GraphCacheWorker } from './GraphCacheWorker';
import { CanvasSuggestModal } from '../ui/CanvasSuggestModal';
import { CanvasNameModal } from '../ui/CanvasNameModal';
import { FocusedEngineRef } from '../engine/FocusedEngineRef';
import { InkEngine } from '../engine/InkEngine';
import { PAGE_PRESETS } from '../model/InkPage';
import { Toolbar } from '../ui/Toolbar';

/**
 * Apolo Canvas — main plugin class.
 */
export default class InkPlugin extends Plugin {
    settings: ApoloCanvasSettings = DEFAULT_SETTINGS;
    activeEngines = new Set<InkEngine>();
    focusedEngineRef!: FocusedEngineRef;
    globalToolbar!: Toolbar;
    toolbarEl!: HTMLElement;

    async onload(): Promise<void> {
        // Initialize focus observer
        this.focusedEngineRef = new FocusedEngineRef();

        // Load saved settings
        await this.loadSettings();

        // Resolve target container and create global toolbar
        const targetContainer = (this.app.workspace.rootSplit as any)?.containerEl ?? (this.app.workspace as any).containerEl;
        this.toolbarEl = targetContainer.createDiv('ink-global-toolbar');
        this.globalToolbar = new Toolbar(this.toolbarEl, this.focusedEngineRef, this);

        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                this.globalToolbar.updateVisibilityMode();
            })
        );

        // Create cache worker
        this.cacheWorker = new GraphCacheWorker(this.app);

        // Create file manager
        this.fileManager = new InkFileManager(this.app);

        // Ensure centralized vault directories exist
        const adapter = this.app.vault.adapter;
        if (!(await adapter.exists('ApoloCanvas'))) {
            await adapter.mkdir('ApoloCanvas');
        }
        if (!(await adapter.exists('ApoloCanvas/data'))) {
            await adapter.mkdir('ApoloCanvas/data');
        }
        if (!(await adapter.exists('ApoloCanvas/exports'))) {
            await adapter.mkdir('ApoloCanvas/exports');
        }

        // Run legacy data migration on startup if not complete
        if (!this.settings.migrationComplete) {
            this.app.workspace.onLayoutReady(() => {
                this.fileManager.migrateFromLegacyStorage(this);
            });
        }

        // Register the ```ink code block processor
        registerInkProcessor(this);

        // Register the full-page view type
        this.registerView(
            INK_FULL_VIEW_TYPE,
            (leaf) => new InkFullView(leaf, this)
        );

        this.registerExtensions(['ink'], INK_FULL_VIEW_TYPE);

        // Register hover link source with native Page Preview plugin
        this.registerHoverLinkSource('apolo-canvas', { display: 'Apolo Canvas', defaultMod: true });

        // Initialize vault-wide ingestion scan for closed notes
        await this.cacheWorker.initializeVaultIndex();

        // Hook into metadataCache resolved event to reinject custom vector links
        this.registerEvent(
            this.app.metadataCache.on('resolved', () => {
                this.cacheWorker.reinjectVectorLinks();
            })
        );

        // Intercept hover previews for standalone .ink files to render the canvas preview
        this.registerEvent(
            (this.app.workspace as any).on('hover-link', (data: any) => {
                const url = data.linktext;
                if (!url) return;
                const cleanUrl = url.replace(/^\[\[(.*)\]\]$/, '$1').split('#')[0];
                let targetFile = this.app.metadataCache.getFirstLinkpathDest(cleanUrl, data.sourcePath || '');
                if (!targetFile) {
                    const abstractFile = this.app.vault.getAbstractFileByPath(cleanUrl);
                    if (abstractFile instanceof TFile) {
                        targetFile = abstractFile;
                    }
                }
                if (targetFile && targetFile.extension === 'ink') {
                    const resolvedFile = targetFile;
                    
                    // Rely on requestAnimationFrame as a microtask/rendering frame wrapper
                    // to guarantee that the popover instance is instantiated and registered by Page Preview.
                    requestAnimationFrame(async () => {
                        const activePopovers = (this.app.workspace as any).activeHoverPopovers || [];
                        const hoverParent = data.hoverParent;
                        let popover = hoverParent?.hoverPopover;
                        
                        if (!popover && activePopovers.length > 0) {
                            popover = activePopovers.find((p: any) => {
                                if (hoverParent && p.hoverParent === hoverParent) return true;
                                if (p.targetEl && data.targetEl) {
                                    return p.targetEl === data.targetEl || 
                                           p.targetEl.contains(data.targetEl) || 
                                           data.targetEl.contains(p.targetEl);
                                }
                                return false;
                            });
                            if (!popover) {
                                popover = activePopovers[activePopovers.length - 1];
                            }
                        }
                        
                        if (!popover || !popover.hoverEl) return;
                        const hoverEl = popover.hoverEl;
                        
                        // Prevent loading multiple times
                        if (hoverEl.querySelector('.ink-canvas-preview')) return;
                        
                        hoverEl.empty();
                        hoverEl.style.width = '400px';
                        hoverEl.style.height = '300px';
                        hoverEl.style.overflow = 'hidden';
                        hoverEl.style.padding = '0';
                        hoverEl.style.display = 'flex';
                        hoverEl.style.flexDirection = 'column';
                        hoverEl.style.backgroundColor = 'var(--background-primary)';
                        hoverEl.style.border = '1px solid var(--border-color)';
                        hoverEl.style.borderRadius = '8px';
                        hoverEl.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                        
                        const titleBar = hoverEl.createDiv({ cls: 'popover-title-bar' });
                        titleBar.style.padding = '4px 8px';
                        titleBar.style.fontSize = '0.9em';
                        titleBar.style.fontWeight = 'bold';
                        titleBar.style.borderBottom = '1px solid var(--border-color)';
                        titleBar.style.display = 'flex';
                        titleBar.style.justifyContent = 'space-between';
                        titleBar.style.alignItems = 'center';
                        titleBar.style.backgroundColor = 'var(--background-secondary)';
                        titleBar.createSpan({ text: resolvedFile.name });
                        
                        const canvasContainer = hoverEl.createDiv({ cls: 'ink-canvas-container ink-canvas-preview' });
                        canvasContainer.style.width = '100%';
                        canvasContainer.style.height = 'calc(100% - 28px)';
                        canvasContainer.style.position = 'relative';
                        canvasContainer.style.overflow = 'hidden';
                        
                        const page = await this.fileManager.loadPage(resolvedFile.basename);
                        if (page) {
                            const presetKey = this.settings.defaultPagePreset;
                            const preset = PAGE_PRESETS[presetKey] ?? PAGE_PRESETS.A4;
                            const engine = new InkEngine(
                                canvasContainer,
                                page,
                                preset.width,
                                preset.height,
                                this.settings
                            );
                            engine.isReadOnly = true;
                            engine.render();
                            
                            // Rely on ResizeObserver's initial callback on mount to auto-trigger resize/zoomFit
                            const resizeObserver = new ResizeObserver(() => {
                                engine.resize(true);
                                engine.zoomFit(true);
                            });
                            resizeObserver.observe(canvasContainer);
                            
                            // Prevent memory leaks: clean up when popover is closed
                            popover.register(() => {
                                resizeObserver.disconnect();
                                engine.destroy();
                            });
                        }
                    });
                }
            })
        );

        // Subscribe to metadata change events to keep graph edges continuously updated
        this.registerEvent(
            this.app.metadataCache.on('changed', (file) => {
                if (file.extension === 'md') {
                    this.cacheWorker.reinjectVectorLinks();
                    if (file instanceof TFile) {
                        this.cacheWorker.updateNoteIndex(file);
                    }
                }
            })
        );

        // Hook up a live file modification watch pipeline to capture asset renames instantly
        this.registerEvent(
            this.app.vault.on('rename', (file, oldPath) => {
                if (file instanceof TFile && file.extension === 'ink') {
                    this.cacheWorker.handleCanvasRename(file, oldPath);
                    this.cascadeCanvasRename(file, oldPath);
                }
            })
        );

        // Settings tab
        this.addSettingTab(new ApoloCanvasSettingsTab(this.app, this));

        // Ribbon icon
        this.addRibbonIcon('pen-tool', 'Add Ink Block', () => {
            this.insertInkBlock();
        });

        // Embed Handwriting Command
        this.addCommand({
            id: 'embed-handwriting',
            name: 'Embed Handwriting',
            editorCallback: (editor) => {
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                const activeNoteTitle = activeView?.file ? activeView.file.basename : 'Untitled';
                const modal = new CanvasNameModal(this.app, activeNoteTitle, (id) => {
                    const cursor = editor.getCursor();
                    const height = this.settings.defaultHeight ?? 400;
                    const bg = this.settings.defaultBackground ?? 'grid';
                    const gridSz = this.settings.defaultGridSize ?? 20;
                    const text = `\`\`\`ink\nid: ${id}\ntype: handwriting\nheight: ${height}\nbackground: ${bg}\ngridSize: ${gridSz}\n\`\`\`\n\n`;
                    editor.replaceRange(text, cursor);
                    const lines = text.split('\n');
                    editor.setCursor({ line: cursor.line + lines.length - 1, ch: 0 });
                });
                modal.open();
            },
        });

        // Embed Drawing Command
        this.addCommand({
            id: 'embed-drawing',
            name: 'Embed Drawing',
            editorCallback: (editor) => {
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                const activeNoteTitle = activeView?.file ? activeView.file.basename : 'Untitled';
                const modal = new CanvasNameModal(this.app, activeNoteTitle, (id) => {
                    const cursor = editor.getCursor();
                    const height = this.settings.defaultHeight ?? 400;
                    const bg = this.settings.defaultBackground ?? 'grid';
                    const gridSz = this.settings.defaultGridSize ?? 20;
                    const text = `\`\`\`ink\nid: ${id}\ntype: handwriting\nheight: ${height}\nbackground: ${bg}\ngridSize: ${gridSz}\n\`\`\`\n\n`;
                    editor.replaceRange(text, cursor);
                    const lines = text.split('\n');
                    editor.setCursor({ line: cursor.line + lines.length - 1, ch: 0 });
                });
                modal.open();
            },
        });

        // Embed Existing Canvas Command
        this.addCommand({
            id: 'embed-existing-canvas',
            name: 'Ink: Embed Existing Canvas',
            editorCallback: (editor) => {
                const modal = new CanvasSuggestModal(this.app, (file) => {
                    const cursor = editor.getCursor();
                    const height = this.settings.defaultHeight ?? 400;
                    const bg = this.settings.defaultBackground ?? 'grid';
                    const gridSz = this.settings.defaultGridSize ?? 20;
                    const text = `\`\`\`ink\nid: ${file.basename}\ntype: drawing\nheight: ${height}\nbackground: ${bg}\ngridSize: ${gridSz}\n\`\`\`\n\n`;
                    editor.replaceRange(text, cursor);
                    const lines = text.split('\n');
                    editor.setCursor({ line: cursor.line + lines.length - 1, ch: 0 });
                });
                modal.open();
            },
        });

        // Register global keyboard shortcuts active only when ink block is focused
        this.registerDomEvent(document, 'keydown', (e: KeyboardEvent) => {
            const activeEl = document.activeElement;
            if (!activeEl || !activeEl.closest('.ink-block-wrapper')) {
                return;
            }

            const wrapper = activeEl.closest('.ink-block-wrapper') as any;
            if (!wrapper || !wrapper.engine) return;
            const engine = wrapper.engine;

            const isMod = e.ctrlKey || e.metaKey;

            if (isMod && e.key === 'z') {
                e.preventDefault();
                e.stopPropagation();
                if (e.shiftKey) {
                    engine.redo();
                } else {
                    engine.undo();
                }
            } else if (isMod && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
                e.preventDefault();
                e.stopPropagation();
                (this.app as any).commands.executeCommandById('apolo-canvas:embed-handwriting');
            } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                const key = e.key.toLowerCase();
                if (key === 'p') {
                    e.preventDefault();
                    e.stopPropagation();
                    engine.setTool('pen');
                } else if (key === 'h') {
                    e.preventDefault();
                    e.stopPropagation();
                    engine.setTool('highlighter');
                } else if (key === 'e') {
                    e.preventDefault();
                    e.stopPropagation();
                    engine.setTool('eraser');
                } else if (key === 'l') {
                    e.preventDefault();
                    e.stopPropagation();
                    engine.setTool('lasso');
                }
            }
        });
    }

    async onunload(): Promise<void> {
        this.globalToolbar?.destroy();
    }

    async loadSettings(): Promise<void> {
        const data = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    cascadeCanvasRename(file: TFile, oldPath: string): void {
        const oldId = oldPath.split('/').pop()?.replace(/\.ink$/i, '') || '';
        const newId = file.basename;
        if (!oldId || !newId || oldId === newId) return;

        const escapedOldId = oldId.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(\\bid:\\s*"?)${escapedOldId}("?\\b)`, 'g');

        const mdFiles = this.app.vault.getMarkdownFiles();
        for (const mdFile of mdFiles) {
            this.app.vault.process(mdFile, (content) => {
                return content.replace(regex, `$1${newId}$2`);
            });
        }
    }

    /** Insert an ink block at the current cursor position. */
    private insertInkBlock(): void {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            const editor = view.editor;
            const activeNoteTitle = view.file?.basename ?? 'Untitled';
            const modal = new CanvasNameModal(this.app, activeNoteTitle, (id) => {
                const cursor = editor.getCursor();
                const height = this.settings.defaultHeight ?? 400;
                const bg = this.settings.defaultBackground ?? 'grid';
                const gridSz = this.settings.defaultGridSize ?? 20;
                const text = `\`\`\`ink\nid: ${id}\ntype: handwriting\nheight: ${height}\nbackground: ${bg}\ngridSize: ${gridSz}\n\`\`\`\n\n`;
                editor.replaceRange(text, cursor);
                const lines = text.split('\n');
                editor.setCursor({ line: cursor.line + lines.length - 1, ch: 0 });
            });
            modal.open();
        }
    }
}
