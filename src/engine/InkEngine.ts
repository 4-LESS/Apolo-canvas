import { InkPage, BackgroundType } from '../model/InkPage';
import { InkElement } from '../model/InkElement';
import { StrokeStyle, DEFAULT_PEN_STYLE, DEFAULT_ERASER_SIZE } from '../model/Style';
import { ObsidianInkSettings, DEFAULT_SETTINGS } from '../plugin/Settings';
import { ViewportManager } from './ViewportManager';
import { Renderer } from './Renderer';
import { InputHandler } from './InputHandler';
import { HistoryManager } from './HistoryManager';
import { Tool, ToolContext } from '../tools/Tool';
import { PenTool } from '../tools/PenTool';
import { EraserTool } from '../tools/EraserTool';
import { LassoTool } from '../tools/LassoTool';
import { HighlighterTool } from '../tools/HighlighterTool';
import { SelectionManager } from './SelectionManager';
import { ClipboardManager } from './ClipboardManager';
import { StrokePattern } from '../model/ElementStyle';
import { registerDefaultShapes } from '../shapes/registerDefaultShapes';
import { ShapeTool } from '../tools/ShapeTool';
import { getElementCssSize } from '../utils/dom';



/**
 * The InkEngine orchestrates all components of the drawing system:
 * renderer, input, tools, history, and viewport.
 *
 * It creates the ToolContext that tools use to interact with the system,
 * and manages the lifecycle of all engine components.
 */
export class InkEngine {
    private page: InkPage;
    private viewport: ViewportManager;
    private renderer: Renderer;
    private inputHandler!: InputHandler;
    private history: HistoryManager;
    private selectionManager: SelectionManager;
    private clipboardManager: ClipboardManager;

    private tools: Map<string, Tool> = new Map();
    private activeToolName: string = 'pen';
    private penStyle: StrokeStyle;
    private eraserSize: number;
    public currentPattern: StrokePattern = 'solid';
    private fillStyleColor: string = 'transparent';
    public eraserMode: 'segment' | 'whole' = 'segment';
    private penSmoothing: number = 0.25;
    private highlighterSmoothing: number = 0.3;

    private toolSizes: Map<string, number> = new Map([
        ['pen',         4],    // default pen size in px
        ['highlighter', 16],   // highlighter default — noticeably larger than pen
        ['eraser',      20],   // eraser default
        ['shape',       3],    // shape default
    ]);

    private activePenProfileId: string = 'pen-rounded';
    private activeHighlighterProfileId: string = 'highlighter-round';

    get activeProfileId(): string {
        return this.activeToolName === 'highlighter' ? this.activeHighlighterProfileId : this.activePenProfileId;
    }

    set activeProfileId(val: string) {
        if (val.startsWith('highlighter')) {
            this.activeHighlighterProfileId = val;
        } else if (val.startsWith('pen')) {
            this.activePenProfileId = val;
        } else {
            if (this.activeToolName === 'highlighter') {
                this.activeHighlighterProfileId = val;
            } else {
                this.activePenProfileId = val;
            }
        }
    }

    public getContainer(): HTMLElement {
        return this.container;
    }


    private onToolSwitchCallbacks: ((toolName: string) => void)[] = [];
    private onStrokeStartCallbacks: (() => void)[] = [];

    public toolContext: ToolContext;
    private onSaveCallback: (() => void) | null = null;
    private isReadOnlyState: boolean = false;
    private onNavigateLinkCallback: ((url: string) => void) | null = null;
    private onSyncLinkCallback: ((url: string) => void) | null = null;
    private onHoverLinkCallback: ((url: string, event: PointerEvent) => void) | null = null;
    private onElementsUpdatedCallbacks: ((elements: InkElement[]) => void)[] = [];
    private onRecentColorsChangeCallbacks: ((color: string) => void)[] = [];
    public settings: ObsidianInkSettings;

