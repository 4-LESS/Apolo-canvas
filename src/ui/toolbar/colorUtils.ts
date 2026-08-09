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
