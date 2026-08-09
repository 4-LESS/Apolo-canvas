import { ShapeDefinition } from '../ShapeDefinition';
import { LineShape } from './LineShape';
import { applyPatternToCtx } from './_shapeUtils';

export const ArrowShape: ShapeDefinition = {
  ...LineShape,
  id:   'arrow',
  name: 'Arrow',
  icon: 'arrow-right',

  render(ctx, points, style, isPreview) {
    if (points.length < 2) return;
    const [a, b] = points;

    ctx.save();
    ctx.strokeStyle = style.strokeColor;
    ctx.fillStyle   = style.strokeColor;
    ctx.lineWidth   = style.strokeWidth;
    ctx.lineCap     = 'round';
    ctx.globalAlpha = isPreview ? 0.5 : style.opacity;
    applyPatternToCtx(ctx, style);    // dashed/dotted shaft

    // Shaft
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    // Arrowhead — always solid regardless of strokePattern
    ctx.setLineDash([]);
    const angle   = Math.atan2(b.y - a.y, b.x - a.x);
    const headLen = Math.max(12, style.strokeWidth * 4);
    const spread  = Math.PI / 6;

    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - headLen * Math.cos(angle - spread),
               b.y - headLen * Math.sin(angle - spread));
    ctx.lineTo(b.x - headLen * Math.cos(angle + spread),
               b.y - headLen * Math.sin(angle + spread));
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  },
};
