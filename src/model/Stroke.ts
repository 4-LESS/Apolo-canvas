import { getStroke, getStrokePoints } from 'perfect-freehand';
import { InkElement, ElementData } from './InkElement';
import { Transform } from './Transform';
import { BoundingBox } from './BoundingBox';
import { ElementStyle, DEFAULT_STROKE_STYLE } from './ElementStyle';
import { hexToRgba } from '../utils/color';
import { generateId } from '../utils/id';
import { PenProfileRegistry } from './PenProfileRegistry';

/** Tool type that created this stroke. */
export type StrokeTool = 'pen' | 'highlighter';

/** Serialized stroke data. */
export interface StrokeData extends ElementData {
    type: 'stroke';
    tool: StrokeTool;
    style: ElementStyle;
    points: number[][];
    isSlicedStart?: boolean;
    isSlicedEnd?: boolean;
    isFromShape?: boolean;
    pointGeometryLocked?: boolean;
    smoothingLevel?: number;
    profileId?: string;
}

export function migrateStrokeStyle(raw: any): ElementStyle {
    if (raw.style && typeof raw.style.strokeColor === 'string') {
        return raw.style;  // already migrated
    }

    const oldStyle = raw.style;
    const isHighlight = raw.isHighlight ?? (raw.tool === 'highlighter');

    return {
        strokeColor:   raw.color ?? oldStyle?.color ?? '#1a1a1a',
        strokeWidth:   raw.width ?? oldStyle?.size ?? 3,
        strokePattern: 'solid',
        opacity:       isHighlight ? (raw.highlightOpacity ?? oldStyle?.opacity ?? 0.4) : (oldStyle?.opacity ?? 1.0),
        fillColor:     undefined,
    };
}

/* ------------------------------------------------------------------------ *
 * Pen-strategy math engine
 *
 * NOTE ON PenProfile SHAPE: this file only knows `profile.strategy` and
 * `profile.baseSmoothing` for certain (those already existed). The fields
 * below (nibAngleDeg, minWidthRatio, maxWidthRatio, fountainThinning,
 * fountainVelocityBlend, softpaintMinAlpha, softpaintMaxAlpha) are NEW and
 * read via `(profile as any)?.field ?? default`, so everything works with
 * zero changes to PenProfileRegistry. If you want them authored per-profile
 * instead of always falling back to defaults, add to the PenProfile type:
 *
 *   nibAngleDeg?: number;          // calligraphy, default 45
 *   minWidthRatio?: number;        // calligraphy, default 0.12
 *   maxWidthRatio?: number;        // calligraphy, default 1.0
 *   fountainThinning?: number;     // fountain, default 0.75 (spec range 0.6-0.8)
 *   fountainVelocityBlend?: number;// fountain, default 0.55
 *   softpaintMinAlpha?: number;    // softpaint, default 0.1
 *   softpaintMaxAlpha?: number;    // softpaint, default 0.4
 * ------------------------------------------------------------------------ */

interface StrokeDab {
    x: number;
    y: number;
    r: number;
    alpha: number;
}

/**
 * Distance (in page units) between consecutive samples that counts as
 * "fast" motion. Points carry no timestamp, so this is a spatial proxy for
 * velocity — the same trick perfect-freehand's own `simulatePressure` mode
 * uses internally, since it has no access to wall-clock time either.
 *
 * CAVEAT: this is calibrated in page-space units. If the canvas supports
 * zoom and `this.points` are stored in page coordinates (per the class
 * docstring), a zoomed-out view will make every gesture look "faster" than
 * it physically was. If that turns out to matter in practice, this needs to
 * be calibrated against the current view scale rather than a flat constant.
 */
const ASSUMED_FAST_SPACING_PX = 6;

function decimateArray<T>(arr: T[], maxCount: number): T[] {
    if (arr.length <= maxCount) return arr;
    const step = arr.length / maxCount;
    const out: T[] = [];
    for (let i = 0; i < maxCount; i++) {
        out.push(arr[Math.floor(i * step)]);
    }
    const last = arr[arr.length - 1];
    if (out[out.length - 1] !== last) out.push(last);
    return out;
}

