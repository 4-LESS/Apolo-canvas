import { ElementStyle } from '../../model/ElementStyle';
import { Vec2 } from '../../utils/geometry';
import { BoundingBox } from '../../model/BoundingBox';

export function applyPatternToCtx(ctx: CanvasRenderingContext2D, style: ElementStyle): void {
  const w = style.strokeWidth;
  ctx.setLineDash(
    style.strokePattern === 'dotted' ? [w, w * 2.5] :
    style.strokePattern === 'dashed' ? [w * 4, w * 2] :
    []
  );
}

let offscreenCtx: CanvasRenderingContext2D | null = null;
function getOffscreenContext(): CanvasRenderingContext2D | null {
  if (offscreenCtx) return offscreenCtx;
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    offscreenCtx = canvas.getContext('2d');
    return offscreenCtx;
  } catch (e) {
    return null;
  }
}

/**
 * Perform a Canvas 2D hit test (isPointInStroke and optionally isPointInPath) for a closed path.
 * If canvas context is unavailable (e.g. in test environments), falls back to bounding box check.
 */
export function hitTestClosedPath(
  pathBuilder: (ctx: CanvasRenderingContext2D) => void,
  style: ElementStyle,
  pt: Vec2,
  tolerance: number,
  boundingBox: BoundingBox
): boolean {
  const ctx = getOffscreenContext();
  if (!ctx) {
    // Fallback to bounding box containment expanded by strokeWidth/2 + tolerance
    const expandedBox = boundingBox.expand(tolerance + style.strokeWidth / 2);
    return expandedBox.contains(pt.x, pt.y);
  }

  ctx.save();
  ctx.beginPath();
  
  // Configure stroke properties
  ctx.lineWidth = style.strokeWidth + tolerance * 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Build path on context
  pathBuilder(ctx);

  const hitStroke = ctx.isPointInStroke(pt.x, pt.y);
  let hitFill = false;
  if (style.fillColor && style.fillColor !== 'transparent' && style.fillColor !== '') {
    hitFill = ctx.isPointInPath(pt.x, pt.y);
  }

  ctx.restore();
  return hitStroke || hitFill;
}

/**
 * Cross-platform path builder for rounded rectangles.
 */
export function buildRoundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
): void {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (r === 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}
