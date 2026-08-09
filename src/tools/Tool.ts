import { InkPage } from '../model/InkPage';
import { StrokeStyle } from '../model/Style';
import { ViewportManager } from '../engine/ViewportManager';
import { HistoryManager } from '../engine/HistoryManager';
import { SelectionManager } from '../engine/SelectionManager';
import { ClipboardManager } from '../engine/ClipboardManager';
import { StrokePattern } from '../model/ElementStyle';

/**
 * Context passed to tools so they can interact with the engine
 * without knowing its full implementation.
 */
export interface ToolContext {
    page: InkPage;
    viewport: ViewportManager;
    history: HistoryManager;
    selectionManager: SelectionManager;
    clipboardManager: ClipboardManager;
    penStyle: StrokeStyle;
    eraserSize: number;
    eraserMode: 'segment' | 'whole';
    currentEraserWidth: number;
    canvas: HTMLCanvasElement;
    currentColor: string;
    currentSize: number;
    currentPattern: StrokePattern;
    currentFillColor: string;
    shiftHeld: boolean;
    smoothingLevel: number;
    getToolSize(toolName: string): number;
    /** Trigger a visual refresh of the canvas. */
    requestRender(): void;
    /** Trigger a full re-render of all completed strokes. */
    requestFullRender(): void;
    /** Notify the engine that data has changed and should be saved. */
    requestSave(): void;
    /** Switch to another registered tool without exposing the full engine to tools. */
    requestToolSwitch(toolName: string): void;
    /** Optional: register a color used in drawing as a recent color */
    addRecentColor?(color: string): void;
    /** Active profile ID */
    activeProfileId?: string;
    /** User settings */
    settings: any;
}

/**
 * Interface that every drawing tool must implement.
 */
export interface Tool {
    /** Display name of the tool. */
    name: string;
    /** CSS cursor value when this tool is active. */
    cursor: string;

    /** Called when the pointer goes down on the canvas. */
    onPointerDown(e: PointerEvent, ctx: ToolContext): void | boolean;
    /** Called on every pointer move while the pointer is down. */
    onPointerMove(e: PointerEvent, ctx: ToolContext): void;
    /** Called when the pointer is released. */
    onPointerUp(e: PointerEvent, ctx: ToolContext): void;
    /** Called when the pointer action is cancelled (e.g. system interrupt). */
    onPointerCancel?(e: PointerEvent, ctx: ToolContext): void;
    onPointerLeave?(e: PointerEvent, ctx: ToolContext): void;

    /** Called when this tool becomes the active tool. */
    onActivate?(ctx: ToolContext): void;
    /** Called when this tool is replaced by another tool. */
    onDeactivate?(ctx: ToolContext): void;

    /**
     * Optional: render tool-specific overlay on the active canvas
     * (e.g. active stroke being drawn, eraser cursor).
     */
    renderOverlay?(ctx: CanvasRenderingContext2D, toolCtx: ToolContext): void;
}