    constructor(
        private container: HTMLElement,
        page: InkPage,
        private pageWidth: number,
        private pageHeight: number,
        settings?: ObsidianInkSettings
    ) {
        this.settings = settings ?? { ...DEFAULT_SETTINGS };
        this.page = page;
        this.penStyle = { ...DEFAULT_PEN_STYLE };
        this.eraserSize = DEFAULT_ERASER_SIZE;

        // Create history manager
        this.history = new HistoryManager(100);

        // Create viewport
        const initialSize = getElementCssSize(container, 600, 400);
        this.viewport = new ViewportManager(initialSize.width, initialSize.height, pageWidth, pageHeight);

        // Create renderer
        this.renderer = new Renderer(container, pageWidth, pageHeight);

        // Create selection & clipboard managers
        this.selectionManager = new SelectionManager(this.page, this.history, {
            fullRender: () => this.render()
        });
        this.renderer.setSelectionState(this.selectionManager.getState());
        this.clipboardManager = new ClipboardManager();

        // Create tool context
        const self = this;
        this.toolContext = {
            page: this.page,
            viewport: this.viewport,
            history: this.history,
            selectionManager: this.selectionManager,
            clipboardManager: this.clipboardManager,
            penStyle: this.penStyle,
            eraserSize: this.eraserSize,
            get eraserMode() { return self.eraserMode; },
            set eraserMode(val: 'segment' | 'whole') { self.eraserMode = val; },
            get currentEraserWidth() { return self.eraserSize; },
            canvas: this.renderer.getCanvas(),
            get currentColor() { return self.penStyle.color; },
            get currentSize() { return self.penStyle.size; },
            get currentPattern() { return self.currentPattern; },
            set currentPattern(val: StrokePattern) { self.currentPattern = val; },
            get currentFillColor() { return self.fillStyleColor; },
            set currentFillColor(val: string) { self.fillStyleColor = val; },
            get shiftHeld() { return self.inputHandler?.shiftHeld ?? false; },
            set shiftHeld(val: boolean) { if (self.inputHandler) self.inputHandler.shiftHeld = val; },
            get smoothingLevel(): number {
                if (self.activeToolName === 'pen') return self.penSmoothing;
                if (self.activeToolName === 'highlighter') return self.highlighterSmoothing;
                return 0;
            },
            getToolSize: (toolName: string) => this.getToolSize(toolName),
            requestRender: () => this.renderActiveFrame(),
            requestFullRender: () => this.render(),
            requestSave: () => this.triggerSave(),
            requestToolSwitch: (toolName: string) => this.setTool(toolName),
            addRecentColor: (color: string) => this.addRecentColor(color),
            get activeProfileId() { return self.activeProfileId; },
            get settings() { return self.settings; }
        };

        registerDefaultShapes();

        // Register tools
        const penTool = new PenTool();
        const eraserTool = new EraserTool();
        const lassoTool = new LassoTool(this.selectionManager);
        const highlighterTool = new HighlighterTool();
        const shapeTool = new ShapeTool(this.page, this.history, this.renderer);
        
        this.tools.set('pen', penTool);
        this.tools.set('eraser', eraserTool);
        this.tools.set('lasso', lassoTool);
        this.tools.set('highlighter', highlighterTool);
        this.tools.set('shape', shapeTool);


        // Create input handler
        this.inputHandler = new InputHandler(
            this.renderer.getCanvas(),
            this.toolContext,
            this.viewport,
            this
        );
        this.inputHandler.setClipboardManager(this.clipboardManager);
        this.inputHandler.setOverrideTools(lassoTool, eraserTool);
        this.inputHandler.setTool(penTool);

        // Initialize
        this.inputHandler.attach();
        this.render();
    }

    /** Set callback invoked when data changes and should be saved. */
    onSave(callback: () => void): void {
        this.onSaveCallback = callback;
    }

