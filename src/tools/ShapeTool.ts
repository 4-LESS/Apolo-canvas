import { Tool, ToolContext } from './Tool';
import { Vec2, clientToPageCoords, snapPointToGrid } from '../utils/geometry';
import { ShapeRegistry } from '../shapes/ShapeRegistry';
import { ShapeElement } from '../model/ShapeElement';
import { InkPage } from '../model/InkPage';
import { HistoryManager, AddElementsCommand } from '../engine/HistoryManager';
import { Renderer } from '../engine/Renderer';
import { ElementStyle } from '../model/ElementStyle';
import { generateBlockId } from '../utils/id';

export class ShapeTool implements Tool {
  name   = 'Shape';
  cursor = 'crosshair';

  private activeShapeId  = 'line';
  private previewPoints: Vec2[] = [];
  private isDrawing      = false;

  constructor(
    private page:    InkPage,
    private history: HistoryManager,
    private renderer: Renderer,
  ) {}

  setActiveShape(id: string): void {
    if (id && ShapeRegistry.get(id)) {
      this.activeShapeId = id;
    } else {
      this.activeShapeId = 'line';
    }
  }

  getActiveShapeId(): string {
    if (!this.activeShapeId || !ShapeRegistry.get(this.activeShapeId)) {
      this.activeShapeId = 'line';
    }
    return this.activeShapeId;
  }

  onActivate(ctx: ToolContext): void {
    if (!this.activeShapeId || !ShapeRegistry.get(this.activeShapeId)) {
      this.activeShapeId = 'line';
    }
  }

  onPointerDown(e: PointerEvent, ctx: ToolContext): void {
    const pt = this.resolvePoint(e, ctx);
    this.isDrawing     = true;
    this.previewPoints = [pt, { ...pt }];
    ctx.requestRender();
  }

  onPointerMove(e: PointerEvent, ctx: ToolContext): void {
    if (!this.isDrawing) return;
    const pt = this.resolvePoint(e, ctx);
    const activeId = this.getActiveShapeId();
    if (ctx.shiftHeld) {
      if (activeId === 'line' || activeId === 'arrow') {
        this.previewPoints[1] = this.constrainAngle(this.previewPoints[0], pt);
      } else {
        this.previewPoints[1] = this.constrainAspectRatio(this.previewPoints[0], pt);
      }
    } else {
      this.previewPoints[1] = pt;
    }
    this.renderer.setShapePreview(activeId, this.previewPoints, this.currentStyle(ctx));
    ctx.requestRender();
  }

  onPointerUp(e: PointerEvent, ctx: ToolContext): void {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    const len = Math.hypot(
      this.previewPoints[1].x - this.previewPoints[0].x,
      this.previewPoints[1].y - this.previewPoints[0].y
    );

    if (len < 8) { this.renderer.clearShapePreview(); ctx.requestRender(); return; }

    const activeId = this.getActiveShapeId();
    const def     = ShapeRegistry.get(activeId);
    if (!def) {
      this.renderer.clearShapePreview();
      ctx.requestRender();
      return;
    }
    const points  = [...this.previewPoints];
    const style   = this.currentStyle(ctx);
    const element = new ShapeElement(
      generateBlockId(),
      activeId,
      points,
      style
    );

    this.page.addElement(element);
    this.history.push(new AddElementsCommand(this.page, [element]));
    this.renderer.clearShapePreview();
    ctx.requestFullRender();
    ctx.requestSave();
  }

  onPointerCancel(e: PointerEvent, ctx: ToolContext): void {
    this.isDrawing     = false;
    this.previewPoints = [];
    this.renderer.clearShapePreview();
    ctx.requestRender();
  }

  private resolvePoint(e: PointerEvent, ctx: ToolContext): Vec2 {
    const dims = ctx.viewport.getPageDimensions();
    const raw  = clientToPageCoords(e, ctx.canvas, dims.width, dims.height, ctx.viewport);
    return ctx.page.snapToGrid ? snapPointToGrid(raw, ctx.page.gridSize, ctx.viewport.getZoom()) : raw;
  }

  private constrainAngle(origin: Vec2, pt: Vec2): Vec2 {
    const angle   = Math.atan2(pt.y - origin.y, pt.x - origin.x);
    const dist    = Math.hypot(pt.x - origin.x, pt.y - origin.y);
    const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    return { x: origin.x + dist * Math.cos(snapped), y: origin.y + dist * Math.sin(snapped) };
  }

  private constrainAspectRatio(origin: Vec2, pt: Vec2): Vec2 {
    const dx = pt.x - origin.x;
    const dy = pt.y - origin.y;
    const maxDelta = Math.max(Math.abs(dx), Math.abs(dy));
    const signX = dx >= 0 ? 1 : -1;
    const signY = dy >= 0 ? 1 : -1;
    return {
      x: origin.x + signX * maxDelta,
      y: origin.y + signY * maxDelta,
    };
  }

  private currentStyle(ctx: ToolContext): ElementStyle {
    return {
      strokeColor:   ctx.currentColor,
      strokeWidth:   ctx.currentSize,
      strokePattern: ctx.currentPattern ?? 'solid',
      opacity:       1.0,
      fillColor:     ctx.currentFillColor,
    };
  }
}