/**
 * Per-point normalized speed in [0, 1], based on smoothed inter-point
 * spacing. Smoothed over a 3-sample window so a single jittery sample
 * doesn't pop the stroke width. Normalized against an ABSOLUTE constant
 * (not the stroke's own max) so a uniformly slow, controlled stroke stays
 * uniformly thick instead of showing fake tapering from minor jitter being
 * "the fastest part of this slow stroke."
 */
function computeNormalizedSpeeds(points: number[][]): number[] {
    const n = points.length;
    if (n < 2) return new Array(n).fill(0);

    const raw = new Array(n).fill(0);
    for (let i = 1; i < n; i++) {
        const dx = points[i][0] - points[i - 1][0];
        const dy = points[i][1] - points[i - 1][1];
        raw[i] = Math.sqrt(dx * dx + dy * dy);
    }
    raw[0] = raw[1] ?? 0;

    const speeds = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
        const a = raw[Math.max(0, i - 1)];
        const b = raw[i];
        const c = raw[Math.min(n - 1, i + 1)];
        speeds[i] = Math.min(1, ((a + b + c) / 3) / ASSUMED_FAST_SPACING_PX);
    }
    return speeds;
}

/**
 * Fountain pen: blends real stylus pressure with a velocity-derived
 * "synthetic pressure" (slow => high, fast => low) and feeds the blend back
 * into perfect-freehand as the per-point pressure channel, with
 * simulatePressure left off so OUR blend drives the taper rather than the
 * library re-deriving pressure from distance on its own.
 *
 * perfect-freehand's `thinning` option is a single value for the whole
 * curve — it can't itself vary continuously along the stroke. The "dynamic
 * 0.6–0.8" in the brief is implemented as a tunable per-profile constant
 * (see fountainThinning below); the actual moment-to-moment dynamism comes
 * from this per-point pressure blend, which is what generates the swelling
 * and sharp thin-out as speed changes.
 */
function buildFountainPoints(points: number[][], velocityBlend: number): number[][] {
    const speeds = computeNormalizedSpeeds(points);
    return points.map((p, i) => {
        const rawPressure = p[2] ?? 0.5;
        const velocityPressure = 1 - speeds[i]; // slow -> thick, fast -> thin
        const blended = rawPressure * (1 - velocityBlend) + velocityPressure * velocityBlend;
        return [p[0], p[1], Math.max(0.05, Math.min(1, blended))];
    });
}

function circlePolygon(cx: number, cy: number, r: number, segments = 12): number[][] {
    const pts: number[][] = [];
    for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return pts;
}

/**
 * Calligraphy / chiseled nib: perfect-freehand has no notion of a fixed nib
 * angle, so this builds the outline by hand. At each (smoothed) centerline
 * point, the visible width is the magnitude of the dot product between the
 * direction of travel and the vector PERPENDICULAR to the nib's fixed
 * angle:
 *
 *   factor = |travelDir · nibPerpendicular|
 *
 * Moving parallel to the nib axis => factor ~0 => hairline.
 * Moving perpendicular to the nib axis (across its edge) => factor ~1 => full chisel width.
 *
 * The resulting per-point half-width is then offset perpendicular to the
 * direction of travel (the standard "ribbon" outline construction also used
 * internally by perfect-freehand), not perpendicular to the nib axis itself
 * — offsetting by nib axis would produce a constant-orientation slab that
 * doesn't actually follow the stroke's curve correctly.
 *
 * We lean on perfect-freehand's `getStrokePoints` purely for its smoothed
 * centerline + per-point unit tangent (`vector`) — pressure/thinning are
 * irrelevant here since chisel width is angle-driven, not pressure-driven.
 */
