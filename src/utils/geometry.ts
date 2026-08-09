import { Stroke } from '../model/Stroke';
import { BoundingBox } from '../model/BoundingBox';

/** A 2D point. */
export interface Point {
    x: number;
    y: number;
}

export type Vec2 = Point;

/** A rectangle defined by position and size. */
export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Squared distance between two points (avoids sqrt for performance). */
export function distanceSquared(a: Point, b: Point): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
}

/** Euclidean distance between two points. */
export function distance(a: Point, b: Point): number {
    return Math.sqrt(distanceSquared(a, b));
}

/** Check if a point is inside a rectangle. */
export function pointInRect(
    point: Point,
    x: number,
    y: number,
    w: number,
    h: number
): boolean {
    return point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h;
}

/** Check if two rectangles intersect. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    );
}

/**
 * Check if a point is within `threshold` distance of a line segment.
 * Used for hit-testing strokes.
 */
export function pointNearSegment(
    point: Point,
    segA: Point,
    segB: Point,
    threshold: number
): boolean {
    const dx = segB.x - segA.x;
    const dy = segB.y - segA.y;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
        // Segment is a single point
        return distanceSquared(point, segA) <= threshold * threshold;
    }

    // Project point onto line, clamped to segment
    let t = ((point.x - segA.x) * dx + (point.y - segA.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = segA.x + t * dx;
    const projY = segA.y + t * dy;

    const distSq =
        (point.x - projX) * (point.x - projX) +
        (point.y - projY) * (point.y - projY);

    return distSq <= threshold * threshold;
}

/**
 * Check if a point is inside a polygon using ray-casting algorithm.
 * For future use with lasso selection.
 */
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
    let inside = false;
    const n = polygon.length;

    for (let i = 0, j = n - 1; i < n; j = i++) {
        const pi = polygon[i];
        const pj = polygon[j];

        if (
            pi.y > point.y !== pj.y > point.y &&
            point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x
        ) {
            inside = !inside;
        }
    }

    return inside;
}

/**
 * Compute the axis-aligned bounding box of a set of points.
 * Points are arrays where index 0 is x and index 1 is y.
 */
export function getBoundsOfPoints(points: number[][]): Rect {
    if (points.length === 0) {
        return { x: 0, y: 0, width: 0, height: 0 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const p of points) {
        if (p[0] < minX) minX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] > maxY) maxY = p[1];
    }

    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
    };
}

/**
 * Given a set of strokes and a lasso polygon, returns the IDs of all strokes
 * where AT LEAST ONE point falls inside the polygon.
 *
 * For performance, first check if the stroke's BoundingBox intersects the
 * polygon's BoundingBox before running per-point tests.
 */
export function strokesInsidePolygon(strokes: Stroke[], lassoPath: Point[]): string[] {
    const selectedIds: string[] = [];
    if (lassoPath.length < 3) return selectedIds;

    const lassoPointsAsArray = lassoPath.map(p => [p.x, p.y]);
    const lassoBox = BoundingBox.fromPoints(lassoPointsAsArray);

    for (const stroke of strokes) {
        const strokeBox = stroke.getBoundingBox();
        if (!strokeBox.intersects(lassoBox)) {
            continue;
        }

        // Check each point inside the stroke against the polygon
        for (const pt of stroke.points) {
            // Transform point from local stroke space to page space
            const transformedPoint = stroke.transform.applyToPoint(pt[0], pt[1]);
            
            if (pointInPolygon(transformedPoint, lassoPath)) {
                selectedIds.push(stroke.id);
                break;
            }
        }
    }

    return selectedIds;
}

/**
 * Translates a PointerEvent's client coordinates into canvas-local coordinates,
 * then clamps them to the page's drawable area.
 *
 * @param event       The raw PointerEvent.
 * @param canvas      The HTMLCanvasElement representing the InkPage.
 * @param pageWidth   The logical width of the InkPage in canvas units.
 * @param pageHeight  The logical height of the InkPage in canvas units.
 * @param viewport    Optional ViewportManager to translate using viewport scale and offset.
 * @returns           A Point guaranteed to be within [0, pageWidth] x [0, pageHeight].
 */