    get isReadOnly(): boolean {
        return this.isReadOnlyState;
    }

    set isReadOnly(val: boolean) {
        this.isReadOnlyState = val;
        const canvas = this.renderer.getCanvas();
        if (val) {
            this.selectionManager.clearSelection();
            canvas.style.cursor = 'default';
            if (canvas.parentElement) {
                canvas.parentElement.style.cursor = 'default';
                if (canvas.parentElement.parentElement) {
                    canvas.parentElement.parentElement.style.cursor = 'default';
                }
            }
        } else {
            const activeTool = this.getActiveTool();
            if (activeTool) {
                canvas.style.cursor = activeTool.cursor;
                if (canvas.parentElement) {
                    canvas.parentElement.style.cursor = activeTool.cursor;
                    if (canvas.parentElement.parentElement) {
                        canvas.parentElement.parentElement.style.cursor = activeTool.cursor;
                    }
                }
            }
        }
        this.render();
    }

    getPenSmoothing(): number {
        return this.penSmoothing;
    }

    getHighlighterSmoothing(): number {
        return this.highlighterSmoothing;
    }

    setPenSmoothing(v: number): void {
        this.penSmoothing = v;
    }

    setHighlighterSmoothing(v: number): void {
        this.highlighterSmoothing = v;
    }

    setSmoothingLevels(penVal: number, highlightVal: number): void {
        this.penSmoothing = penVal;
        this.highlighterSmoothing = highlightVal;
    }

    onNavigateLink(callback: (url: string) => void): void {
        this.onNavigateLinkCallback = callback;
    }

    triggerNavigateLink(url: string): void {
        this.onNavigateLinkCallback?.(url);
    }

    onSyncLink(callback: (url: string) => void): void {
        this.onSyncLinkCallback = callback;
    }

    triggerSyncLink(url: string): void {
        this.onSyncLinkCallback?.(url);
    }

    onHoverLink(callback: (url: string, event: PointerEvent) => void): void {
        this.onHoverLinkCallback = callback;
    }

    triggerHoverLink(url: string, event: PointerEvent): void {
        this.onHoverLinkCallback?.(url, event);
    }

    /** Switch the active tool by name. */
    setTool(toolName: string): void {
        console.log('[DIAGNOSTIC] engine.setTool called with:', toolName);
        console.log('[DIAGNOSTIC] Tool found in map?', this.tools.has(toolName));
        const tool = this.tools.get(toolName);
        if (!tool) return;

        const prev = this.tools.get(this.activeToolName);
        prev?.onDeactivate?.(this.toolContext);

        this.activeToolName = toolName;
        if (this.toolSizes.has(toolName) && toolName !== 'eraser') {
            this.penStyle.size = this.getToolSize(toolName);
        }
        this.inputHandler.setTool(tool);
        tool.onActivate?.(this.toolContext);
        for (const cb of this.onToolSwitchCallbacks) {
            cb(toolName);
        }
        this.renderActiveFrame();
    }

    onToolSwitch(callback: (toolName: string) => void): void {
        this.onToolSwitchCallbacks.push(callback);
    }

    offToolSwitch(callback: (toolName: string) => void): void {
        this.onToolSwitchCallbacks = this.onToolSwitchCallbacks.filter(cb => cb !== callback);
    }

    getTool(name: string): Tool | undefined {
        return this.tools.get(name);
    }

    onStrokeStart(callback: () => void): void {
        this.onStrokeStartCallbacks.push(callback);
    }

    offStrokeStart(callback: () => void): void {
        this.onStrokeStartCallbacks = this.onStrokeStartCallbacks.filter(cb => cb !== callback);
    }

    triggerStrokeStart(): void {
        this.onStrokeStartCallbacks.forEach(cb => cb());
    }

    getActiveTool(): Tool {
        return this.tools.get(this.activeToolName)!;
    }

    getToolSize(toolName: string): number {
        return this.toolSizes.get(toolName) ?? 3;
    }

