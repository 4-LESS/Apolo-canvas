export type StrokePattern = 'solid' | 'dashed' | 'dotted';

export interface ElementStyle {
  strokeColor:   string;        // CSS color string
  strokeWidth:   number;        // px — base width at 100% zoom
  strokePattern: StrokePattern; // default: 'solid'
  fillColor?:    string;        // optional; used by future closed shapes
  opacity:       number;        // 0.0–1.0, default: 1.0
}

export const DEFAULT_STROKE_STYLE: ElementStyle = {
  strokeColor:   '#1a1a1a',
  strokeWidth:   3,
  strokePattern: 'solid',
  opacity:       1.0,
};

export const DEFAULT_HIGHLIGHT_STYLE: ElementStyle = {
  strokeColor:   '#FFE066',
  strokeWidth:   16,
  strokePattern: 'solid',
  opacity:       0.4,
};
