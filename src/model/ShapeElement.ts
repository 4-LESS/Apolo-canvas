import { InkElement, ElementData } from './InkElement';
import { ElementStyle } from './ElementStyle';
import { Vec2, rotatePoint } from '../utils/geometry';
import { BoundingBox } from './BoundingBox';
import { ShapeRegistry } from '../shapes/ShapeRegistry';
import { Transform } from './Transform';
import { generateId } from '../utils/id';

export interface ShapeElementData extends ElementData {
    type: 'shape';
    shapeType: string;
    points: { x: number; y: number }[];
    style: ElementStyle;
    rotation?: number;
}

export class ShapeElement extends InkElement {
    declare type: 'shape';
    shapeType: string;
    points: Vec2[];
    style: ElementStyle;

    constructor(
        id?: string,
        shapeType: string = 'line',
        points: Vec2[] = [],
        style?: ElementStyle
    ) {
        super(id ?? generateId(), 'shape');
        this.shapeType = shapeType;
        this.points = points;
        this.style = style ?? {
            strokeColor: '#1a1a1a',
            strokeWidth: 3,
            strokePattern: 'solid',
            opacity: 1.0,
        };
    }

    getBoundingBox(): BoundingBox {
        if (this.cachedBBox !== null) return this.cachedBBox;
        const def = ShapeRegistry.get(this.shapeType);
        let box: BoundingBox;
        if (!def) {
            // fallback box if shape type is not registered (e.g. legacy rectangle or circle)
            const pad = this.style.strokeWidth / 2 + 4;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const pt of this.points) {
                if (pt.x < minX) minX = pt.x;
                if (pt.y < minY) minY = pt.y;
                if (pt.x > maxX) maxX = pt.x;
                if (pt.y > maxY) maxY = pt.y;
            }
            if (this.points.length === 0) {
                minX = 0; minY = 0; maxX = 100; maxY = 100;
            }
            box = new BoundingBox(
                minX + this.transform.x - pad,
                minY + this.transform.y - pad,
                (maxX - minX) + pad * 2,
                (maxY - minY) + pad * 2
            );
        } else {
            const pts = this.points.map(pt => this.transform.applyToPoint(pt.x, pt.y));
            box = def.getBoundingBox(pts);
        }

        // Apply rotation to bounding box if present
        if (this.rotation && this.rotation !== 0) {
            const cx = box.centerX;
            const cy = box.centerY;
            const corners = [
                { x: box.x, y: box.y },
                { x: box.right, y: box.y },
                { x: box.right, y: box.bottom },
                { x: box.x, y: box.bottom }
            ];
            
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            
            for (const p of corners) {
                const rotated = rotatePoint(p, { x: cx, y: cy }, this.rotation);
                if (rotated.x < minX) minX = rotated.x;
                if (rotated.x > maxX) maxX = rotated.x;
                if (rotated.y < minY) minY = rotated.y;
                if (rotated.y > maxY) maxY = rotated.y;
            }
            
            box = new BoundingBox(minX, minY, maxX - minX, maxY - minY);
        }

        this.cachedBBox = box;
        return this.cachedBBox;
    }

    hitTest(px: number, py: number, threshold: number): boolean {
        const def = ShapeRegistry.get(this.shapeType);
        if (!def) {
            const bbox = this.getBoundingBox().expand(threshold);
            return bbox.contains(px, py);
        }
        const pts = this.points.map(pt => this.transform.applyToPoint(pt.x, pt.y));
        return def.hitTest(pts, this.style, { x: px, y: py }, threshold);
    }

    hitTestCtx(ctx: CanvasRenderingContext2D, screenX: number, screenY: number): boolean {
        const def = ShapeRegistry.get(this.shapeType);
        if (!def) return false;

        ctx.save();
        this.transform.applyToContext(ctx);

        // Apply rotation if present
        if (this.rotation && this.rotation !== 0) {
            const box = def.getBoundingBox(this.points);
            ctx.translate(box.centerX, box.centerY);
            ctx.rotate(this.rotation);
            ctx.translate(-box.centerX, -box.centerY);
        }

        // Mock fill and stroke to build path without consuming it
        let hit = false;
        const oldFill = ctx.fill;
        const oldStroke = ctx.stroke;
        ctx.fill = () => {};
        ctx.stroke = () => {};

        try {
            def.render(ctx, this.points, this.style, false);
            ctx.lineWidth = this.style.strokeWidth;
            hit = ctx.isPointInPath(screenX, screenY) || ctx.isPointInStroke(screenX, screenY);
        } catch (err) {
            console.error(err);
        } finally {
            ctx.fill = oldFill;
            ctx.stroke = oldStroke;
        }

        ctx.restore();
        return hit;
    }

    render(ctx: CanvasRenderingContext2D): void {
        const def = ShapeRegistry.get(this.shapeType);
        ctx.save();
        this.transform.applyToContext(ctx);
        if (!def) {
            ctx.strokeStyle = '#ff000066';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const pt of this.points) {
                if (pt.x < minX) minX = pt.x;
                if (pt.y < minY) minY = pt.y;
                if (pt.x > maxX) maxX = pt.x;
                if (pt.y > maxY) maxY = pt.y;
            }
            if (this.points.length === 0) {
                minX = 0; minY = 0; maxX = 100; maxY = 100;
            }
            ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
            ctx.restore();
            return;
        }
        def.render(ctx, this.points, this.style, false);
        ctx.restore();
    }

    serialize(): ShapeElementData {
        return {
            type: 'shape',
            id: this.id,
            shapeType: this.shapeType,
            points: this.points.map(pt => ({ x: pt.x, y: pt.y })),
            style: { ...this.style },
            transform: this.transform.serialize(),
            timestamp: this.timestamp,
            rotation: this.rotation,
            url: this.url,
            linkGroupId: this.linkGroupId,
        };
    }

    static deserialize(data: any): ShapeElement {
        const points: Vec2[] = [];
        if (data.points && Array.isArray(data.points)) {
            for (const pt of data.points) {
                if (Array.isArray(pt)) {
                    points.push({ x: pt[0], y: pt[1] });
                } else if (pt && typeof pt.x === 'number' && typeof pt.y === 'number') {
                    points.push({ x: pt.x, y: pt.y });
                }
            }
        } else if (data.shapePoints && Array.isArray(data.shapePoints)) {
            for (const pt of data.shapePoints) {
                if (Array.isArray(pt)) {
                    points.push({ x: pt[0], y: pt[1] });
                }
            }
        }

        if (points.length === 0 && typeof data.width === 'number' && typeof data.height === 'number') {
            points.push({ x: 0, y: 0 });
            points.push({ x: data.width, y: data.height });
        }

        const style: ElementStyle = {
            strokeColor: data.style?.strokeColor ?? data.style?.color ?? '#1a1a1a',
            strokeWidth: data.style?.strokeWidth ?? data.style?.size ?? 3,
            strokePattern: data.style?.strokePattern ?? 'solid',
            opacity: data.style?.opacity ?? 1.0,
            fillColor: data.style?.fillColor,
        };

        const el = new ShapeElement(
            data.id,
            data.shapeType,
            points,
            style
        );
        el.transform = Transform.deserialize(data.transform);
        el.timestamp = data.timestamp ?? Date.now();
        el.rotation = data.rotation;
        el.url = data.url;
        el.linkGroupId = data.linkGroupId;
        return el;
    }
}
