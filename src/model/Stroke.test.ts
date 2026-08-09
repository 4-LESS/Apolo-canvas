import { expect, test, vi } from 'vitest';
import { Stroke } from './Stroke';
import { Transform } from './Transform';
import { Renderer } from '../engine/Renderer';

let mockGetStrokeOptions: any = null;

vi.mock('perfect-freehand', () => {
    return {
        getStroke: vi.fn((points: any, options: any) => {
            mockGetStrokeOptions = options;
            return [[0, 0], [10, 10]];
        }),
        getStrokePoints: vi.fn((points: any, options: any) => {
            return points.map((p: any) => ({ point: [p[0], p[1]], vector: [1, 0] }));
        })
    };
});

test('Deserialise an old-format stroke JSON (flat fields) produces correct ElementStyle', () => {
    // Legacy format has flat color, size (or width), isHighlight, etc.
    const oldJSON = {
        type: 'stroke',
        id: 's1',
        tool: 'pen',
        color: '#ff0000',
        width: 16,
        isHighlight: true,
        highlightOpacity: 0.5,
        transform: Transform.identity().serialize(),
        points: [[10, 10, 0.5], [20, 20, 0.5]]
    };

    const stroke = Stroke.deserialize(oldJSON as any);
    expect(stroke.style).toBeDefined();
    expect(stroke.style.strokeColor).toBe('#ff0000');
    expect(stroke.style.strokeWidth).toBe(16);
    expect(stroke.style.strokePattern).toBe('solid');
    expect(stroke.style.opacity).toBe(0.5);
    expect(stroke.isHighlight).toBe(true);
});

test('Deserialise a new-format stroke JSON (style block) round-trips correctly', () => {
    const stroke = new Stroke('s2', 'pen', {
        strokeColor: '#00ff00',
        strokeWidth: 3,
        strokePattern: 'dashed',
        opacity: 0.8
    });
    
    const serialized = stroke.serialize();
    expect(serialized.style.strokeColor).toBe('#00ff00');
    expect(serialized.style.strokeWidth).toBe(3);
    expect(serialized.style.strokePattern).toBe('dashed');
    expect(serialized.style.opacity).toBe(0.8);

    const deserialized = Stroke.deserialize(serialized);
    expect(deserialized.style.strokeColor).toBe('#00ff00');
    expect(deserialized.style.strokeWidth).toBe(3);
    expect(deserialized.style.strokePattern).toBe('dashed');
    expect(deserialized.style.opacity).toBe(0.8);
});

test('renderStroke delegates to stroke.render', () => {
    const stroke = new Stroke('s-test', 'pen');
    vi.spyOn(stroke, 'render');
    const ctx = {
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        closePath: vi.fn(),
        fill: vi.fn(),
    } as any;

    const renderer = {
        renderStroke: (Renderer.prototype as any).renderStroke
    };
    renderer.renderStroke(ctx, stroke);
    expect(stroke.render).toHaveBeenCalledWith(ctx);
});

test('Stroke deserialization falls back to defaults if properties missing', () => {
    const data = {
        type: 'stroke',
        id: 's4',
        tool: 'pen',
        transform: Transform.identity().serialize(),
        points: [],
        timestamp: 12345
    };
    
    const deserialized = Stroke.deserialize(data as any);
    expect(deserialized.style).toBeDefined();
    expect(deserialized.style.strokeColor).toBe('#1a1a1a');
    expect(deserialized.style.strokeWidth).toBe(3);
    expect(deserialized.style.strokePattern).toBe('solid');
    expect(deserialized.style.opacity).toBe(1.0);
    expect(deserialized.isHighlight).toBe(false);
});

test('Stroke getOutline passes correct taper options when sliced', () => {
    mockGetStrokeOptions = null;
    const stroke = new Stroke('s5', 'pen');
    stroke.addPoint(0, 0, 0.5);
    stroke.addPoint(10, 10, 0.5);
    stroke.isSlicedStart = true;
    stroke.isSlicedEnd = true;
    
    stroke.getOutline();
    
    expect(mockGetStrokeOptions).toBeDefined();
    expect(mockGetStrokeOptions.start.taper).toBe(0);
    expect(mockGetStrokeOptions.end.taper).toBe(0);
    expect(mockGetStrokeOptions.start.cap).toBe(true);
    expect(mockGetStrokeOptions.end.cap).toBe(true);
    expect(mockGetStrokeOptions.capStart).toBeUndefined();
    expect(mockGetStrokeOptions.capEnd).toBeUndefined();
    expect(mockGetStrokeOptions.simulatePressure).toBe(false);
});

