import { Vec2 } from '../utils/geometry';
import { BoundingBox } from '../model/BoundingBox';
import { ElementStyle } from '../model/ElementStyle';

export interface ShapeHandle {
  id:       string;
  position: Vec2;
}

export interface ShapeDefinition {
  readonly id:             string;   // stable — never changes after first release
  readonly name:           string;
  readonly icon:           string;   // Lucide icon ID
  readonly requiredPoints: number;

  /**
   * Render the shape. Context is in page coordinate space.
   * ElementStyle is passed in full — the definition decides which fields to use.
   * isPreview: true while the user is still drawing; render at reduced opacity.
   */
  render(
    ctx:       CanvasRenderingContext2D,
    points:    Vec2[],
    style:     ElementStyle,
    isPreview: boolean
  ): void;

  getBoundingBox(points: Vec2[]): BoundingBox;

  hitTest(points: Vec2[], style: ElementStyle, pt: Vec2, tolerance: number): boolean;

  getHandles(points: Vec2[]): ShapeHandle[];

  applyHandleDrag(points: Vec2[], handleId: string, newPosition: Vec2): Vec2[];
}
