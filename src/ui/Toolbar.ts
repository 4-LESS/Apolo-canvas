import { MarkdownView, setIcon } from 'obsidian';
import type { App, EventRef, Workspace } from 'obsidian';
import { FocusedEngineRef } from '../engine/FocusedEngineRef';
import { InkEngine } from '../engine/InkEngine';
import { StrokePattern } from '../model/ElementStyle';
import type { ApoloCanvasSettings, InkPalette } from '../plugin/Settings';
import { ColorStackComponent } from './toolbar/ColorStackComponent';
import { StrokeToolOptionsPopover, PEN_OPTIONS_CONFIG, HIGHLIGHTER_OPTIONS_CONFIG } from './toolbar/popovers/StrokeToolOptionsPopover';
import { ToolPillComponent } from './toolbar/ToolPillComponent';
import { ColorPickerPopover } from './toolbar/popovers/ColorPickerPopover';
import { EraserOptionsPopover } from './toolbar/popovers/EraserOptionsPopover';
import { PatternPopover } from './toolbar/popovers/PatternPopover';
import { ShapeOptionsPopover } from './toolbar/popovers/ShapeOptionsPopover';
import { SwatchManagerModal } from './modals/SwatchManagerModal';
import { PencilCaseBar } from './toolbar/popovers/PencilCaseBar';
import { FloatingDragController } from './toolbar/FloatingDragController';
import { addClass, removeClass, toggleClass, hasClass } from '../utils/dom';
import { PATTERN_SVGS } from './toolbar/patterns';

type PaletteTool = 'pen' | 'highlighter' | 'shape';

interface ToolbarPlugin {
    app?: App;
    settings?: ApoloCanvasSettings;
    settingTab?: { display(): void };
    registerEvent?(eventRef: EventRef): void;
    saveSettings?(): Promise<void>;
}

interface GlobalWithApp {
    app?: App;
}

type WorkspaceDomLike = Workspace & {
    containerEl: HTMLElement;
    leftSplit: Workspace['leftSplit'] & { containerEl: HTMLElement };
};

type AppDomLike = App & {
    isMobile?: boolean;
    workspace: WorkspaceDomLike;
};

const DEFAULT_PALETTES: Record<PaletteTool, InkPalette[]> = {
    pen: [{ id: 'classic', name: 'Classic', colors: ['#000000', '#ff0000', '#0000ff', '#00ff00'] }],
    highlighter: [{ id: 'classic', name: 'Classic', colors: ['#ffff0080', '#00ff0080', '#ff00ff80', '#00ffff80'] }],
    shape: [{ id: 'classic', name: 'Classic', colors: ['#000000', '#ff0000', '#0000ff', '#00ff00'] }]
};

export class Toolbar {
    public patternToggleBtn!: HTMLButtonElement;
    public highlighterOptionsPopover!: StrokeToolOptionsPopover;
    public colorPickerPopover!: ColorPickerPopover;
    public patternPopover!: PatternPopover;
    public eraserPopover!: EraserOptionsPopover;
    public penOptionsPopover!: StrokeToolOptionsPopover;
    public shapeOptionsPopover!: ShapeOptionsPopover;
    public pencilCaseBar!: PencilCaseBar;
    public dragController!: FloatingDragController;
    public activePickerSlotIdx: number | null = null;
    public settingsSaveTimeout: ReturnType<typeof setTimeout> | null = null;
    public swatchManagerModal: SwatchManagerModal | null = null;
    private toolPillComponent!: ToolPillComponent;
    private colorStackComponent!: ColorStackComponent;
    private cleanups: (() => void)[] = [];
    private sidebarCleanups: (() => void)[] = [];
    private intentionallyOpenedPanelEl: HTMLElement | null = null;
    private lastActiveToolName: string | null = null;
    private outsideDismissHandler: ((event: PointerEvent) => void) | null = null;
    private sidebarStateFrame: number | null = null;