    setToolSize(toolName: string, size: number): void {
        this.toolSizes.set(toolName, size);
        if (toolName === 'pen' || toolName === 'shape') {
            this.penStyle.size = size;
        } else if (toolName === 'eraser') {
            this.eraserSize = size;
            this.toolContext.eraserSize = size;
        }
    }


    /** Get the name of the currently active tool. */
    getToolName(): string {
        return this.activeToolName;
    }

    get currentFillColor(): string {
        return this.fillStyleColor;
    }

    set currentFillColor(val: string) {
        this.fillStyleColor = val;
    }

    /** Set pen color. */
    setPenColor(color: string): void {
        this.penStyle.color = color;
        this.toolContext.penStyle = this.penStyle;
    }

    /** Set pen size. */
    setPenSize(size: number): void {
        this.penStyle.size = Math.max(1, Math.min(50, size));
        this.toolContext.penStyle = this.penStyle;
    }

    /** Set eraser size. */
    setEraserSize(size: number): void {
        this.eraserSize = Math.max(5, Math.min(100, size));
        this.toolContext.eraserSize = this.eraserSize;
    }

    /** Undo the last action. */
    undo(): void {
        if (this.history.undo()) {
            this.render();
            this.triggerSave();
        }
    }

    /** Redo the last undone action. */
    redo(): void {
        if (this.history.redo()) {
            this.render();
            this.triggerSave();
        }
    }

    canUndo(): boolean {
        return this.history.canUndo();
    }

    canRedo(): boolean {
        return this.history.canRedo();
    }

    /**
     * Render the active frame (composites bg + completed + tool overlay).
     * Called during active drawing for every pointer move.
     */
    private renderActiveFrame(): void {
        const activeTool = this.tools.get(this.activeToolName);
        this.renderer.renderFrame(
            this.page,
            this.viewport,
            activeTool?.renderOverlay
                ? (ctx) => activeTool.renderOverlay!(ctx, this.toolContext)
                : undefined,
            {
                ...this.settings,
                penSmoothing: this.penSmoothing,
                highlighterSmoothing: this.highlighterSmoothing
            },
            this.isReadOnly
        );
        
        // Draw selection overlay
        this.renderer.clearOverlay();
        this.renderer.drawOverlay(
            this.selectionManager.getState(),
            this.viewport,
            this.page,
            {
                ...this.settings,
                penSmoothing: this.penSmoothing,
                highlighterSmoothing: this.highlighterSmoothing
            },
            this.isReadOnly
        );
    }

    /**
     * Full render: background + all completed strokes + composite.
     * Called on page load, undo/redo, viewport changes.
     */
    render(): void {
        const activeTool = this.tools.get(this.activeToolName);
        this.renderer.fullRender(
            this.page,
            this.viewport,
            this.page.background,
            activeTool?.renderOverlay
                ? (ctx) => activeTool.renderOverlay!(ctx, this.toolContext)
                : undefined,
            {
                ...this.settings,
                penSmoothing: this.penSmoothing,
                highlighterSmoothing: this.highlighterSmoothing
            },
            this.isReadOnly
        );
        
        // Draw selection overlay
        this.renderer.clearOverlay();
        this.renderer.drawOverlay(
            this.selectionManager.getState(),
            this.viewport,
            this.page,
            {
                ...this.settings,
                penSmoothing: this.penSmoothing,
                highlighterSmoothing: this.highlighterSmoothing
            },
            this.isReadOnly
        );
    }

    /** Handle container resize. */
    resize(fitBoth: boolean = false): void {
        const { width: w, height: h } = getElementCssSize(this.container, 600, 400);
        if (w === 0 || h === 0) return;

        this.viewport.resize(w, h, fitBoth);
        this.renderer.resize(w, h);
        this.render();
    }



