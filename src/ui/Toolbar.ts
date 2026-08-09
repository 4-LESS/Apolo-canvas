import { MarkdownView, setIcon } from 'obsidian';
import { FocusedEngineRef } from '../engine/FocusedEngineRef';
import { InkEngine } from '../engine/InkEngine';
import { StrokePattern } from '../model/ElementStyle';
import { ColorStackComponent } from './toolbar/ColorStackComponent';
import { PenProfileRegistry } from '../model/PenProfileRegistry';
import { HighlighterOptionsPopover } from './toolbar/popovers/HighlighterOptionsPopover';
import { ToolPillComponent } from './toolbar/ToolPillComponent';
import { isColorMatch } from './toolbar/colorUtils';
import { ColorPickerPopover } from './toolbar/popovers/ColorPickerPopover';
import { EraserOptionsPopover } from './toolbar/popovers/EraserOptionsPopover';
import { PatternPopover } from './toolbar/popovers/PatternPopover';
import { SwatchManagerPopover } from './toolbar/popovers/SwatchManagerPopover';
import { PenOptionsPopover } from './toolbar/popovers/PenOptionsPopover';
import { ShapeOptionsPopover } from './toolbar/popovers/ShapeOptionsPopover';
import { SwatchManagerModal } from './modals/SwatchManagerModal';
import { PencilCaseDrawer } from './toolbar/popovers/PencilCaseDrawer';
import { PencilCaseBar } from './toolbar/popovers/PencilCaseBar';
import { FloatingDragController } from './toolbar/FloatingDragController';

const PATTERN_SVGS: Record<StrokePattern, string> = {
    solid: '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><line x1="4" y1="12" x2="20" y2="12" stroke-linecap="round"/></svg>',
    dashed: '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><line x1="4" y1="12" x2="20" y2="12" stroke-dasharray="4,4" stroke-linecap="round"/></svg>',
    dotted: '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><line x1="4" y1="12" x2="20" y2="12" stroke-dasharray="1,4" stroke-linecap="round"/></svg>'
};

const DEFAULT_PALETTES = {
    pen: [{ id: 'classic', name: 'Classic', colors: ['#000000', '#ff0000', '#0000ff', '#00ff00'] }],
    highlighter: [{ id: 'classic', name: 'Classic', colors: ['#ffff0080', '#00ff0080', '#ff00ff80', '#00ffff80'] }],
    shape: [{ id: 'classic', name: 'Classic', colors: ['#000000', '#ff0000', '#0000ff', '#00ff00'] }]
};

export class Toolbar {
    public stylePanelEl!: HTMLElement;
    public patternToggleBtn!: HTMLButtonElement;
    public highlighterOptionsPopover!: HighlighterOptionsPopover;
    public colorPickerPopover!: ColorPickerPopover;
    public palettePopover!: SwatchManagerPopover;
    public paletteManagementPopover!: SwatchManagerPopover;
    public patternPopover!: PatternPopover;
    public eraserPopover!: EraserOptionsPopover;
    public penOptionsPopover!: PenOptionsPopover;
    public shapeOptionsPopover!: ShapeOptionsPopover;
    public pencilCaseToggleBtn!: HTMLButtonElement;
    public pencilCaseDrawer!: PencilCaseDrawer;
    public pencilCaseBar!: PencilCaseBar;
    public dragController!: FloatingDragController;
    public activePickerSlotIdx: number | null = null;
    public settingsSaveTimeout: ReturnType<typeof setTimeout> | null = null;
    public swatchManagerModal: any = null;
    public presetSwatchesEl!: HTMLElement;
    public savedSwatchesEl!: HTMLElement;
    public hexInput!: HTMLInputElement;
    public recentColorsEl!: HTMLElement;
    public thicknessSlider!: HTMLInputElement;
    public patternRowEl!: HTMLElement;
    public patternButtons: Map<StrokePattern, HTMLButtonElement> = new Map();
    public fillColorRowEl!: HTMLElement;
    public fillNoneBtn!: HTMLButtonElement;
    public fillSolidBtn!: HTMLButtonElement;
    private toolPillComponent!: ToolPillComponent;
    private colorStackComponent!: ColorStackComponent;
    private cleanups: (() => void)[] = [];
    private sidebarCleanups: (() => void)[] = [];
    private intentionallyOpenedPanelEl: HTMLElement | null = null;
    private lastActiveToolName: string | null = null;
    private outsideDismissHandler: ((event: PointerEvent) => void) | null = null;
    private sidebarStateFrame: number | null = null;
    private fillColors = ['#1a1a1a', '#1e3a5f', '#7c1d1d', '#1a3d2b', '#4a4a4a'];
    private selectedFillColor = '#1a1a1a';

