import { ShapeDefinition } from '../ShapeDefinition';
import { applyPatternToCtx, hitTestClosedPath } from './_shapeUtils';
import { BoundingBox } from '../../model/BoundingBox';

export const TriangleShape: ShapeDefinition = {
  id:             'triangle',
  name:           'Triangle',
  icon:           'triangle',
  requiredPoints: 2,

  render(ctx, points, style, isPreview) {
    if (points.length < 2) return;
    const minX = Math.min(points[0].x, points[1].x);
    const minY = Math.min(points[0].y, points[1].y);
    const maxX = Math.max(points[0].x, points[1].x);
    const maxY = Math.max(points[0].y, points[1].y);
    const width = maxX - minX;

    ctx.save();
    ctx.globalAlpha = isPreview ? 0.5 : style.opacity;

    ctx.beginPath();
    ctx.moveTo(minX + width / 2, minY);
    ctx.lineTo(maxX, maxY);
    ctx.lineTo(minX, maxY);
    ctx.closePath();

    if (style.fillColor && style.fillColor !== 'transparent' && style.fillColor !== '') {
      ctx.fillStyle = style.fillColor;
      ctx.fill();
    }

    ctx.strokeStyle = style.strokeColor;
    ctx.lineWidth   = style.strokeWidth;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    applyPatternToCtx(ctx, style);
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
    return hitTestClosedPath(
      (pathCtx) => {
        const minX = Math.min(points[0].x, points[1].x);
        const minY = Math.min(points[0].y, points[1].y);
        const maxX = Math.max(points[0].x, points[1].x);
        const maxY = Math.max(points[0].y, points[1].y);
        const width = maxX - minX;
        pathCtx.moveTo(minX + width / 2, minY);
        pathCtx.lineTo(maxX, maxY);
        pathCtx.lineTo(minX, maxY);
        pathCtx.closePath();
      },
      style,
      pt,
      tolerance,
      this.getBoundingBox(points)
    );
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