export function clientToPageCoords(
    event: PointerEvent,
    canvas: HTMLCanvasElement,
    pageWidth: number,
    pageHeight: number,
    viewport?: { 
        screenToPage(x: number, y: number): { x: number; y: number };
        getPageDimensions?(): { width: number; height: number };
    }
): Point {
    let pWidth = pageWidth;
    let pHeight = pageHeight;

    if ((pWidth === undefined || pWidth === null || isNaN(pWidth)) && viewport && typeof viewport.getPageDimensions === 'function') {
        const dims = viewport.getPageDimensions();
        pWidth = dims.width;
        pHeight = dims.height;
    }

    // Default fallbacks if still undefined
    if (pWidth === undefined || pWidth === null || isNaN(pWidth)) pWidth = 800;
    if (pHeight === undefined || pHeight === null || isNaN(pHeight)) pHeight = 1000;

    // Robust fallback for mock tests that don't pass a canvas with bounding rect
    if (!canvas || typeof canvas.getBoundingClientRect !== 'function') {
        const screenX = event.offsetX !== undefined ? event.offsetX : 0;
        const screenY = event.offsetY !== undefined ? event.offsetY : 0;
        let pageX = screenX;
        let pageY = screenY;
        if (viewport) {
            const pagePos = viewport.screenToPage(screenX, screenY);
            pageX = pagePos.x;
            pageY = pagePos.y;
        }
        return {
            x: Math.max(0, Math.min(pWidth, pageX)),
            y: Math.max(0, Math.min(pHeight, pageY)),
        };
    }

    const rect = canvas.getBoundingClientRect();
    const screenX = event.clientX !== undefined ? event.clientX - rect.left : (event.offsetX !== undefined ? event.offsetX : 0);
    const screenY = event.clientY !== undefined ? event.clientY - rect.top : (event.offsetY !== undefined ? event.offsetY : 0);

    let pageX: number;
    let pageY: number;

    if (viewport) {
        const pagePos = viewport.screenToPage(screenX, screenY);
        pageX = pagePos.x;
        pageY = pagePos.y;
    } else {
        const scaleX = rect.width !== 0 ? canvas.width / rect.width : 1;
        const scaleY = rect.height !== 0 ? canvas.height / rect.height : 1;
        pageX = screenX * scaleX;
        pageY = screenY * scaleY;
    }

    return {
        x: Math.max(0, Math.min(pWidth, pageX)),
        y: Math.max(0, Math.min(pHeight, pageY)),
    };
}

export function snapPointToGrid(pt: Vec2, gridSize: number, zoom: number = 1): Vec2 {
  let interval = gridSize;
  if (zoom >= 3.0) {
    interval = gridSize / 4;
  } else if (zoom >= 1.5) {
    interval = gridSize / 2;
  }
  return {
    x: Math.round(pt.x / interval) * interval,
    y: Math.round(pt.y / interval) * interval,
  };
}

export function rotatePoint(point: Vec2, center: Vec2, angleRadians: number): Vec2 {
    const cos = Math.cos(angleRadians);
    const sin = Math.sin(angleRadians);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return {
        x: center.x + dx * cos - dy * sin,
        y: center.y + dx * sin + dy * cos,
    };
}

export interface BakeableShape {
    shapeType: string;
    points: Point[];
    transform: { applyToPoint(x: number, y: number): Point };
    rotation?: number;
}

export function doLineSegmentsIntersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): boolean {
    const cross = (a: Vec2, b: Vec2, c: Vec2) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const onSegment = (p: Vec2, q: Vec2, r: Vec2) =>
        r.x >= Math.min(p.x, q.x) && r.x <= Math.max(p.x, q.x) &&
        r.y >= Math.min(p.y, q.y) && r.y <= Math.max(p.y, q.y);

    const d1 = cross(p3, p4, p1);
    const d2 = cross(p3, p4, p2);
    const d3 = cross(p1, p2, p3);
    const d4 = cross(p1, p2, p4);

    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
        return true;
    }

    if (d1 === 0 && onSegment(p3, p4, p1)) return true;
    if (d2 === 0 && onSegment(p3, p4, p2)) return true;
    if (d3 === 0 && onSegment(p1, p2, p3)) return true;
    if (d4 === 0 && onSegment(p1, p2, p4)) return true;

    return false;
}