    constructor(
        private toolbarEl: HTMLElement,
        public focusedEngineRef: FocusedEngineRef,
        public plugin?: any
    ) {
        this.buildUI();
        this.focusedEngineRef.onChange((engine) => {
            this.teardownListeners();
            this.setupListeners(engine);
            this.updateVisibilityMode();
            this.updateSidebarOverlayState();
            this.updatePencilCaseMount(engine);
            this.syncToolState();
        });
        this.setupListeners(this.focusedEngineRef.get());
        this.installOutsideDismiss();
        this.installWorkspaceListeners();
        this.updateVisibilityMode();
        this.updateSidebarOverlayState();
        this.updatePencilCaseMount(this.focusedEngineRef.get());
        this.syncToolState();

        const app = this.plugin?.app || (globalThis as any).app;
        if (app && this.plugin && typeof this.plugin.registerEvent === 'function' && typeof app.workspace?.on === 'function') {
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
    get palettePopoverEl(): HTMLElement { return this.palettePopover.el; }
    get paletteManagementPopoverEl(): HTMLElement { return this.paletteManagementPopover.el; }
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
        this.stylePanelEl = rootContainer.createDiv({ cls: 'ink-style-panel is-hidden' });
        // ContextPanelController removed — pen and highlighter now have fully isolated popovers.
        this.buildCompatibilityNodes();
        // Popovers live outside leaves and the draggable toolbar.  The toolbar is
        // passed separately as their click-away boundary and positioning reference.
        // Use the document overlay rather than a workspace split: splits can clip
        // absolutely-positioned children or participate in a flex layout, which is
        // what produced the full-height/sidebar-looking option panel.
        const popoverContainer = this.getPopoverContainer(rootContainer);
        this.colorPickerPopover = new ColorPickerPopover(popoverContainer, this.plugin, this, this.toolbarEl);
        this.palettePopover = new SwatchManagerPopover(popoverContainer, this.plugin, this, this.toolbarEl);
        this.paletteManagementPopover = this.palettePopover;
        this.patternPopover = new PatternPopover(popoverContainer, this.plugin, this, this.toolbarEl);
        this.eraserPopover = new EraserOptionsPopover(popoverContainer, this.plugin, () => this.toolButtons.get('eraser'), this.toolbarEl);
        this.penOptionsPopover = new PenOptionsPopover(popoverContainer, this.plugin, this, this.toolbarEl);
        this.highlighterOptionsPopover = new HighlighterOptionsPopover(popoverContainer, this.plugin, this, this.toolbarEl);
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

    private buildCompatibilityNodes(): void {
        const dummy = this.toolbarEl.createDiv({ cls: 'ink-dummy-container', attr: { style: 'display: none !important;' } });
        this.presetSwatchesEl = dummy.createDiv({ cls: 'ink-style-row swatches-presets' });
        this.savedSwatchesEl = dummy.createDiv({ cls: 'ink-style-row swatches-saved' });
        this.recentColorsEl = dummy.createDiv({ cls: 'ink-style-row swatches-recent' });
        this.hexInput = dummy.createEl('input', { cls: 'ink-hex-input', attr: { type: 'text', placeholder: '#' } }) as HTMLInputElement;
        this.hexInput.addEventListener('input', () => this.commitHexInput());
        this.thicknessSlider = dummy.createEl('input', { cls: 'ink-thickness-slider', attr: { type: 'range', min: '1', max: '20', step: '1' } }) as HTMLInputElement;
        this.thicknessSlider.addEventListener('input', (e) => this.withEngine((engine) => {
            const slider = (e?.target as HTMLInputElement) || this.thicknessSlider;
            const val = Number(slider?.value ?? 4);
            engine.setToolSize(engine.getToolName(), val);
            (engine as any).activeProfileId = '';
        }));
        this.patternRowEl = dummy.createDiv({ cls: 'ink-style-row pattern-row' });
        (Object.keys(PATTERN_SVGS) as StrokePattern[]).forEach((id) => {
            const btn = this.patternRowEl.createEl('button', { cls: 'ink-tool-btn pattern-btn', attr: { title: id, 'data-pattern': id } }) as HTMLButtonElement;
            btn.innerHTML = PATTERN_SVGS[id];
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.withEngine((engine) => {
                    engine.currentPattern = id;
                    (engine as any).activeProfileId = '';
                    engine.requestFullRender();
                });
            });
            this.patternButtons.set(id, btn);
        });
        dummy.createDiv({ cls: 'ink-popover-separator' });
        dummy.createEl('div', { cls: 'ink-style-header', text: 'FILL' });
        const fillTypeRow = dummy.createDiv({ cls: 'ink-style-row fill-type-row' });
        this.fillNoneBtn = fillTypeRow.createEl('button', { cls: 'ink-fill-type-btn', text: 'None' }) as HTMLButtonElement;
        this.fillSolidBtn = fillTypeRow.createEl('button', { cls: 'ink-fill-type-btn', text: 'Solid' }) as HTMLButtonElement;
        this.fillNoneBtn.addEventListener('click', () => this.withEngine((engine) => { engine.currentFillColor = 'transparent'; engine.requestFullRender(); }));
        this.fillSolidBtn.addEventListener('click', () => this.withEngine((engine) => { engine.currentFillColor = this.selectedFillColor; engine.requestFullRender(); }));
        this.fillColorRowEl = dummy.createDiv({ cls: 'ink-style-row swatches-fill' });
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
                this.penOptionsPopover.showPenOptions(btn, engine);
                this.intentionallyOpenedPanelEl = this.penOptionsPopover.el;
            }
        } else if (toolId === 'highlighter') {
            if (this.highlighterOptionsPopover.isOpen) {
                this.highlighterOptionsPopover.hide();
                this.intentionallyOpenedPanelEl = null;
            } else {
                this.closeAllMenus();
                this.highlighterOptionsPopover.showHighlighterOptions(btn, engine);
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

    updateVisibilityMode(): void {
        const app = this.plugin?.app || (globalThis as any).app;
        if (!app) return;
        const activeView = app.workspace.getActiveViewOfType?.(MarkdownView);
        const isCanvasView = app.workspace.activeLeaf?.view?.getViewType?.() === 'ink-full-view';
        const isReadingMode = activeView?.getMode?.() === 'preview';
        this.toggleClass(this.toolbarEl, 'is-hidden', (!activeView && !isCanvasView) || isReadingMode);
        this.toggleClass(this.toolbarEl, 'is-idle', !isReadingMode && !!(activeView || isCanvasView) && this.focusedEngineRef.get() === null);
    }

    public updateSidebarOverlayState(): void {
        const app = this.plugin?.app || (globalThis as any).app;
        if (!app || !app.isMobile) {
            this.toolbarEl.classList.remove('ink-sidebar-overlay-open');
            this.clearSidebarOffset();
            return;
        }
        
        const leftSplit = app.workspace?.leftSplit;
        const rootSplit = app.workspace?.rootSplit;
        
        if (!leftSplit || leftSplit.collapsed) {
            this.toolbarEl.classList.remove('ink-sidebar-overlay-open');
            this.clearSidebarOffset();
            return;
        }
        
        const leftRect = leftSplit.containerEl?.getBoundingClientRect?.();
        const rootRect = rootSplit?.containerEl?.getBoundingClientRect();
        const hasVisibleSidebar = !!leftRect && leftRect.width > 50 && leftRect.right > 50;
        const overlapsRoot = !!leftRect && !!rootRect && leftRect.right > rootRect.left + 24;
        const isPinned = !!rootRect && rootRect.left > 50 && !overlapsRoot;
        const isOverlayOpen = hasVisibleSidebar && !isPinned;
        
        this.toolbarEl.classList.toggle('ink-sidebar-overlay-open', !!isOverlayOpen);
        this.clearSidebarOffset();
    }

    private clearSidebarOffset(): void {
        if (typeof this.toolbarEl.style?.removeProperty === 'function') {
            this.toolbarEl.style.removeProperty('--ink-sidebar-offset');
        } else if (this.toolbarEl.style) {
            (this.toolbarEl.style as any)['--ink-sidebar-offset'] = '';
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
        const activeView = this.plugin?.app?.workspace?.getActiveViewOfType?.(MarkdownView);
        const isReadingMode = activeView && typeof activeView.getMode === 'function' && activeView.getMode() === 'preview';

        // A focus change briefly sets the engine to null while Obsidian swaps
        // leaves.  That is an idle state, not a reason to hide the global toolbar.
        // Visibility is reserved for an unsupported view or explicit Reading mode.
        if (isReadingMode || (!activeView && !this.isInkFullView())) {
            this.toolButtons.forEach((btn) => this.removeClass(btn, 'is-active'));
            this.toolPillComponent.setSnapDisabled(true);
            this.toolPillComponent.setHistoryState(false, false);
            this.addClass(this.stylePanelEl, 'is-hidden');
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
        const history = (engine as any).history || ((engine as any).getHistoryManager?.());
        this.toolPillComponent.setHistoryState(history ? history.canUndo() : engine.canUndo(), history ? history.canRedo() : engine.canRedo());
        if (tool !== this.lastActiveToolName) this.restoreToolColor(engine, tool);
        this.lastActiveToolName = tool;
        const inactiveStyle = tool === 'lasso' || tool === 'eraser';
        this.toggleClass(this.colorSlotsStackEl, 'is-disabled', inactiveStyle);
        this.colorSlotsStackEl.style.opacity = inactiveStyle ? '0.4' : '1.0';
        this.colorSlotsStackEl.style.pointerEvents = inactiveStyle ? 'none' : 'all';
        this.patternToggleBtn.style.opacity = tool === 'pen' || tool === 'shape' ? '1.0' : '0.4';
        this.patternToggleBtn.style.pointerEvents = tool === 'pen' || tool === 'shape' ? 'all' : 'none';
        const activePopover = tool === 'pen' ? this.penOptionsPopover?.el : tool === 'highlighter' ? this.highlighterOptionsPopover?.el : tool === 'shape' ? this.shapeOptionsPopover?.el : null;
        const isPopoverHidden = !activePopover || (typeof (activePopover as any).hasClass === 'function' ? (activePopover as any).hasClass('is-hidden') : (activePopover.classList?.contains?.('is-hidden') ?? true));
        const isPanelOpened = !inactiveStyle && !isPopoverHidden;
        this.addClass(this.stylePanelEl, 'is-hidden');
        if (isPanelOpened) {
            this.syncActivePanels(engine, tool);
        }
        this.renderCompatibility(engine);
        this.renderColorSlots(engine);
        this.pencilCaseBar?.syncValues();
        this.pencilCaseBar?.updateVisibility(true);
    }

    private syncActivePanels(_engine: InkEngine, _tool: string): void {
        // No-op: pen and highlighter popovers sync their own state
        // when opened via showPenOptions / showHighlighterOptions.
    }

    private handleStyleChange(styles: any): void {
        this.withEngine((engine) => {
            if (styles.profileId !== undefined) {
                (engine as any).activeProfileId = styles.profileId;
                const profile = PenProfileRegistry.get(styles.profileId);
                if (profile) {
                    engine.setToolSize(engine.getToolName(), profile.baseWidth);
                    if (engine.getToolName() === 'pen') {
                        engine.setPenSmoothing?.(profile.baseSmoothing);
                    } else if (engine.getToolName() === 'highlighter') {
                        engine.setHighlighterSmoothing?.(profile.baseSmoothing);
                    }
                    engine.currentPattern = profile.pattern || 'solid';
                }
            } else {
                if (styles.thickness !== undefined) {
                    engine.setToolSize(engine.getToolName(), styles.thickness);
                    (engine as any).activeProfileId = '';
                }
                if (styles.smoothing !== undefined) {
                    if (engine.getToolName() === 'pen') {
                        engine.setPenSmoothing?.(styles.smoothing);
                    } else if (engine.getToolName() === 'highlighter') {
                        engine.setHighlighterSmoothing?.(styles.smoothing);
                    }
                    (engine as any).activeProfileId = '';
                }
            }
            if (styles.color !== undefined) engine.setPenColor(styles.color);
            if (styles.shapeId !== undefined) (engine.getTool('shape') as any)?.setActiveShape?.(styles.shapeId);
            if (styles.fillEnabled !== undefined) engine.currentFillColor = styles.fillEnabled ? this.selectedFillColor : 'transparent';
            if (styles.fillColor !== undefined) { this.selectedFillColor = styles.fillColor; engine.currentFillColor = styles.fillColor; }
            engine.requestFullRender();
        });
    }

    public closeAllMenus(except?: HTMLElement): void {
        if (this.eraserPopoverEl !== except) this.eraserPopover.hide();
        if (this.colorPickerPopoverEl !== except) this.colorPickerPopover.hide();
        if (this.paletteManagementPopoverEl !== except) this.palettePopover.hide();
        if (this.patternPopoverEl !== except) this.patternPopover.hide();
        if (this.penOptionsPopover?.el !== except) this.penOptionsPopover?.hide();
        if (this.highlighterOptionsPopover?.el !== except) this.highlighterOptionsPopover?.hide();
        if (this.shapeOptionsPopover?.el !== except) this.shapeOptionsPopover?.hide();
        if (this.pencilCaseDrawer && this.pencilCaseDrawer.el !== except) this.pencilCaseDrawer.hide();
        this.addClass(this.stylePanelEl, 'is-hidden');
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
    public flushSettingsSave(): void { if (this.settingsSaveTimeout) clearTimeout(this.settingsSaveTimeout); this.settingsSaveTimeout = null; this.plugin?.saveSettings?.(); }

    destroy(): void {
        this.teardownListeners();
        this.sidebarCleanups.forEach((cleanup) => cleanup());
        this.sidebarCleanups = [];
        this.closeAllMenus();
        if (this.outsideDismissHandler && typeof document !== 'undefined') document.removeEventListener('pointerdown', this.outsideDismissHandler);
        this.outsideDismissHandler = null;

        [
            this.colorPickerPopover,
            this.palettePopover,
            this.patternPopover,
            this.eraserPopover,
            this.penOptionsPopover,
            this.highlighterOptionsPopover,
            this.shapeOptionsPopover
        ].forEach((popover) => popover?.destroy());

        this.stylePanelEl?.remove();
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
        const settings = this.plugin?.settings ?? {};
        if (isHighlighter) { settings.activeHighlighterColorIndex = slotIndex; settings.lastHighlighterColorHex = color; }
        else { settings.activePenColorIndex = slotIndex; settings.lastPenColorHex = color; }
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
        const app = this.plugin?.app || (globalThis as any).app;
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
        const settings = this.plugin?.settings ?? {};
        let type: 'pen' | 'highlighter' | 'shape' = 'pen';
        if (toolType === true || toolType === 'highlighter') type = 'highlighter';
        else if (toolType === 'shape') type = 'shape';

        let palettes, activePaletteId, activeIndex;
        if (type === 'highlighter') {
            palettes = settings.highlighterPalettes ?? DEFAULT_PALETTES.highlighter;
            if (!palettes || palettes.length === 0) palettes = DEFAULT_PALETTES.highlighter;
            activePaletteId = settings.activeHighlighterPaletteId ?? 'classic';
            activeIndex = settings.activeHighlighterColorIndex ?? 0;
        } else if (type === 'shape') {
            palettes = settings.shapePalettes ?? DEFAULT_PALETTES.shape;
            if (!palettes || palettes.length === 0) palettes = DEFAULT_PALETTES.shape;
            activePaletteId = settings.activeShapePaletteId ?? 'classic';
            activeIndex = settings.activeShapeColorIndex ?? 0;
        } else {
            palettes = settings.penPalettes ?? DEFAULT_PALETTES.pen;
            if (!palettes || palettes.length === 0) palettes = DEFAULT_PALETTES.pen;
            activePaletteId = settings.activePenPaletteId ?? 'classic';
            activeIndex = settings.activePenColorIndex ?? 0;
        }
        const palette = palettes.find((p: any) => p && p.id === activePaletteId) ?? palettes[0] ?? DEFAULT_PALETTES.pen[0];
        const colors = palette?.colors ?? ['#000000', '#ff0000', '#0000ff', '#00ff00'];
        return { palettes, activePaletteId, activeIndex, palette: { ...palette, colors } };
    }

    private renderColorSlots(engine: InkEngine): void {
        const tool = engine.getToolName();
        const type = tool === 'highlighter' ? 'highlighter' : (tool === 'shape' ? 'shape' : 'pen');
        const { palette, activeIndex } = this.getPaletteData(type);
        this.colorStackComponent.syncColorSlots(palette.colors, activeIndex, tool);
    }

    private renderCompatibility(engine: InkEngine): void {
        const color = this.currentColor(engine);
        this.hexInput.value = color;
        this.removeClass(this.hexInput, 'is-invalid');
        this.thicknessSlider.value = String(engine.getToolSize(engine.getToolName()) ?? 0);
        const activePattern = engine.currentPattern ?? 'solid';
        this.patternToggleBtn.innerHTML = PATTERN_SVGS[activePattern] ?? PATTERN_SVGS.solid;
        this.patternButtons.forEach((btn, id) => this.toggleClass(btn, 'is-active', id === activePattern));
        this.renderSavedSwatches(engine);
        this.renderRecentColors(engine);
        this.syncColorHighlights(color);
    }

    private renderSavedSwatches(engine: InkEngine): void {
        this.savedSwatchesEl.empty();
        const saved = this.plugin?.settings?.savedSwatches ?? ['', '', '', '', ''];
        saved.forEach((color: string, idx: number) => {
            const swatch = this.savedSwatchesEl.createDiv({ cls: 'ink-style-swatch saved-swatch' });
            if (color) swatch.style.backgroundColor = color;
            else { swatch.style.backgroundColor = 'transparent'; swatch.textContent = '+'; this.addClass(swatch, 'is-empty'); }
            let pressTimeout: ReturnType<typeof setTimeout> | null = null;
            let isLongPress = false;
            swatch.addEventListener('pointerdown', () => {
                isLongPress = false;
                pressTimeout = setTimeout(() => {
                    isLongPress = true;
                    const activeColor = this.currentColor(engine);
                    if (this.plugin?.settings?.savedSwatches) {
                        this.plugin.settings.savedSwatches[idx] = activeColor;
                        const savedPromise = this.plugin.saveSettings?.();
                        if (savedPromise?.then) savedPromise.then(() => this.renderSavedSwatches(engine));
                        else this.renderSavedSwatches(engine);
                    }
                }, 500);
            });
            const release = () => {
                if (pressTimeout) clearTimeout(pressTimeout);
                pressTimeout = null;
                if (!isLongPress && color) {
                    engine.setPenColor(color);
                    engine.requestFullRender();
                    this.syncToolState();
                }
            };
            swatch.addEventListener('pointerup', release);
            swatch.addEventListener('pointerleave', () => { if (pressTimeout) clearTimeout(pressTimeout); pressTimeout = null; });
            swatch.addEventListener('pointercancel', () => { if (pressTimeout) clearTimeout(pressTimeout); pressTimeout = null; });
        });
    }

    private renderRecentColors(engine: InkEngine): void {
        this.recentColorsEl.empty();
        (this.plugin?.settings?.recentColors ?? []).forEach((color: string) => {
            const swatch = this.recentColorsEl.createDiv({ cls: 'ink-style-swatch recent-swatch' });
            swatch.style.backgroundColor = color;
            swatch.addEventListener('click', () => {
                engine.setPenColor(color);
                engine.requestFullRender();
                this.syncToolState();
            });
        });
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

    private commitHexInput(): void {
        const val = this.hexInput.value.trim();
        const valid = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(val);
        if (val && !valid) {
            this.addClass(this.hexInput, 'is-invalid');
            return;
        }
        this.removeClass(this.hexInput, 'is-invalid');
        if (!val) return;
        const formatted = val.startsWith('#') ? val : `#${val}`;
        this.withEngine((engine) => {
            engine.setPenColor(formatted);
            engine.requestFullRender();
            this.syncColorHighlights(formatted);
        });
    }

    private syncColorHighlights(color: string): void {
        const lower = color.toLowerCase();
        [this.presetSwatchesEl, this.savedSwatchesEl, this.recentColorsEl].forEach((row) => {
            row.querySelectorAll?.('.ink-style-swatch').forEach((element) => {
                const swatch = element as HTMLElement;
                this.toggleClass(swatch, 'is-active', isColorMatch(swatch.style.backgroundColor, lower));
            });
        });
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
        return (engine as any).toolContext?.currentColor ?? '#1a1a1a';
    }

    public updateSmartPopoverPosition(popoverEl: HTMLElement, anchorBtn?: HTMLElement): void {
        if (!popoverEl) return;
        const isHidden = typeof (popoverEl as any).hasClass === 'function'
            ? (popoverEl as any).hasClass('is-hidden')
            : popoverEl.classList?.contains?.('is-hidden');
        if (isHidden) return;

        // The panel is created in the workspace overlay.  Reparenting it to an
        // active view here made it disappear when that view was replaced.
        const viewContainer = this.getOverlayContainer();
        if (!viewContainer) return;

        const parentRect = viewContainer.getBoundingClientRect();
        const toolbarRect = this.toolbarEl.getBoundingClientRect();

        popoverEl.style.position = 'absolute';
        popoverEl.style.zIndex = 'calc(var(--layer-popover) + 20)';

        const isVert = this.toolbarEl.classList.contains('is-vertical-orientation');
        let popoverRect = popoverEl.getBoundingClientRect();

        const panelWidth = popoverRect.width > 50 ? popoverRect.width : 190;
        const panelHeight = popoverRect.height > 50 ? popoverRect.height : 220;

        let targetLeft = 0;
        let targetTop = 0;

        const toolbarMidX = (toolbarRect.left + toolbarRect.right) / 2;
        const parentMidX = (parentRect.left + parentRect.right) / 2;
        const isLeftHalf = toolbarMidX < parentMidX;

        const toolbarMidY = (toolbarRect.top + toolbarRect.bottom) / 2;
        const parentMidY = (parentRect.top + parentRect.bottom) / 2;
        const isTopHalf = toolbarMidY < parentMidY;

        const anchorRect = anchorBtn ? anchorBtn.getBoundingClientRect() : toolbarRect;

        if (isVert) {
            if (isLeftHalf) {
                targetLeft = toolbarRect.right - parentRect.left + 12;
            } else {
                targetLeft = toolbarRect.left - parentRect.left - panelWidth - 12;
            }

            // Align popover top with clicked tool button top
            targetTop = anchorRect.top - parentRect.top;
        } else {
            if (isTopHalf) {
                targetTop = toolbarRect.bottom - parentRect.top + 12;
            } else {
                targetTop = toolbarRect.top - parentRect.top - panelHeight - 12;
            }

            // Center popover horizontally relative to clicked tool button
            const anchorCenterX = anchorRect.left - parentRect.left + anchorRect.width / 2;
            targetLeft = anchorCenterX - panelWidth / 2;
        }

        const minLeft = 12;
        const maxLeft = Math.max(minLeft, parentRect.width - panelWidth - 12);
        const minTop = 12;
        const maxTop = Math.max(minTop, parentRect.height - panelHeight - 12);

        targetLeft = Math.max(minLeft, Math.min(maxLeft, targetLeft));
        targetTop = Math.max(minTop, Math.min(maxTop, targetTop));

        popoverEl.style.left = `${targetLeft}px`;
        popoverEl.style.top = `${targetTop}px`;
    }

    private repositionOpenPopovers(): void {
        this.colorPickerPopover?.reposition();
        this.palettePopover?.reposition();
        this.patternPopover?.reposition();
        this.eraserPopover?.reposition();
        this.penOptionsPopover?.reposition();
        this.highlighterOptionsPopover?.reposition();
        this.shapeOptionsPopover?.reposition();
    }

    private getOverlayContainer(): HTMLElement {
        return (this.plugin?.app?.workspace?.rootSplit as any)?.containerEl
            ?? this.toolbarEl.parentElement
            ?? this.toolbarEl;
    }

    private getPopoverContainer(fallback: HTMLElement): HTMLElement {
        return this.toolbarEl.ownerDocument?.body
            ?? (typeof document !== 'undefined' ? document.body : null)
            ?? fallback;
    }

    private isInkFullView(): boolean {
        return this.plugin?.app?.workspace?.activeLeaf?.view?.getViewType?.() === 'ink-full-view';
    }

    private installOutsideDismiss(): void {
        if (typeof document === 'undefined') return;
        this.outsideDismissHandler = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (target && this.isToolbarInteractionTarget(target)) return;
            this.resetColorSlotClickCycle();
            this.closeAllMenus();
        };
        document.addEventListener('pointerdown', this.outsideDismissHandler);
    }

    private isToolbarInteractionTarget(target: Node): boolean {
        return [
            this.toolbarEl,
            this.stylePanelEl,
            this.colorPickerPopover?.el,
            this.palettePopover?.el,
            this.patternPopover?.el,
            this.eraserPopover?.el,
            this.penOptionsPopover?.el,
            this.highlighterOptionsPopover?.el,
            this.shapeOptionsPopover?.el,
            this.pencilCaseBar?.containerEl,
            this.pencilCaseDrawer?.el
        ].some((element) => !!element?.contains(target));
    }

    private installWorkspaceListeners(): void {
        const workspace = this.plugin?.app?.workspace;
        if (!workspace || typeof workspace.on !== 'function') return;

        const sync = () => {
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

    private addClass(el: HTMLElement, cls: string): void {
        if (typeof el.addClass === 'function') el.addClass(cls);
        else el.classList.add(cls);
    }

    private removeClass(el: HTMLElement, cls: string): void {
        if (typeof el.removeClass === 'function') el.removeClass(cls);
        else el.classList.remove(cls);
    }

    private toggleClass(el: HTMLElement, cls: string, enabled: boolean): void {
        enabled ? this.addClass(el, cls) : this.removeClass(el, cls);
    }
}