    constructor(
        public toolbarEl: HTMLElement,
        public focusedEngineRef: FocusedEngineRef,
        public plugin?: ToolbarPlugin
    ) {
        this.buildUI();
        this.focusedEngineRef.onChange((engine) => {
            this.teardownListeners();
            this.setupListeners(engine);
            this.updateSidebarOverlayState();
            this.updatePencilCaseMount(engine);
            this.syncToolState();
        });
        this.setupListeners(this.focusedEngineRef.get());
        this.installOutsideDismiss();
        this.installWorkspaceListeners();
        this.updateSidebarOverlayState();
        this.updatePencilCaseMount(this.focusedEngineRef.get());
        this.syncToolState();

        const app = this.getApp();
        if (app && this.plugin?.registerEvent) {
            this.plugin.registerEvent(
                app.workspace.on('resize', () => this.scheduleSidebarOverlayStateUpdate())
            );
            this.plugin.registerEvent(
                app.workspace.on('layout-change', () => this.scheduleSidebarOverlayStateUpdate())
            );
        }
        this.installSidebarStateWatchers();
    }

    get toolPillEl(): HTMLElement { return this.toolPillComponent.containerEl; }
    get toolButtons(): Map<string, HTMLButtonElement> { return this.toolPillComponent.toolButtons; }
    get undoBtn(): HTMLButtonElement { return this.toolPillComponent.undoBtn; }
    get redoBtn(): HTMLButtonElement { return this.toolPillComponent.redoBtn; }
    get snapBtn(): HTMLButtonElement { return this.toolPillComponent.snapBtn; }
    get colorSlotsStackEl(): HTMLElement { return this.colorStackComponent.containerEl; }
    get colorSlotBtns(): HTMLButtonElement[] { return this.colorStackComponent.slotBtns; }
    get colorPickerPopoverEl(): HTMLElement { return this.colorPickerPopover.el; }
    get patternPopoverEl(): HTMLElement { return this.patternPopover.el; }
    get eraserPopoverEl(): HTMLElement { return this.eraserPopover.el; }
    get penOptionsPanelEl(): HTMLElement { return this.penOptionsPopover?.el; }
    get highlighterOptionsPanelEl(): HTMLElement { return this.highlighterOptionsPopover?.el; }
    get shapeOptionsPanelEl(): HTMLElement { return this.shapeOptionsPopover?.el; }