function buildCalligraphyOutline(
    points: number[][],
    nibAngleDeg: number,
    minWidth: number,
    maxWidth: number,
    streamline: number,
): number[][] {
    if (points.length === 0) return [];
    if (points.length === 1) {
        return circlePolygon(points[0][0], points[0][1], maxWidth / 2);
    }

    const strokePoints = getStrokePoints(points, {
        size: maxWidth,
        streamline,
        simulatePressure: false,
    }) as Array<{ point: number[]; vector: number[] }>;

    const nibAngleRad = (nibAngleDeg * Math.PI) / 180;
    const nx = Math.cos(nibAngleRad);
    const ny = Math.sin(nibAngleRad);
    const perpX = -ny;
    const perpY = nx;

    const left: number[][] = [];
    const right: number[][] = [];

    for (const sp of strokePoints) {
        const [px, py] = sp.point;
        let [vx, vy] = sp.vector;
        const vLen = Math.hypot(vx, vy);
        if (vLen < 1e-6) { vx = 1; vy = 0; } else { vx /= vLen; vy /= vLen; }

        const factor = Math.abs(vx * perpX + vy * perpY);
        const halfWidth = (minWidth + (maxWidth - minWidth) * factor) / 2;

        // Offset perpendicular to direction of travel.
        const ox = -vy * halfWidth;
        const oy = vx * halfWidth;

        left.push([px + ox, py + oy]);
        right.push([px - ox, py - oy]);
    }

    return [...left, ...right.reverse()];
}

