import { ShapeDefinition } from '../ShapeDefinition';
import { applyPatternToCtx } from './_shapeUtils';
import { BoundingBox } from '../../model/BoundingBox';

export const LineShape: ShapeDefinition = {
  id:             'line',
  name:           'Line',
  icon:           'minus',
  requiredPoints: 2,

  render(ctx, points, style, isPreview) {
    if (points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = style.strokeColor;
    ctx.lineWidth   = style.strokeWidth;
    ctx.lineCap     = 'round';
    ctx.globalAlpha = isPreview ? 0.5 : style.opacity;
    applyPatternToCtx(ctx, style);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.stroke();
    ctx.restore();
  },

  getBoundingBox(points) {
    const pad  = 4;
    const minX = Math.min(points[0].x, points[1].x) - pad;
    const minY = Math.min(points[0].y, points[1].y) - pad;
    const maxX = Math.max(points[0].x, points[1].x) + pad;
    const maxY = Math.max(points[0].y, points[1].y) + pad;
    return new BoundingBox(minX, minY, maxX - minX, maxY - minY);
  },

  hitTest(points, style, pt, tolerance) {
    if (points.length < 2) return false;
    const [a, b] = points;
    const ab  = { x: b.x - a.x, y: b.y - a.y };
    const ap  = { x: pt.x - a.x, y: pt.y - a.y };
    const len2 = ab.x*ab.x + ab.y*ab.y + 0.0001;
    const t    = Math.max(0, Math.min(1, (ap.x*ab.x + ap.y*ab.y) / len2));
    const cx   = a.x + t*ab.x;
    const cy   = a.y + t*ab.y;
    return Math.hypot(pt.x - cx, pt.y - cy) <= tolerance + style.strokeWidth / 2;
  },

  getHandles: (points) => [
    { id: 'start', position: points[0] },
    { id: 'end',   position: points[1] },
  ],

  applyHandleDrag(points, handleId, newPosition) {
    const updated = [...points];
    if (handleId === 'start') updated[0] = newPosition;
    if (handleId === 'end')   updated[1] = newPosition;
    return updated;
  },
};