export function bakeShapeToPolyline(shape: BakeableShape): Vec2[] {
    const pts = shape.points.map(pt => shape.transform.applyToPoint(pt.x, pt.y));
    if (pts.length < 2) {
        return [];
    }

    const minX = Math.min(pts[0].x, pts[1].x);
    const minY = Math.min(pts[0].y, pts[1].y);
    const maxX = Math.max(pts[0].x, pts[1].x);
    const maxY = Math.max(pts[0].y, pts[1].y);
    const width = maxX - minX;
    const height = maxY - minY;

    let points: Vec2[] = [];
    const step = 3;

    const sampleSegment = (p1: Vec2, p2: Vec2): Vec2[] => {
        const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const numSteps = Math.max(1, Math.round(d / step));
        const segmentPts: Vec2[] = [];
        for (let i = 0; i < numSteps; i++) {
            const t = i / numSteps;
            segmentPts.push({
                x: p1.x + (p2.x - p1.x) * t,
                y: p1.y + (p2.y - p1.y) * t,
            });
        }
        return segmentPts;
    };

    const sampleQuadratic = (p0: Vec2, p1: Vec2, p2: Vec2): Vec2[] => {
        const d = Math.hypot(p1.x - p0.x, p1.y - p0.y) + Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const numSteps = Math.max(1, Math.round(d / step));
        const curvePts: Vec2[] = [];
        for (let i = 0; i < numSteps; i++) {
            const t = i / numSteps;
            const mt = 1 - t;
            curvePts.push({
                x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
                y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
            });
        }
        return curvePts;
    };

    const type = shape.shapeType.toLowerCase();

    if (type === 'rectangle') {
        const v0 = { x: minX, y: minY };
        const v1 = { x: maxX, y: minY };
        const v2 = { x: maxX, y: maxY };
        const v3 = { x: minX, y: maxY };
        points = [
            ...sampleSegment(v0, v1),
            ...sampleSegment(v1, v2),
            ...sampleSegment(v2, v3),
            ...sampleSegment(v3, v0),
            v0
        ];
    } else if (type === 'ellipse') {
        const cx = minX + width / 2;
        const cy = minY + height / 2;
        const rx = width / 2;
        const ry = height / 2;
        const r_avg = (rx + ry) / 2;
        const steps = Math.max(12, Math.round((2 * Math.PI * r_avg) / step));
        for (let i = 0; i <= steps; i++) {
            const theta = (i / steps) * 2 * Math.PI;
            points.push({
                x: cx + rx * Math.cos(theta),
                y: cy + ry * Math.sin(theta),
            });
        }
    } else if (type === 'triangle') {
        const v0 = { x: minX + width / 2, y: minY };
        const v1 = { x: maxX, y: maxY };
        const v2 = { x: minX, y: maxY };
        points = [
            ...sampleSegment(v0, v1),
            ...sampleSegment(v1, v2),
            ...sampleSegment(v2, v0),
            v0
        ];
    } else if (type === 'rounded-rectangle') {
        const r = Math.max(0, Math.min(12, width / 2, height / 2));
        if (r === 0) {
            const v0 = { x: minX, y: minY };
            const v1 = { x: maxX, y: minY };
            const v2 = { x: maxX, y: maxY };
            const v3 = { x: minX, y: maxY };
            points = [
                ...sampleSegment(v0, v1),
                ...sampleSegment(v1, v2),
                ...sampleSegment(v2, v3),
                ...sampleSegment(v3, v0),
                v0
            ];
        } else {
            const topL_end = { x: minX + r, y: minY };
            const topR_start = { x: minX + width - r, y: minY };
            const topR_ctrl = { x: minX + width, y: minY };
            const topR_end = { x: minX + width, y: minY + r };
            
            const right_start = topR_end;
            const right_end = { x: minX + width, y: minY + height - r };
            const bottomR_ctrl = { x: minX + width, y: minY + height };
            const bottomR_end = { x: minX + width - r, y: minY + height };
            
            const bottom_start = bottomR_end;
            const bottom_end = { x: minX + r, y: minY + height };
            const bottomL_ctrl = { x: minX, y: minY + height };
            const bottomL_end = { x: minX, y: minY + height - r };
            
            const left_start = bottomL_end;
            const left_end = { x: minX, y: minY + r };
            const topL_ctrl = { x: minX, y: minY };
            
            points = [
                ...sampleSegment(topL_end, topR_start),
                ...sampleQuadratic(topR_start, topR_ctrl, topR_end),
                ...sampleSegment(right_start, right_end),
                ...sampleQuadratic(right_end, bottomR_ctrl, bottomR_end),
                ...sampleSegment(bottom_start, bottom_end),
                ...sampleQuadratic(bottom_end, bottomL_ctrl, bottomL_end),
                ...sampleSegment(left_start, left_end),
                ...sampleQuadratic(left_end, topL_ctrl, topL_end),
                topL_end
            ];
        }
    } else {
        for (let i = 0; i < pts.length - 1; i++) {
            points.push(...sampleSegment(pts[i], pts[i+1]));
        }
        points.push(pts[pts.length - 1]);
    }

    if (shape.rotation && shape.rotation !== 0) {
        const unrotatedBox = getBoundsOfPoints(pts.map(p => [p.x, p.y]));
        const cx = unrotatedBox.x + unrotatedBox.width / 2;
        const cy = unrotatedBox.y + unrotatedBox.height / 2;
        for (let i = 0; i < points.length; i++) {
            points[i] = rotatePoint(points[i], { x: cx, y: cy }, shape.rotation);
        }
    }

    return points;
}

export function getDistanceBetweenSegments(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): number {
    if (doLineSegmentsIntersect(p1, p2, p3, p4)) {
        return 0;
    }

    const pointToSegmentDist = (p: Vec2, sStart: Vec2, sEnd: Vec2): number => {
        const dx = sEnd.x - sStart.x;
        const dy = sEnd.y - sStart.y;
        const lenSq = dx * dx + dy * dy;

        if (lenSq === 0) {
            return Math.hypot(p.x - sStart.x, p.y - sStart.y);
        }

        let t = ((p.x - sStart.x) * dx + (p.y - sStart.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));

        const projX = sStart.x + t * dx;
        const projY = sStart.y + t * dy;

        return Math.hypot(p.x - projX, p.y - projY);
    };

    return Math.min(
        pointToSegmentDist(p1, p3, p4),
        pointToSegmentDist(p2, p3, p4),
        pointToSegmentDist(p3, p1, p2),
        pointToSegmentDist(p4, p1, p2)
    );
}


