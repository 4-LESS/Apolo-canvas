import { PenProfile } from './PenProfile';

const FOUNTAIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v10M12 12c-2 0-3.5 1.5-3.5 4V22h7v-6c0-2.5-1.5-4-3.5-4z"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>`;
const CALLIGRAPHY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 21h12M15 3l3 3L9 15H6v-3L15 3z"/><line x1="14" y1="4" x2="17" y2="7"/></svg>`;
const SOFTPAINT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 3c-1.5 0-3 1.5-4 3L4 16v4h4L18 10c1.5-1 3-2.5 3-4s-1.5-3-3-3z"/><path d="M14 6l4 4M7 15l2 2"/></svg>`;
const BALLPOINT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 3 7 7L10 21H3v-7L14 3z"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>`;
const PENCIL_TEXTURED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4M4 17l3 3"/></svg>`;
const HIGHLIGHTER_ROUND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3" width="12" height="14" rx="6" ry="6"/><line x1="9" y1="17" x2="9" y2="21"/><line x1="15" y1="17" x2="15" y2="21"/><line x1="9" y1="21" x2="15" y2="21"/></svg>`;
const HIGHLIGHTER_SQUARE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3" width="12" height="14" rx="2" ry="2"/><line x1="9" y1="17" x2="9" y2="21"/><line x1="15" y1="17" x2="15" y2="21"/><line x1="9" y1="21" x2="15" y2="21"/></svg>`;

export const PEN_PROFILES: PenProfile[] = [
    {
        id: 'pen-rounded',
        name: 'Fountain Pen',
        toolType: 'pen',
        strategy: 'fountain',
        baseWidth: 4,
        baseSmoothing: 0.25,
        iconSvg: FOUNTAIN_SVG,
        pattern: 'solid',
        tipShape: 'round'
    },
    {
        id: 'pen-calligraphy',
        name: 'Calligraphy Pen',
        toolType: 'pen',
        strategy: 'calligraphy',
        baseWidth: 5,
        baseSmoothing: 0.2,
        iconSvg: CALLIGRAPHY_SVG,
        pattern: 'solid',
        tipShape: 'chisel'
    },
    {
        id: 'pen-painting',
        name: 'Painting Stroke',
        toolType: 'pen',
        strategy: 'softpaint',
        baseWidth: 12,
        baseSmoothing: 0.45,
        iconSvg: SOFTPAINT_SVG,
        pattern: 'solid',
        tipShape: 'round'
    },
    {
        id: 'pen-ballpoint',
        name: 'Ballpoint Pen',
        toolType: 'pen',
        strategy: 'ballpoint',
        baseWidth: 3.5,
        baseSmoothing: 0.2,
        iconSvg: BALLPOINT_SVG,
        pattern: 'solid',
        tipShape: 'round'
    },
    {
        id: 'pen-pencil',
        name: 'Pencil',
        toolType: 'pen',
        strategy: 'pencil-textured',
        baseWidth: 1.5,
        baseSmoothing: 0.1,
        iconSvg: PENCIL_TEXTURED_SVG,
        pattern: 'solid',
        tipShape: 'round'
    },
    {
        id: 'highlighter-round',
        name: 'Rounded Highlighter',
        toolType: 'highlighter',
        strategy: 'ballpoint',
        baseWidth: 16,
        baseSmoothing: 0.3,
        iconSvg: HIGHLIGHTER_ROUND_SVG,
        pattern: 'solid',
        tipShape: 'round'
    },
    {
        id: 'highlighter-square',
        name: 'Natural Highlighter',
        toolType: 'highlighter',
        strategy: 'ballpoint',
        baseWidth: 18,
        baseSmoothing: 0.35,
        iconSvg: HIGHLIGHTER_SQUARE_SVG,
        pattern: 'solid',
        tipShape: 'square'
    }
];

export class PenProfileRegistry {
    private static profiles: Map<string, PenProfile> = new Map(
        PEN_PROFILES.map(p => [p.id, p])
    );

    static getAll(): PenProfile[] {
        return PEN_PROFILES;
    }

    static get(id: string): PenProfile | undefined {
        return this.profiles.get(id);
    }
}