test('Stroke getOutline enforces uniform shape properties when isFromShape is true', () => {
    mockGetStrokeOptions = null;
    const stroke = new Stroke('s5-shape', 'pen');
    stroke.addPoint(0, 0, 0.5);
    stroke.addPoint(10, 10, 0.5);
    stroke.isFromShape = true;
    
    stroke.getOutline();
    
    expect(mockGetStrokeOptions).toBeDefined();
    expect(mockGetStrokeOptions.thinning).toBe(0);
    expect(mockGetStrokeOptions.simulatePressure).toBe(false);
    expect(mockGetStrokeOptions.start.taper).toBe(0);
    expect(mockGetStrokeOptions.end.taper).toBe(0);
});

test('Stroke getOutline enforces uniform properties for highlighter strokes', () => {
    mockGetStrokeOptions = null;
    const stroke = new Stroke('s5-highlighter', 'highlighter');
    stroke.addPoint(0, 0, 0.5);
    stroke.addPoint(10, 10, 0.5);
    
    stroke.getOutline();
    
    expect(mockGetStrokeOptions).toBeDefined();
    expect(mockGetStrokeOptions.thinning).toBe(0);
    expect(mockGetStrokeOptions.simulatePressure).toBe(false);
    expect(mockGetStrokeOptions.start.taper).toBe(0);
    expect(mockGetStrokeOptions.end.taper).toBe(0);
});

test('Stroke getOutline by default uses thinning 0.7 and simulatePressure false', () => {
    mockGetStrokeOptions = null;
    const stroke = new Stroke('s5-default', 'pen');
    stroke.addPoint(0, 0, 0.5);
    stroke.addPoint(10, 10, 0.5);
    
    stroke.getOutline();
    
    expect(mockGetStrokeOptions).toBeDefined();
    expect(mockGetStrokeOptions.thinning).toBe(0.7);
    expect(mockGetStrokeOptions.simulatePressure).toBe(false);
});

test('Stroke getOutline respects custom streamline value', () => {
    mockGetStrokeOptions = null;
    const stroke = new Stroke('s5-streamline', 'pen');
    stroke.smoothingLevel = 0.75;
    stroke.addPoint(0, 0, 0.5);
    stroke.addPoint(10, 10, 0.5);
    
    stroke.getOutline();
    
    expect(mockGetStrokeOptions).toBeDefined();
    expect(mockGetStrokeOptions.streamline).toBe(0.75);
});


test('Stroke preserves isSlicedStart/isSlicedEnd on serialization/deserialization', () => {
    const stroke = new Stroke('s6', 'pen');
    stroke.isSlicedStart = true;
    stroke.isSlicedEnd = true;
    
    const serialized = stroke.serialize();
    expect(serialized.isSlicedStart).toBe(true);
    expect(serialized.isSlicedEnd).toBe(true);
    
    const deserialized = Stroke.deserialize(serialized);
    expect(deserialized.isSlicedStart).toBe(true);
    expect(deserialized.isSlicedEnd).toBe(true);
});

test('Stroke preserves url on serialization/deserialization', () => {
    const stroke = new Stroke('s7', 'pen');
    stroke.url = 'https://google.com';
    
    const serialized = stroke.serialize();
    expect(serialized.url).toBe('https://google.com');
    
    const deserialized = Stroke.deserialize(serialized);
    expect(deserialized.url).toBe('https://google.com');
});

test('Stroke getOutline forces streamline to 0 if pointGeometryLocked is true', () => {
    mockGetStrokeOptions = null;
    const stroke = new Stroke('s8', 'pen');
    stroke.smoothingLevel = 0.75;
    stroke.addPoint(0, 0, 0.5);
    stroke.addPoint(10, 10, 0.5);
    stroke.pointGeometryLocked = true;
    
    stroke.getOutline();
    
    expect(mockGetStrokeOptions).toBeDefined();
    expect(mockGetStrokeOptions.streamline).toBe(0);
    expect(mockGetStrokeOptions.thinning).toBe(0.7);
});

test('Stroke preserves pointGeometryLocked on serialization/deserialization', () => {
    const stroke = new Stroke('s9', 'pen');
    stroke.pointGeometryLocked = true;
    
    const serialized = stroke.serialize();
    expect(serialized.pointGeometryLocked).toBe(true);
    
    const deserialized = Stroke.deserialize(serialized);
    expect(deserialized.pointGeometryLocked).toBe(true);
});

test('Stroke preserves smoothingLevel including 0.0 on serialization/deserialization', () => {
    const stroke = new Stroke('s10', 'pen');
    stroke.smoothingLevel = 0.0;
    
    const serialized = stroke.serialize();
    expect(serialized.smoothingLevel).toBe(0.0);
    
    const deserialized = Stroke.deserialize(serialized);
    expect(deserialized.smoothingLevel).toBe(0.0);
});