    private buildUI(): void {
        this.toolPillComponent = new ToolPillComponent(this.toolbarEl, {
            onToolSelect: (toolId) => this.handleToolSelect(toolId),
            onToolReselect: (toolId) => this.handleToolReselect(toolId),
            onSnapToggle: () => this.withEngine((engine) => engine.setSnapToGrid(!engine.getSnapToGrid())),
            onUndo: () => this.withEngine((engine) => engine.undo()),
            onRedo: () => this.withEngine((engine) => engine.redo())
        });
        this.colorStackComponent = new ColorStackComponent(this.toolPillComponent.containerEl, {
            onSelect: (anchor, slotIndex) => this.selectColorSlot(anchor, slotIndex),
            onOpenPicker: (anchor, slotIndex) => this.openColorPicker(anchor, slotIndex)
        }, this);
        this.patternToggleBtn = this.toolPillComponent.containerEl.createEl('button', {
            cls: 'ink-tool-btn ink-pattern-toggle',
            attr: { title: 'Line Pattern' }
        }) as HTMLButtonElement;
        this.patternToggleBtn.innerHTML = PATTERN_SVGS.solid;
        this.patternToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!this.focusedEngineRef.get()) return;
            this.patternPopover.isOpen ? this.patternPopover.hide() : this.patternPopover.showPatternMenu(this.patternToggleBtn);
        });
        this.toolPillComponent.buildActionRow();
        if (typeof document !== 'undefined') {
            document.querySelectorAll('.ink-global-pencil-case-bar').forEach(el => el.remove());
        }

        const rootContainer = this.getOverlayContainer();
        // Popovers live outside leaves and the draggable toolbar.  The toolbar is
        // passed separately as their click-away boundary and positioning reference.
        // Use the document overlay rather than a workspace split: splits can clip
        // absolutely-positioned children or participate in a flex layout, which is
        // what produced the full-height/sidebar-looking option panel.
        const popoverContainer = this.getPopoverContainer(rootContainer);
        this.colorPickerPopover = new ColorPickerPopover(popoverContainer, this.plugin, this, this.toolbarEl);
        this.patternPopover = new PatternPopover(popoverContainer, this.plugin, this, this.toolbarEl);
        this.eraserPopover = new EraserOptionsPopover(popoverContainer, this.plugin, () => this.toolButtons.get('eraser'), this.toolbarEl);
        this.penOptionsPopover = new StrokeToolOptionsPopover(popoverContainer, this.plugin, this, PEN_OPTIONS_CONFIG, this.toolbarEl);
        this.highlighterOptionsPopover = new StrokeToolOptionsPopover(popoverContainer, this.plugin, this, HIGHLIGHTER_OPTIONS_CONFIG, this.toolbarEl);
        this.shapeOptionsPopover = new ShapeOptionsPopover(popoverContainer, this.plugin, this, this.toolbarEl);
        this.pencilCaseBar = new PencilCaseBar(rootContainer, this.plugin, this);

        this.dragController = new FloatingDragController({
            targetEl: this.toolbarEl,
            otherElementGetter: () => this.pencilCaseBar?.containerEl || null,
            onOrientationChange: (orientation) => {
                const isVert = orientation === 'vertical';
                this.toggleClass(this.toolbarEl, 'is-vertical-orientation', isVert);
                this.toggleClass(this.toolbarEl, 'is-horizontal-orientation', !isVert);
                this.colorStackComponent?.setOrientation(orientation);
                this.repositionOpenPopovers();
            }
        });
        this.toggleClass(this.toolbarEl, 'is-vertical-orientation', true);
        this.colorStackComponent?.setOrientation('vertical');
    }

    private handleToolSelect(toolId: string): void {
        this.closeAllMenus();
        this.resetColorSlotClickCycle();
        this.intentionallyOpenedPanelEl = null;
        this.withEngine((engine) => engine.setTool(toolId));
    }

    private handleToolReselect(toolId: string): void {
        const engine = this.focusedEngineRef.get();
        if (!engine) return;
        const btn = this.toolButtons.get(toolId);
        if (!btn) return;

        if (toolId === 'eraser') {
            if (this.eraserPopover.isOpen) {
                this.eraserPopover.hide();
                this.intentionallyOpenedPanelEl = null;
            } else {
                this.closeAllMenus();
                this.eraserPopover.showEraserOptions(btn, engine);
                this.intentionallyOpenedPanelEl = this.eraserPopover.el;
            }
        } else if (toolId === 'pen') {
            if (this.penOptionsPopover.isOpen) {
                this.penOptionsPopover.hide();
                this.intentionallyOpenedPanelEl = null;
            } else {
                this.closeAllMenus();
                this.penOptionsPopover.showOptions(btn, engine);
                this.intentionallyOpenedPanelEl = this.penOptionsPopover.el;
            }
        } else if (toolId === 'highlighter') {
            if (this.highlighterOptionsPopover.isOpen) {
                this.highlighterOptionsPopover.hide();
                this.intentionallyOpenedPanelEl = null;
            } else {
                this.closeAllMenus();
                this.highlighterOptionsPopover.showOptions(btn, engine);
                this.intentionallyOpenedPanelEl = this.highlighterOptionsPopover.el;
            }
        } else if (toolId === 'shape') {
            if (this.shapeOptionsPopover.isOpen) {
                this.shapeOptionsPopover.hide();
                this.intentionallyOpenedPanelEl = null;
            } else {
                this.closeAllMenus();
                this.shapeOptionsPopover.showShapeOptions(btn, engine);
                this.intentionallyOpenedPanelEl = this.shapeOptionsPopover.el;
            }
        }
    }

    private setupListeners(engine: InkEngine | null): void {
        if (!engine) return;
        const onSync = () => { this.syncToolState(); this.patternPopover?.hide(); };
        engine.onToolSwitch(onSync); this.cleanups.push(() => engine.offToolSwitch(onSync));
        engine.onElementsUpdated(onSync); this.cleanups.push(() => engine.offElementsUpdated(onSync));
        const onRecent = (color: string) => this.recordRecentColor(color);
        engine.onRecentColorsChange(onRecent); this.cleanups.push(() => engine.offRecentColorsChange(onRecent));
        if (typeof engine.onStrokeStart === 'function') {
            const close = () => { this.closeAllMenus(); this.intentionallyOpenedPanelEl = null; };
            engine.onStrokeStart(close); this.cleanups.push(() => engine.offStrokeStart?.(close));
        }
    }

    private teardownListeners(): void {
        this.flushSettingsSave();
        this.cleanups.forEach((cleanup) => cleanup());
        this.cleanups = [];
    }

    public updateSidebarOverlayState(): void {
        // On mobile the left split is always an overlay drawer: hide the toolbar
        // exactly while it is open. Obsidian's own `collapsed` flag is the source
        // of truth â€” no rect-measuring heuristics.
        const app = this.getApp() as AppDomLike | undefined;
        const isOverlayOpen = !!app?.isMobile && !!app.workspace?.leftSplit && !app.workspace.leftSplit.collapsed;
        this.toggleClass(this.toolbarEl, 'ink-sidebar-overlay-open', isOverlayOpen);
        this.clearSidebarOffset();
    }

    private clearSidebarOffset(): void {
        const style = this.toolbarEl.style as CSSStyleDeclaration & {
            removeProperty?: (property: string) => void;
        };
        if (typeof style.removeProperty === 'function') {
            style.removeProperty('--ink-sidebar-offset');
        } else {
            Object.assign(style, { '--ink-sidebar-offset': '' });
        }
    }

    private scheduleSidebarOverlayStateUpdate(): void {
        if (this.sidebarStateFrame !== null) {
            return;
        }
        const raf = typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame
            : (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16) as unknown as number;
        this.sidebarStateFrame = raf(() => {
            this.sidebarStateFrame = null;
            this.updateSidebarOverlayState();
            window.setTimeout(() => this.updateSidebarOverlayState(), 80);
            window.setTimeout(() => this.updateSidebarOverlayState(), 220);
        });
    }

    private installSidebarStateWatchers(): void {
        if (typeof document === 'undefined' || typeof window === 'undefined') return;
        const schedule = () => this.scheduleSidebarOverlayStateUpdate();
        document.addEventListener('pointerdown', schedule, true);
        document.addEventListener('pointerup', schedule, true);
        document.addEventListener('touchend', schedule, true);
        document.addEventListener('transitionend', schedule, true);
        window.addEventListener('resize', schedule);
        this.sidebarCleanups.push(() => {
            document.removeEventListener('pointerdown', schedule, true);
            document.removeEventListener('pointerup', schedule, true);
            document.removeEventListener('touchend', schedule, true);
            document.removeEventListener('transitionend', schedule, true);
            window.removeEventListener('resize', schedule);
            if (this.sidebarStateFrame !== null && typeof cancelAnimationFrame === 'function') {
                cancelAnimationFrame(this.sidebarStateFrame);
            }
            this.sidebarStateFrame = null;
        });
    }

    syncToolState(): void {
        const engine = this.focusedEngineRef.get();
        const workspace = this.getApp()?.workspace;
        const activeView = workspace?.getActiveViewOfType(MarkdownView);
        const isReadingMode = activeView && typeof activeView.getMode === 'function' && activeView.getMode() === 'preview';

        // During a leaf swap Obsidian transiently reports no active view at all.
        // Deciding visibility from that snapshot latches the toolbar hidden, so
        // keep the previous state until the workspace settles and re-notifies.
        if (workspace && !activeView && !workspace.activeLeaf?.view) {
            return;
        }

        // A focus change briefly sets the engine to null while Obsidian swaps
        // leaves.  That is an idle state, not a reason to hide the global toolbar.
        // Visibility is reserved for an unsupported view or explicit Reading mode.
        if (isReadingMode || (!activeView && !this.isInkFullView())) {
            this.toolButtons.forEach((btn) => this.removeClass(btn, 'is-active'));
            this.toolPillComponent.setSnapDisabled(true);
            this.toolPillComponent.setHistoryState(false, false);
            this.addClass(this.toolbarEl, 'is-hidden');
            this.pencilCaseBar?.updateVisibility(false);
            return;
        }

        if (!engine) {
            this.toolButtons.forEach((btn) => this.removeClass(btn, 'is-active'));
            this.toolPillComponent.setSnapDisabled(true);
            this.toolPillComponent.setHistoryState(false, false);
            this.closeAllMenus();
            this.removeClass(this.toolbarEl, 'is-hidden');
            this.addClass(this.toolbarEl, 'is-idle');
            this.pencilCaseBar?.updateVisibility(false);
            return;
        }

        this.removeClass(this.toolbarEl, 'is-hidden');
        this.removeClass(this.toolbarEl, 'is-idle');
        const tool = engine.getToolName();
        this.toolPillComponent.highlightActiveTool(tool);
        this.toolPillComponent.setSnapDisabled(false);
        this.toolPillComponent.setSnapActive(engine.getSnapToGrid());
        const history = typeof engine.getHistoryManager === 'function' ? engine.getHistoryManager() : null;
        this.toolPillComponent.setHistoryState(
            history ? history.canUndo() : engine.canUndo(),
            history ? history.canRedo() : engine.canRedo()
        );
        if (tool !== this.lastActiveToolName) this.restoreToolColor(engine, tool);
        this.lastActiveToolName = tool;
        const inactiveStyle = tool === 'lasso' || tool === 'eraser';
        this.toggleClass(this.colorSlotsStackEl, 'is-disabled', inactiveStyle);
        this.colorSlotsStackEl.style.opacity = inactiveStyle ? '0.4' : '1.0';
        this.colorSlotsStackEl.style.pointerEvents = inactiveStyle ? 'none' : 'all';
        this.patternToggleBtn.style.opacity = tool === 'pen' || tool === 'shape' ? '1.0' : '0.4';
        this.patternToggleBtn.style.pointerEvents = tool === 'pen' || tool === 'shape' ? 'all' : 'none';
        const activePattern = engine.currentPattern ?? 'solid';
        this.patternToggleBtn.innerHTML = PATTERN_SVGS[activePattern] ?? PATTERN_SVGS.solid;
        this.renderColorSlots(engine);
        this.pencilCaseBar?.syncValues();
        this.pencilCaseBar?.updateVisibility(true);
    }

    public closeAllMenus(except?: HTMLElement): void {
        if (this.eraserPopoverEl !== except) this.eraserPopover.hide();
        if (this.colorPickerPopoverEl !== except) this.colorPickerPopover.hide();
        if (this.patternPopoverEl !== except) this.patternPopover.hide();
        if (this.penOptionsPopover?.el !== except) this.penOptionsPopover?.hide();
        if (this.highlighterOptionsPopover?.el !== except) this.highlighterOptionsPopover?.hide();
        if (this.shapeOptionsPopover?.el !== except) this.shapeOptionsPopover?.hide();
        if (!except) this.intentionallyOpenedPanelEl = null;
    }

    public closeAllPopovers(except?: HTMLElement): void { this.closeAllMenus(except); }
    public isStylePanelOpen(): boolean {
        const penOpen = this.penOptionsPopover?.isOpen ?? false;
        const highlighterOpen = this.highlighterOptionsPopover?.isOpen ?? false;
        const shapeOpen = this.shapeOptionsPopover?.isOpen ?? false;
        return penOpen || highlighterOpen || shapeOpen;
    }
    public queueSettingsSave(): void { if (this.settingsSaveTimeout) clearTimeout(this.settingsSaveTimeout); this.settingsSaveTimeout = setTimeout(() => this.flushSettingsSave(), 300); }
    public flushSettingsSave(): void { if (this.settingsSaveTimeout) clearTimeout(this.settingsSaveTimeout); this.settingsSaveTimeout = null; void this.plugin?.saveSettings?.(); }

    destroy(): void {
        this.teardownListeners();
        this.sidebarCleanups.forEach((cleanup) => cleanup());
        this.sidebarCleanups = [];
        this.closeAllMenus();
        if (this.outsideDismissHandler && typeof document !== 'undefined') document.removeEventListener('pointerdown', this.outsideDismissHandler);
        this.outsideDismissHandler = null;

        [
            this.colorPickerPopover,
            this.patternPopover,
            this.eraserPopover,
            this.penOptionsPopover,
            this.highlighterOptionsPopover,
            this.shapeOptionsPopover
        ].forEach((popover) => popover?.destroy());

        this.pencilCaseBar?.destroy();
        this.toolbarEl?.remove();
    }

    private selectColorSlot(anchor: HTMLButtonElement, slotIndex: number): void {
        const engine = this.focusedEngineRef.get();
        if (!engine) return;
        const isHighlighter = engine.getToolName() === 'highlighter';
        const { palette } = this.getPaletteData(isHighlighter);
        this.closeAllMenus();
        const color = palette.colors[slotIndex] ?? palette.colors[0];
        const settings = this.plugin?.settings;
        if (settings && isHighlighter) {
            settings.activeHighlighterColorIndex = slotIndex;
            settings.lastHighlighterColorHex = color;
        } else if (settings) {
            settings.activePenColorIndex = slotIndex;
            settings.lastPenColorHex = color;
        }
        engine.setPenColor(color);
        this.patternPopover.hide();
        this.syncToolState();
    }

    private openColorPicker(anchor: HTMLButtonElement, slotIndex: number): void {
        const engine = this.focusedEngineRef.get();
        if (!engine) return;
        this.closeAllMenus(this.colorPickerPopoverEl);
        this.colorPickerPopover.isOpen && this.activePickerSlotIdx === slotIndex ? this.colorPickerPopover.hide() : this.colorPickerPopover.showColorPicker(anchor, slotIndex, engine);
    }

    public openSwatchManager(anchor: HTMLButtonElement): void {
        const app = this.getApp();
        if (!app) return;
        this.closeAllMenus();
        this.swatchManagerModal = new SwatchManagerModal(app, this.plugin, this);
        this.swatchManagerModal.open();
    }

    public syncColorSlots(toolType: string): void {
        const type = toolType === 'highlighter' ? 'highlighter' : (toolType === 'shape' ? 'shape' : 'pen');
        const { palette, activeIndex } = this.getPaletteData(type);
        this.colorStackComponent.syncColorSlots(palette.colors, activeIndex, toolType);

        if (this.swatchManagerModal) {
            this.swatchManagerModal.refresh();
        }
    }

    public resetColorSlotClickCycle(): void {
        this.colorStackComponent?.resetClickCycle();
    }


    public getPaletteData(toolType: boolean | 'pen' | 'highlighter' | 'shape') {
        const settings = this.plugin?.settings;
        let type: PaletteTool = 'pen';
        if (toolType === true || toolType === 'highlighter') type = 'highlighter';
        else if (toolType === 'shape') type = 'shape';

        let palettes: InkPalette[];
        let activePaletteId: string;
        let activeIndex: number;
        if (type === 'highlighter') {
            palettes = settings?.highlighterPalettes ?? DEFAULT_PALETTES.highlighter;
            if (!palettes || palettes.length === 0) palettes = DEFAULT_PALETTES.highlighter;
            activePaletteId = settings?.activeHighlighterPaletteId ?? 'classic';
            activeIndex = settings?.activeHighlighterColorIndex ?? 0;
        } else if (type === 'shape') {
            palettes = settings?.shapePalettes ?? DEFAULT_PALETTES.shape;
            if (!palettes || palettes.length === 0) palettes = DEFAULT_PALETTES.shape;
            activePaletteId = settings?.activeShapePaletteId ?? 'classic';
            activeIndex = settings?.activeShapeColorIndex ?? 0;
        } else {
            palettes = settings?.penPalettes ?? DEFAULT_PALETTES.pen;
            if (!palettes || palettes.length === 0) palettes = DEFAULT_PALETTES.pen;
            activePaletteId = settings?.activePenPaletteId ?? 'classic';
            activeIndex = settings?.activePenColorIndex ?? 0;
        }
        const palette = palettes.find((p) => p.id === activePaletteId) ?? palettes[0] ?? DEFAULT_PALETTES.pen[0];
        const colors = palette?.colors ?? ['#000000', '#ff0000', '#0000ff', '#00ff00'];
        return { palettes, activePaletteId, activeIndex, palette: { ...palette, colors } };
    }

    private renderColorSlots(engine: InkEngine): void {
        const tool = engine.getToolName();
        const type = tool === 'highlighter' ? 'highlighter' : (tool === 'shape' ? 'shape' : 'pen');
        const { palette, activeIndex } = this.getPaletteData(type);
        this.colorStackComponent.syncColorSlots(palette.colors, activeIndex, tool);
    }

    private recordRecentColor(color: string): void {
        const settings = this.plugin?.settings;
        if (!settings?.recentColors) return;
        const recent = settings.recentColors.filter((c: string) => c.toLowerCase() !== color.toLowerCase());
        recent.unshift(color);
        settings.recentColors = recent.slice(0, 8);
        const saved = this.plugin?.saveSettings?.();
        if (saved?.then) saved.then(() => this.syncToolState());
        else this.syncToolState();
    }

    private restoreToolColor(engine: InkEngine, tool: string): void {
        const settings = this.plugin?.settings;
        if (!settings) return;
        if (tool === 'pen') {
            const lastColor = settings.lastPenColorHex ?? this.currentColor(engine) ?? '#000000';
            settings.lastPenColorHex = lastColor;
            engine.setPenColor(lastColor);
        } else if (tool === 'highlighter') {
            const lastColor = settings.lastHighlighterColorHex ?? this.currentColor(engine) ?? '#ffff0080';
            settings.lastHighlighterColorHex = lastColor;
            engine.setPenColor(lastColor);
            engine.currentPattern = 'solid';
        } else if (tool === 'shape') {
            const lastColor = settings.lastShapeColorHex ?? this.currentColor(engine) ?? '#000000';
            settings.lastShapeColorHex = lastColor;
            engine.setPenColor(lastColor);
        }
    }

    private withEngine(action: (engine: InkEngine) => void): void {
        const engine = this.focusedEngineRef.get();
        if (!engine) return;
        action(engine);
        this.syncToolState();
    }

    private currentColor(engine: InkEngine): string {
        return engine.toolContext.currentColor ?? '#1a1a1a';
    }

    private repositionOpenPopovers(): void {
        this.colorPickerPopover?.reposition();
        this.patternPopover?.reposition();
        this.eraserPopover?.reposition();
        this.penOptionsPopover?.reposition();
        this.highlighterOptionsPopover?.reposition();
        this.shapeOptionsPopover?.reposition();
    }

    private getOverlayContainer(): HTMLElement {
        return (this.getApp() as AppDomLike | undefined)?.workspace.containerEl
            ?? this.toolbarEl.parentElement
            ?? this.toolbarEl;
    }

    private getPopoverContainer(fallback: HTMLElement): HTMLElement {
        return this.toolbarEl.ownerDocument?.body
            ?? (typeof document !== 'undefined' ? document.body : null)
            ?? fallback;
    }

    private isInkFullView(): boolean {
        return this.getApp()?.workspace.activeLeaf?.view.getViewType() === 'ink-full-view';
    }

    private installOutsideDismiss(): void {
        if (typeof document === 'undefined') return;
        // Each popover dismisses itself via BasePopover's outside-click guard.
        // This handler only resets toolbar-local interaction state.
        this.outsideDismissHandler = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (target && this.isToolbarInteractionTarget(target)) return;
            this.resetColorSlotClickCycle();
            this.intentionallyOpenedPanelEl = null;
        };
        document.addEventListener('pointerdown', this.outsideDismissHandler);
    }

    private isToolbarInteractionTarget(target: Node): boolean {
        return [
            this.toolbarEl,
            this.colorPickerPopover?.el,
            this.patternPopover?.el,
            this.eraserPopover?.el,
            this.penOptionsPopover?.el,
            this.highlighterOptionsPopover?.el,
            this.shapeOptionsPopover?.el,
            this.pencilCaseBar?.containerEl
        ].some((element) => !!element?.contains(target));
    }

    private installWorkspaceListeners(): void {
        const workspace = this.getApp()?.workspace;
        if (!workspace || typeof workspace.on !== 'function') return;

        const sync = () => {
            // Workspace rebuilds (mobile resume, layout load) can orphan the
            // toolbar element â€” re-attach it before syncing state.
            const container = (this.getApp() as AppDomLike | undefined)?.workspace.containerEl;
            if (container && this.toolbarEl.isConnected === false) {
                container.appendChild(this.toolbarEl);
            }
            this.syncToolState();
            this.repositionOpenPopovers();
        };
        const ref1 = workspace.on('active-leaf-change', sync);
        const ref2 = workspace.on('layout-change', sync);

        this.sidebarCleanups.push(() => {
            if (typeof workspace.offref === 'function') {
                if (ref1) workspace.offref(ref1);
                if (ref2) workspace.offref(ref2);
            }
        });
    }

    public updatePencilCaseMount(engine: InkEngine | null): void {
        const isEnabled = this.plugin?.settings?.enablePencilCase ?? true;
        this.pencilCaseBar?.syncValues();
        this.pencilCaseBar?.updateVisibility(!!(isEnabled && engine));
    }

    private addClass(el: HTMLElement, cls: string): void { addClass(el, cls); }
    private removeClass(el: HTMLElement, cls: string): void { removeClass(el, cls); }
    private toggleClass(el: HTMLElement, cls: string, enabled: boolean): void { toggleClass(el, cls, enabled); }

    private getApp(): App | undefined {
        return this.plugin?.app ?? (globalThis as unknown as GlobalWithApp).app;
    }

    private hasClass(el: HTMLElement, cls: string): boolean { return hasClass(el, cls); }
}
