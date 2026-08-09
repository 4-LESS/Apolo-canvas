import { StrokePattern } from '../../model/ElementStyle';

/** Single source of truth for stroke-pattern metadata and icons. */
export const PATTERNS: { id: StrokePattern; title: string; svg: string }[] = [
    { id: 'solid', title: 'Solid', svg: '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><line x1="4" y1="12" x2="20" y2="12" stroke-linecap="round"/></svg>' },
    { id: 'dashed', title: 'Dashed', svg: '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><line x1="4" y1="12" x2="20" y2="12" stroke-dasharray="4,4" stroke-linecap="round"/></svg>' },
    { id: 'dotted', title: 'Dotted', svg: '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><line x1="4" y1="12" x2="20" y2="12" stroke-dasharray="1,4" stroke-linecap="round"/></svg>' }
];

export const PATTERN_SVGS: Record<StrokePattern, string> = Object.fromEntries(
    PATTERNS.map((p) => [p.id, p.svg])
) as Record<StrokePattern, string>;