test('Stroke preserves profileId on serialization/deserialization', () => {
    const stroke = new Stroke('s11', 'pen');
    stroke.profileId = 'pen-pencil';
    
    const serialized = stroke.serialize();
    expect(serialized.profileId).toBe('pen-pencil');
    
    const deserialized = Stroke.deserialize(serialized);
    expect(deserialized.profileId).toBe('pen-pencil');
});

test('Stroke getOutline respects active strategy options', () => {
    mockGetStrokeOptions = null;
    const stroke = new Stroke('s12', 'pen');
    stroke.profileId = 'pen-calligraphy';
    stroke.addPoint(0, 0, 0.5);
    stroke.addPoint(10, 10, 0.5);
    
    const outline = stroke.getOutline();
    expect(outline).toBeDefined();
    expect(outline.length).toBeGreaterThan(0);

    mockGetStrokeOptions = null;
    const strokeFountain = new Stroke('s13', 'pen');
    strokeFountain.profileId = 'pen-rounded';
    strokeFountain.addPoint(0, 0, 0.5);
    strokeFountain.addPoint(10, 10, 0.5);
    
    strokeFountain.getOutline();
    
    expect(mockGetStrokeOptions).toBeDefined();
    expect(mockGetStrokeOptions.thinning).toBe(0.75); // Fountain strategy default fountainThinning
    expect(mockGetStrokeOptions.simulatePressure).toBe(false); // buildFountainPoints computes velocity pressure, simulatePressure is off
});

test('Stroke softpaint strategy generates correct dabs and renders them', () => {
    const stroke = new Stroke('s-paint', 'pen');
    stroke.profileId = 'pen-painting';
    stroke.addPoint(0, 0, 0.5);
    stroke.addPoint(10, 10, 0.6);
    stroke.addPoint(20, 20, 0.7);

    const ctx = {
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
    } as any;
    
    stroke.render(ctx);
    expect(ctx.fill).toHaveBeenCalled();
});

test('Stroke calligraphy strategy calculates custom outline points', () => {
    const stroke = new Stroke('s-cal', 'pen');
    stroke.profileId = 'pen-calligraphy';
    stroke.addPoint(0, 0, 0.5);
    stroke.addPoint(10, 10, 0.5);
    
    const outline = stroke.getOutline();
    expect(outline.length).toBeGreaterThan(0);
});

test('Stroke pencil strategy density scalability test', () => {
    const stroke = new Stroke('s-pencil-dens', 'pen');
    stroke.profileId = 'pen-pencil';
    stroke.addPoint(0, 0, 1.0);
    stroke.addPoint(50, 0, 1.0); // 50 units long path
    
    // Width 2
    stroke.style.strokeWidth = 2;
    stroke.invalidateCache();
    const dabs2 = (stroke as any).getDabs();
    
    // Width 10
    stroke.style.strokeWidth = 10;
    stroke.invalidateCache();
    const dabs10 = (stroke as any).getDabs();
    
    expect(dabs2.length).toBeGreaterThan(0);
    expect(dabs10.length).toBeGreaterThan(dabs2.length);
    // N_per_node scaling:
    // W=2, P=1 => round(2 * 0.4 * 1) = 1
    // W=10, P=1 => round(10 * 0.4 * 1) = 4
    // Since spacing is fixed at 1.0, node count is constant.
    // Total dots should scale approximately 4x.
    expect(dabs10.length).toBeCloseTo(dabs2.length * 4, 0);
});

test('Stroke pencil strategy determinism test', () => {
    const stroke = new Stroke('s-pencil-det', 'pen');
    stroke.profileId = 'pen-pencil';
    stroke.style.strokeWidth = 3;
    stroke.addPoint(0, 0, 0.5);
    stroke.addPoint(10, 10, 0.8);
    stroke.addPoint(20, 20, 0.6);
    
    const dabs1 = [...(stroke as any).getDabs()];
    expect(dabs1.length).toBeGreaterThan(0);
    
    // Invalidate cache and regenerate
    stroke.invalidateCache();
    const dabs2 = (stroke as any).getDabs();
    
    expect(dabs2.length).toBe(dabs1.length);
    for (let i = 0; i < dabs1.length; i++) {
        expect(dabs2[i].x).toBe(dabs1[i].x);
        expect(dabs2[i].y).toBe(dabs1[i].y);
        expect(dabs2[i].r).toBe(dabs1[i].r);
        expect(dabs2[i].alpha).toBe(dabs1[i].alpha);
    }
});