    /** Set the background pattern. */
    setBackground(bg: BackgroundType): void {
        this.page.background = bg;
        this.render();
    }

    /** Zoom in. */
    zoomIn(): void {
        const dim = this.viewport.getContainerDimensions();
        this.viewport.zoomAt(dim.width / 2, dim.height / 2, 1.2);
        this.render();
    }

    /** Zoom out. */
    zoomOut(): void {
        const dim = this.viewport.getContainerDimensions();
        this.viewport.zoomAt(dim.width / 2, dim.height / 2, 0.8);
        this.render();
    }

    /** Reset zoom to fit page. */
    zoomFit(fitBoth: boolean = false): void {
        this.viewport.fitToContainer(fitBoth);
        this.render();
    }

    /** Copy selection to clipboard */
    copy(): void {
        this.clipboardManager.copy(this.selectionManager.getState(), this.page);
    }

    /** Cut selection to clipboard */
    cut(): void {
        const state = this.selectionManager.getState();
        if (state.selectedIds.size > 0) {
            this.clipboardManager.cut(state, this.page, this.history);
            this.selectionManager.clearSelection();
            this.render();
        }
    }

    /** Paste from clipboard */
    paste(): void {
        if (this.clipboardManager.hasContent()) {
            this.clipboardManager.paste(this.page, this.history);
            this.render();
        }
    }

    getInputHandler(): InputHandler {
        return this.inputHandler;
    }

    getClipboardManager(): ClipboardManager {
        return this.clipboardManager;
    }

    getSelectionManager(): SelectionManager {
        return this.selectionManager;
    }

    getViewport(): ViewportManager {
        return this.viewport;
    }

    getActivePage(): InkPage {
        return this.page;
    }

    getHistoryManager(): HistoryManager {
        return this.history;
    }

    triggerSave(): void {
        this.triggerElementsUpdated();
        this.onSaveCallback?.();
    }

    addRecentColor(color: string): void {
        for (const cb of this.onRecentColorsChangeCallbacks) {
            cb(color);
        }
    }

    onRecentColorsChange(callback: (color: string) => void): void {
        this.onRecentColorsChangeCallbacks.push(callback);
    }

    offRecentColorsChange(callback: (color: string) => void): void {
        this.onRecentColorsChangeCallbacks = this.onRecentColorsChangeCallbacks.filter(cb => cb !== callback);
    }

    onElementsUpdated(callback: (elements: InkElement[]) => void): void {
        this.onElementsUpdatedCallbacks.push(callback);
    }

    offElementsUpdated(callback: (elements: InkElement[]) => void): void {
        this.onElementsUpdatedCallbacks = this.onElementsUpdatedCallbacks.filter(cb => cb !== callback);
    }

    triggerElementsUpdated(): void {
        for (const cb of this.onElementsUpdatedCallbacks) {
            cb(this.page.elements);
        }
    }

    /** Get the canvas element (for external DOM manipulation). */
    getCanvas(): HTMLCanvasElement {
        return this.renderer.getCanvas();
    }

    /** Request a full render of the page background and elements. */
    requestFullRender(): void {
        this.render();
    }

    /** Request that the page is saved. */
    requestSave(): void {
        this.triggerSave();
    }

    getSnapToGrid(): boolean {
        return this.page.snapToGrid;
    }

    setSnapToGrid(snap: boolean): void {
        this.page.snapToGrid = snap;
        this.triggerSave();
    }

    setPageDimensions(width: number, height: number): void {
        this.pageWidth = width;
        this.pageHeight = height;
        this.viewport.setPageDimensions(width, height);
        this.renderer.setPageDimensions(width, height);
    }

    clearCanvasElements(): void {
        this.page.elements = [];
        this.selectionManager.clearSelection();
        this.render();
        this.triggerSave();
    }

    /** Clean up all resources. */
    destroy(): void {
        this.inputHandler.detach();
        this.renderer.destroy();
    }
}