/** Deterministic PRNG so cached grain doesn't shimmer/flicker on re-render. */
function seededRandom(seed: number): () => number {
    let t = seed >>> 0;
    return function () {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

function hashString(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

interface CenterlineNode {
    x: number;
    y: number;
    pressure: number;
    tangentX: number;  // perpendicular normal x (-ny)
    tangentY: number;  // perpendicular normal y (nx)
    dirX: number;      // direction tangent x (nx)
    dirY: number;      // direction tangent y (ny)
}

/**
 * A freehand stroke element rendered with pressure-sensitive width
 * via the perfect-freehand library.
 *
 * Points are stored as `[x, y, pressure]` arrays in page coordinates.
 * The outline (polygon contour for filling) is lazily computed and cached.
 *
 * `getOutline()` always returns a real fillable/hit-testable polygon
 * regardless of pen strategy — for softpaint/pencil-textured it backs hit
 * testing and the bounding box only; the actual paint is drawn by custom render pipelines.
 */
export class Stroke extends InkElement {
    declare type: 'stroke';
    tool: StrokeTool;
    style: ElementStyle;
    /** Raw input points: [[x, y, pressure], ...] */
    points: number[][];
    isSlicedStart?: boolean;
    isSlicedEnd?: boolean;
    isFromShape?: boolean;
    pointGeometryLocked?: boolean;
    smoothingLevel: number;
    profileId?: string;

    // Shared offscreen canvas to optimize texture drawing operations
    private static sharedCanvas: HTMLCanvasElement | null = null;
    private static sharedCtx: CanvasRenderingContext2D | null = null;

    private static getSharedCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
        if (!Stroke.sharedCanvas) {
            Stroke.sharedCanvas = document.createElement('canvas');
            Stroke.sharedCtx = Stroke.sharedCanvas.getContext('2d')!;
        }
        if (Stroke.sharedCanvas.width < width || Stroke.sharedCanvas.height < height) {
            Stroke.sharedCanvas.width = Math.max(Stroke.sharedCanvas.width, width);
            Stroke.sharedCanvas.height = Math.max(Stroke.sharedCanvas.height, height);
        }
        return [Stroke.sharedCanvas, Stroke.sharedCtx!];
    }

    /** Cached outline polygon from perfect-freehand (or custom geometry). */
    private cachedOutline: number[][] | null = null;
    /** Cached dab cloud for dab-rendered strategies (softpaint). */
    private cachedDabs: StrokeDab[] | null = null;
    /** Cached centerline points for pencil strategy. */
    private cachedCenterline: CenterlineNode[] | null = null;

    constructor(
        id?: string,
        tool: StrokeTool = 'pen',
        style?: ElementStyle,
        profileId?: string
    ) {
        super(id ?? generateId(), 'stroke');
        this.tool = tool;
        this.style = style
            ? { ...style }
            : { ...DEFAULT_STROKE_STYLE };
        this.points = [];
        this.smoothingLevel = 0.3;
        this.profileId = profileId;
    }

    private interpolateCenterline(points: number[][], spacing: number): CenterlineNode[] {
        const interpolated: CenterlineNode[] = [];
        if (points.length < 2) return interpolated;

        let distSinceLastDab = 0;

        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            
            const dx = p2[0] - p1[0];
            const dy = p2[1] - p1[1];
            const segmentLen = Math.hypot(dx, dy);
            
            if (segmentLen === 0) continue;

            const nx = dx / segmentLen;
            const ny = dy / segmentLen;
            let travel = 0;

            while (distSinceLastDab + (segmentLen - travel) >= spacing) {
                const needed = spacing - distSinceLastDab;
                travel += needed;
                const t = travel / segmentLen;

                const x = p1[0] + dx * t;
                const y = p1[1] + dy * t;
                const pressure = p1[2] + (p2[2] - p1[2]) * t;

                // Perpendicular tangent vector for scattering math: (-ny, nx)
                // Tangent vector along the path direction: (nx, ny)
                interpolated.push({
                    x,
                    y,
                    pressure,
                    tangentX: -ny,
                    tangentY: nx,
                    dirX: nx,
                    dirY: ny
                });
                distSinceLastDab = 0;
            }
            distSinceLastDab += (segmentLen - travel);
        }
        return interpolated;
    }

    private getGaussian(rand: () => number): number {
        let u1 = 0, u2 = 0;
        // u1 clamped to prevent log of 0 or near-zero blowing up
        while (u1 <= 1e-7) u1 = rand();
        while (u2 <= 1e-7) u2 = rand();
        return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    }

    private buildSoftpaintDabs(baseWidth: number, minAlpha: number, maxAlpha: number): StrokeDab[] {
        if (this.points.length === 0) return [];
        
        const spacing = Math.max(0.7, baseWidth * 0.06);
        const path = this.interpolateCenterline(this.points, spacing);
        const dabs: StrokeDab[] = [];
        
        for (const pt of path) {
            const p = pt.pressure;
            const alpha = minAlpha + (maxAlpha - minAlpha) * p;
            const r = (baseWidth / 2) * (0.6 + p * 0.6);
            dabs.push({ x: pt.x, y: pt.y, r, alpha: Math.max(0, Math.min(1, alpha)) });
        }
        
        return decimateArray(dabs, 5000);
    }

    private buildPencilDabs(baseWidth: number): StrokeDab[] {
        if (this.points.length === 0) return [];

        const spacing = 1.0; // Fixed spacing to keep node density constant
        const path = this.interpolateCenterline(this.points, spacing);
        const dabs: StrokeDab[] = [];
        const rand = seededRandom(hashString(this.id + '-pencil-dabs'));

        for (const node of path) {
            const pressure = node.pressure;

            // Knob 1: Dot Count
            const N = Math.max(1, Math.round(baseWidth * 0.4 * pressure));

            // Knob 2: Spread standard deviation
            const sigma = baseWidth * (0.12 + pressure * 0.18);

            for (let j = 0; j < N; j++) {
                // Perpendicular offset (Gaussian scatter)
                const offset = this.getGaussian(rand) * sigma;

                // Tangential offset to break the periodic comb/rake lattice pattern
                const tangOffset = (rand() - 0.5) * spacing;

                const dotX = node.x + offset * node.tangentX + tangOffset * node.dirX;
                const dotY = node.y + offset * node.tangentY + tangOffset * node.dirY;

                // Pressure-dependent individual dot alpha
                const baseAlpha = 0.35 + pressure * 0.45;
                const dotAlpha = baseAlpha * (0.8 + rand() * 0.2);

                // Bounding box size (r is radius, half of size in [0.7px, 1.2px])
                const dotSize = 0.7 + rand() * 0.5;
                const radius = dotSize / 2;

                dabs.push({
                    x: dotX,
                    y: dotY,
                    r: radius,
                    alpha: dotAlpha
                });
            }
        }

        return decimateArray(dabs, 5000);
    }

    private getCenterline(spacing: number): CenterlineNode[] {
        if (this.cachedCenterline === null) {
            this.cachedCenterline = this.interpolateCenterline(this.points, spacing);
        }
        return this.cachedCenterline;
    }

    /**
     * True when this stroke was drawn with the highlighter tool.
     * Used by the renderer to apply 'multiply' composite blending.
     */
    get isHighlight(): boolean {
        return this.tool === 'highlighter';
    }

    private getProfile() {
        return this.profileId ? PenProfileRegistry.get(this.profileId) : undefined;
    }

    /** Widest this stroke can render, accounting for calligraphy's maxWidthRatio. */
    private getEffectiveMaxWidth(): number {
        const ratio = (this.getProfile() as any)?.maxWidthRatio ?? 1;
        return this.style.strokeWidth * Math.max(1, ratio);
    }

    /** Add a new point to the stroke (invalidates caches). */
    addPoint(x: number, y: number, pressure: number): void {
        // Quantize: 1 decimal for coords, 2 for pressure
        this.points.push([
            Math.round(x * 10) / 10,
            Math.round(y * 10) / 10,
            Math.round(pressure * 100) / 100,
        ]);
        this.cachedOutline = null;
        this.cachedDabs = null;
        this.cachedCenterline = null;
        this.cachedBBox = null;
    }

    /**
     * Get the outline polygon for this stroke.
     *
     * - No profileId (and not highlighter/shape-derived): unchanged legacy
     *   behaviour — flat thinning 0.7, raw pressure only, no velocity math.
     * - Highlighter / shape-derived: always forced to uniform width
     *   (thinning 0), regardless of any profile.
     * - profileId present: dispatches to the strategy's math engine.
     */
    getOutline(): number[][] {
        if (this.cachedOutline === null) {
            const profile = this.getProfile();
            const forceUniform = this.isFromShape || this.tool === 'highlighter';

            if (forceUniform) {
                this.cachedOutline = getStroke(this.points, {
                    size: this.style.strokeWidth,
                    thinning: 0,
                    smoothing: 0.5,
                    streamline: this.pointGeometryLocked ? 0 : (this.smoothingLevel ?? 0.3),
                    simulatePressure: false,
                    last: true,
                    start: { taper: 0, cap: true },
                    end: { taper: 0, cap: true },
                });
                return this.cachedOutline;
            }

            if (!profile) {
                this.cachedOutline = getStroke(this.points, {
                    size: this.style.strokeWidth,
                    thinning: 0.7,
                    smoothing: 0.5,
                    streamline: this.pointGeometryLocked ? 0 : (this.smoothingLevel ?? 0.3),
                    simulatePressure: false,
                    last: true,
                    start: { taper: 0, cap: true },
                    end: { taper: 0, cap: true },
                });
                return this.cachedOutline;
            }

            const strategy = profile.strategy;

            if (strategy === 'calligraphy') {
                const nibAngleDeg = (profile as any)?.nibAngleDeg ?? 45;
                const minWidthRatio = (profile as any)?.minWidthRatio ?? 0.12;
                const maxWidthRatio = (profile as any)?.maxWidthRatio ?? 1.0;
                const streamline = this.pointGeometryLocked ? 0 : (this.smoothingLevel ?? profile.baseSmoothing ?? 0.4);

                this.cachedOutline = buildCalligraphyOutline(
                    this.points,
                    nibAngleDeg,
                    this.style.strokeWidth * minWidthRatio,
                    this.style.strokeWidth * maxWidthRatio,
                    streamline,
                );
                return this.cachedOutline;
            }

            const options: any = {
                size: this.style.strokeWidth,
                smoothing: strategy === 'ballpoint' ? 0.1 : 0.5,
                streamline: this.pointGeometryLocked ? 0 : (this.smoothingLevel ?? profile.baseSmoothing ?? 0.3),
                simulatePressure: false,
                last: true,
                start: { taper: 0, cap: true },
                end: { taper: 0, cap: true },
            };

            let sourcePoints = this.points;

            switch (strategy) {
                case 'ballpoint':
                    options.thinning = 0;
                    break;
                case 'pencil-textured':
                    options.thinning = 0.2;
                    options.simulatePressure = true;
                    break;
                case 'softpaint':
                    // Backs hit-testing/bbox only — visible paint is drawn by renderDabs().
                    options.thinning = 0.4;
                    options.simulatePressure = true;
                    break;
                case 'fountain':
                default: {
                    options.thinning = (profile as any)?.fountainThinning ?? 0.75;
                    const blend = (profile as any)?.fountainVelocityBlend ?? 0.55;
                    sourcePoints = buildFountainPoints(this.points, blend);
                    break;
                }
            }

            this.cachedOutline = getStroke(sourcePoints, options);
        }
        return this.cachedOutline;
    }



    /** Build (and cache) the dab cloud for softpaint strategy. */
    private getDabs(): StrokeDab[] {
        if (this.cachedDabs === null) {
            const profile = this.getProfile();
            const forceUniform = this.isFromShape || this.tool === 'highlighter';
            const strategy = forceUniform ? undefined : profile?.strategy;

            if (strategy === 'softpaint') {
                const minAlpha = (profile as any)?.softpaintMinAlpha ?? 0.1;
                const maxAlpha = (profile as any)?.softpaintMaxAlpha ?? 0.4;
                this.cachedDabs = this.buildSoftpaintDabs(this.style.strokeWidth, minAlpha, maxAlpha);
            } else if (strategy === 'pencil-textured') {
                this.cachedDabs = this.buildPencilDabs(this.style.strokeWidth);
            } else {
                this.cachedDabs = [];
            }
        }
        return this.cachedDabs;
    }

    /** Compute bounding box from raw points, padded by the widest this stroke can render. */
    getBoundingBox(): BoundingBox {
        if (this.cachedBBox !== null) return this.cachedBBox;
        if (this.points.length === 0) {
            this.cachedBBox = new BoundingBox(0, 0, 0, 0);
            return this.cachedBBox;
        }

        const pad = this.getEffectiveMaxWidth() / 2 + 2;
        const box = BoundingBox.fromPoints(this.points);

        // Apply transform offset
        box.x += this.transform.x;
        box.y += this.transform.y;

        this.cachedBBox = box.expand(pad);
        return this.cachedBBox;
    }

    override invalidateCache(): void {
        super.invalidateCache();
        this.cachedOutline = null;
        this.cachedDabs = null;
        this.cachedCenterline = null;
    }

    /**
     * Hit-test: check if a point is near any segment of the stroke's centerline.
     * Uses raw points (not outline) for more intuitive detection.
     */
    hitTest(px: number, py: number, threshold: number): boolean {
        if (this.points.length === 0) return false;

        // Quick bounding-box check first
        const bbox = this.getBoundingBox().expand(threshold);
        if (!bbox.contains(px, py)) return false;

        // Adjust for element transform
        const localX = px - this.transform.x;
        const localY = py - this.transform.y;
        const hitDist = threshold + this.getEffectiveMaxWidth() / 2;

        for (let i = 1; i < this.points.length; i++) {
            const a = this.points[i - 1];
            const b = this.points[i];

            const dx = b[0] - a[0];
            const dy = b[1] - a[1];
            const lenSq = dx * dx + dy * dy;

            let dist: number;
            if (lenSq === 0) {
                dist = Math.sqrt(
                    (localX - a[0]) ** 2 + (localY - a[1]) ** 2
                );
            } else {
                let t =
                    ((localX - a[0]) * dx + (localY - a[1]) * dy) / lenSq;
                t = Math.max(0, Math.min(1, t));
                const projX = a[0] + t * dx;
                const projY = a[1] + t * dy;
                dist = Math.sqrt(
                    (localX - projX) ** 2 + (localY - projY) ** 2
                );
            }

            if (dist <= hitDist) return true;
        }

        return false;
    }

    hitTestCtx(ctx: CanvasRenderingContext2D, screenX: number, screenY: number): boolean {
        ctx.save();
        this.transform.applyToContext(ctx);
        ctx.beginPath();
        let hit = false;
        if (this.style.strokePattern === 'solid') {
            const outline = this.getOutline();
            if (outline.length >= 2) {
                ctx.moveTo(outline[0][0], outline[0][1]);
                for (let i = 1; i < outline.length; i++) {
                    ctx.lineTo(outline[i][0], outline[i][1]);
                }
                ctx.closePath();
                hit = ctx.isPointInPath(screenX, screenY);
            }
        } else {
            if (this.points.length >= 2) {
                ctx.moveTo(this.points[0][0], this.points[0][1]);
                for (let i = 1; i < this.points.length; i++) {
                    ctx.lineTo(this.points[i][0], this.points[i][1]);
                }
                ctx.lineWidth = this.style.strokeWidth;
                hit = ctx.isPointInStroke(screenX, screenY);
            }
        }
        ctx.restore();
        return hit;
    }

    /** Render this stroke onto a Canvas 2D context. */
    render(ctx: CanvasRenderingContext2D): void {
        if (this.style.strokePattern === 'solid') {
            const profile = this.getProfile();
            const forceUniform = this.isFromShape || this.tool === 'highlighter';
            const strategy = forceUniform ? undefined : profile?.strategy;

            if (strategy === 'softpaint' || strategy === 'pencil-textured') {
                this.renderDabs(ctx, strategy, profile);
                return;
            }

            const outline = this.getOutline();
            if (outline.length < 2) return;

            ctx.save();
            this.transform.applyToContext(ctx);

            if (this.isHighlight) {
                ctx.globalCompositeOperation = 'multiply';
            }

            ctx.fillStyle = hexToRgba(this.style.strokeColor, this.style.opacity);

            ctx.beginPath();
            ctx.moveTo(outline[0][0], outline[0][1]);

            for (let i = 1; i < outline.length; i++) {
                ctx.lineTo(outline[i][0], outline[i][1]);
            }

            ctx.closePath();
            ctx.fill();
            ctx.restore();
        } else {
            if (this.points.length < 2) return;

            const w = this.style.strokeWidth;
            const pat = this.style.strokePattern;

            const dashConfig: Record<string, number[]> = {
                solid: [],
                dashed: [w * 4, w * 2],
                dotted: [w, w * 2.5],
            };

            ctx.save();
            this.transform.applyToContext(ctx);
            ctx.strokeStyle = this.style.strokeColor;
            ctx.lineWidth = w;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.globalAlpha = this.style.opacity;
            ctx.setLineDash(dashConfig[pat] || []);

            ctx.beginPath();
            ctx.moveTo(this.points[0][0], this.points[0][1]);
            for (let i = 1; i < this.points.length; i++) {
                ctx.lineTo(this.points[i][0], this.points[i][1]);
            }
            ctx.stroke();

            ctx.restore();
        }
    }

    /**
     * Paint the soft brush tip dab cloud for softpaint.
     * Uses a pre-rendered offscreen radial gradient canvas tip to ensure smooth edges
     * and 60 FPS performance.
     */
    private renderDabs(ctx: CanvasRenderingContext2D, strategy: 'softpaint' | 'pencil-textured', profile: ReturnType<Stroke['getProfile']>): void {
        const dabs = this.getDabs();
        if (dabs.length === 0) return;

        ctx.save();
        this.transform.applyToContext(ctx);
        if (this.isHighlight) ctx.globalCompositeOperation = 'multiply';

        const globalOpacity = this.style.opacity;

        if (strategy === 'softpaint') {
            const hasDocument = typeof document !== 'undefined';
            const brushCanvas = hasDocument ? document.createElement('canvas') : null;

            if (brushCanvas) {
                const bCtx = brushCanvas.getContext('2d')!;
                const grad = bCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
                grad.addColorStop(0, this.style.strokeColor);
                grad.addColorStop(1, hexToRgba(this.style.strokeColor, 0));
                bCtx.fillStyle = grad;
                bCtx.fillRect(0, 0, 64, 64);

                for (const dab of dabs) {
                    if (dab.r <= 0) continue;
                    ctx.globalAlpha = Math.min(1, dab.alpha * globalOpacity);
                    ctx.drawImage(brushCanvas, dab.x - dab.r, dab.y - dab.r, dab.r * 2, dab.r * 2);
                }
            } else {
                for (const dab of dabs) {
                    if (dab.r <= 0) continue;
                    ctx.beginPath();
                    ctx.arc(dab.x, dab.y, dab.r, 0, Math.PI * 2);
                    ctx.fillStyle = hexToRgba(this.style.strokeColor, Math.min(1, dab.alpha * globalOpacity));
                    ctx.fill();
                }
            }
        } else if (strategy === 'pencil-textured') {
            // Group dabs into 3 opacity buckets for rendering.
            // This drops the number of canvas path draws to exactly 3 operations, keeping performance high.
            const opacities = [0.08, 0.3, 0.65];
            const buckets: StrokeDab[][] = [[], [], []];

            for (const dab of dabs) {
                // dab.alpha contains the local point's pressure
                if (dab.alpha < 0.35) {
                    buckets[0].push(dab);
                } else if (dab.alpha < 0.7) {
                    buckets[1].push(dab);
                } else {
                    buckets[2].push(dab);
                }
            }

            for (let b = 0; b < 3; b++) {
                const list = buckets[b];
                if (list.length === 0) continue;

                ctx.globalAlpha = Math.min(1, opacities[b] * globalOpacity);
                ctx.fillStyle = this.style.strokeColor;
                ctx.beginPath();
                for (const dab of list) {
                    if (dab.r <= 0) continue;
                    // Draw tiny rectangles as graphite flakes (very fast and organic)
                    ctx.rect(dab.x - dab.r, dab.y - dab.r, dab.r * 2, dab.r * 2);
                }
                ctx.fill();
            }
        }

        ctx.restore();
        void profile; // reserved for future per-profile dab tuning hooks
    }

    /** Serialize to JSON-safe object. */
    serialize(): StrokeData {
        return {
            type: 'stroke',
            id: this.id,
            tool: this.tool,
            style: { ...this.style },
            transform: this.transform.serialize(),
            points: this.points.map(pt => [...pt]),
            timestamp: this.timestamp,
            isSlicedStart: this.isSlicedStart,
            isSlicedEnd: this.isSlicedEnd,
            isFromShape: this.isFromShape,
            pointGeometryLocked: this.pointGeometryLocked,
            smoothingLevel: this.smoothingLevel,
            url: this.url,
            linkGroupId: this.linkGroupId,
            profileId: this.profileId,
        };
    }

    /** Deserialize from JSON data. */
    static deserialize(data: any): Stroke {
        const style = migrateStrokeStyle(data);
        const tool = (data.tool === 'highlighter' || data.isHighlight) ? 'highlighter' : 'pen';
        const stroke = new Stroke(data.id, tool, style);
        stroke.transform = Transform.deserialize(data.transform);
        stroke.points = data.points ?? [];
        stroke.timestamp = data.timestamp ?? Date.now();
        stroke.isSlicedStart = data.isSlicedStart;
        stroke.isSlicedEnd = data.isSlicedEnd;
        stroke.isFromShape = data.isFromShape;
        stroke.pointGeometryLocked = data.pointGeometryLocked;
        stroke.smoothingLevel = data.smoothingLevel ?? 0.3;
        stroke.url = data.url;
        stroke.linkGroupId = data.linkGroupId;
        stroke.profileId = data.profileId;
        return stroke;
    }
}
