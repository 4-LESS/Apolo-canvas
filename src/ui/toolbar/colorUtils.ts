export interface ParsedColor {
    rgb: string;
    alpha: number;
}

export function parseColor(color: string): ParsedColor {
    if (!color) return { rgb: '#000000', alpha: 100 };
    let clean = color.trim();
    if (clean.startsWith('#')) clean = clean.substring(1);

    if (clean.length === 8) {
        return {
            rgb: `#${clean.substring(0, 6)}`,
            alpha: Math.round((parseInt(clean.substring(6, 8), 16) / 255) * 100)
        };
    }
    if (clean.length === 6) return { rgb: `#${clean}`, alpha: 100 };
    if (clean.length === 3) {
        return {
            rgb: `#${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`,
            alpha: 100
        };
    }

    const rgbaMatch = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/i);
    if (rgbaMatch) {
        const r = parseInt(rgbaMatch[1], 10);
        const g = parseInt(rgbaMatch[2], 10);
        const b = parseInt(rgbaMatch[3], 10);
        const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1;
        const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
        return { rgb: hex, alpha: Math.round(a * 100) };
    }

    return { rgb: '#000000', alpha: 100 };
}

export function serializeColor(rgb: string, alphaPercent: number, _isHighlighter: boolean): string {
    let cleanRgb = rgb.startsWith('#') ? rgb.substring(1) : rgb;
    if (cleanRgb.length === 8) {
        cleanRgb = cleanRgb.substring(0, 6);
    }
    if (cleanRgb.length === 3) {
        cleanRgb = `${cleanRgb[0]}${cleanRgb[0]}${cleanRgb[1]}${cleanRgb[1]}${cleanRgb[2]}${cleanRgb[2]}`;
    }
    const alpha = Math.max(0, Math.min(100, alphaPercent ?? 100));
    const alphaHex = Math.round((alpha / 100) * 255).toString(16).padStart(2, '0');
    return `#${cleanRgb}${alphaHex}`.toUpperCase();
}

// ── HSV / RGB conversions (used by the color picker) ─────────────────────

export function hexToHsv(hex: string): { h: number; s: number; v: number } {
    let clean = hex.trim();
    if (clean.startsWith('#')) clean = clean.substring(1);
    if (clean.length === 8) clean = clean.substring(0, 6);
    if (clean.length === 3) {
        clean = `${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`;
    }
    if (clean.length !== 6) {
        return { h: 0, s: 0, v: 0 };
    }

    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;

    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;

    if (max !== min) {
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            case b:
                h = (r - g) / d + 4;
                break;
        }
        h = h * 60;
    }

    return { h: Math.round(h), s, v };
}

export function hsvToHex(h: number, s: number, v: number): string {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;

    let r = 0, g = 0, b = 0;
    if (h >= 0 && h < 60) {
        r = c; g = x; b = 0;
    } else if (h >= 60 && h < 120) {
        r = x; g = c; b = 0;
    } else if (h >= 120 && h < 180) {
        r = 0; g = c; b = x;
    } else if (h >= 180 && h < 240) {
        r = 0; g = x; b = c;
    } else if (h >= 240 && h < 300) {
        r = x; g = 0; b = c;
    } else if (h >= 300 && h <= 360) {
        r = c; g = 0; b = x;
    }

    const rHex = Math.round((r + m) * 255).toString(16).padStart(2, '0');
    const gHex = Math.round((g + m) * 255).toString(16).padStart(2, '0');
    const bHex = Math.round((b + m) * 255).toString(16).padStart(2, '0');

    return `#${rHex}${gHex}${bHex}`.toUpperCase();
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
    let clean = hex.trim();
    if (clean.startsWith('#')) clean = clean.substring(1);
    if (clean.length === 8) clean = clean.substring(0, 6);
    if (clean.length === 3) {
        clean = `${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`;
    }
    return {
        r: parseInt(clean.substring(0, 2), 16),
        g: parseInt(clean.substring(2, 4), 16),
        b: parseInt(clean.substring(4, 6), 16)
    };
}

/** Determines whether a hex color is light or dark for icon-contrast decisions. */
export function isLightColor(hex: string): boolean {
    let clean = hex.trim();
    if (clean.startsWith('#')) clean = clean.substring(1);
    if (clean.length >= 6) {
        const r = parseInt(clean.substring(0, 2), 16);
        const g = parseInt(clean.substring(2, 4), 16);
        const b = parseInt(clean.substring(4, 6), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 140;
    }
    return false;
}

export function isColorMatch(styleBg: string, targetHex: string): boolean {
    const left = parseRgba(styleBg);
    const right = parseRgba(targetHex);
    if (!left || !right) return false;
    return left.r === right.r && left.g === right.g && left.b === right.b && Math.abs(left.a - right.a) < 0.01;
}

function parseRgba(input: string): { r: number; g: number; b: number; a: number } | null {
    if (!input) return null;
    const trimmed = input.trim().toLowerCase();
    const hex = trimmed.replace(/^#/, '');

    if (/^[0-9a-f]{3}$/.test(hex)) {
        return {
            r: parseInt(hex[0] + hex[0], 16),
            g: parseInt(hex[1] + hex[1], 16),
            b: parseInt(hex[2] + hex[2], 16),
            a: 1
        };
    }
    if (/^[0-9a-f]{6}$/.test(hex)) {
        return {
            r: parseInt(hex.substring(0, 2), 16),
            g: parseInt(hex.substring(2, 4), 16),
            b: parseInt(hex.substring(4, 6), 16),
            a: 1
        };
    }
    if (/^[0-9a-f]{8}$/.test(hex)) {
        return {
            r: parseInt(hex.substring(0, 2), 16),
            g: parseInt(hex.substring(2, 4), 16),
            b: parseInt(hex.substring(4, 6), 16),
            a: parseInt(hex.substring(6, 8), 16) / 255
        };
    }

    const rgbaMatch = trimmed.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i);
    if (!rgbaMatch) return null;
    return {
        r: parseInt(rgbaMatch[1], 10),
        g: parseInt(rgbaMatch[2], 10),
        b: parseInt(rgbaMatch[3], 10),
        a: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1
    };
}
