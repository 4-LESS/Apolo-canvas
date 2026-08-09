import { StrokePattern } from './ElementStyle';

export type RenderingStrategy = 'ballpoint' | 'fountain' | 'calligraphy' | 'softpaint' | 'pencil-textured';

export interface PenProfile {
    id: string;
    name: string;
    toolType: 'pen' | 'highlighter';
    strategy: RenderingStrategy;
    baseWidth: number;
    baseSmoothing: number;
    iconSvg: string; // Inline SVG string data
    isLinearOnly?: boolean;
    tipShape?: 'round' | 'square' | 'chisel';
    pattern?: StrokePattern;
}

