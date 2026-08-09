/**
 * Convert a hex color string to an rgba() CSS string.
 * Supports #RGB, #RRGGBB, and #RRGGBBAA formats.
 */
export function hexToRgba(hex: string, opacity: number): string {
    let r = 0,
        g = 0,
        b = 0,
        alpha = Math.max(0, Math.min(1, opacity));

    const h = hex.replace('#', '');

    if (h.length === 3) {
        r = parseInt(h[0] + h[0], 16);
        g = parseInt(h[1] + h[1], 16);
        b = parseInt(h[2] + h[2], 16);
    } else if (h.length >= 6) {
        r = parseInt(h.substring(0, 2), 16);
        g = parseInt(h.substring(2, 4), 16);
        b = parseInt(h.substring(4, 6), 16);
        if (h.length >= 8) {
            alpha *= parseInt(h.substring(6, 8), 16) / 255;
            alpha = Number(alpha.toFixed(3));
        }
    }

    return `rgba(${r},${g},${b},${alpha})`;
}

/** Validate a hex color string. */
export function isValidHex(hex: string): boolean {
    return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(hex);
}

/**
 * Resolves a color string, dynamically resolving Obsidian CSS variables like `--interactive-accent`
 * if they are used, and falling back appropriately. Supports applying a custom opacity.
 */
export function resolveColor(colorStr: string, defaultOpacity: number = 0.25): string {
    if (!colorStr) {
        colorStr = 'rgba(var(--interactive-accent-rgb), 0.25)';
    }

    // If it's a CSS variable or contains one (like var(--interactive-accent))
    if (colorStr.includes('var(')) {
        // Try to parse the variable name
        const varMatch = colorStr.match(/var\((--[^)]+)\)/);
        if (varMatch) {
            const varName = varMatch[1].trim();
            if (typeof window !== 'undefined' && typeof document !== 'undefined') {
                const bodyStyle = getComputedStyle(document.body);
                const resolved = bodyStyle.getPropertyValue(varName).trim();
                if (resolved) {
                    // If the resolved variable is a hex color (e.g. #735ced)
                    if (resolved.startsWith('#')) {
                        return hexToRgba(resolved, defaultOpacity);
                    }
                    // If it is already an rgb/rgba color
                    const rgbMatch = resolved.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)$/);
                    if (rgbMatch) {
                        return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${defaultOpacity})`;
                    }
                    // If it's just RGB channels (like "115, 92, 237")
                    if (/^\d+,\s*\d+,\s*\d+$/.test(resolved)) {
                        return `rgba(${resolved}, ${defaultOpacity})`;
                    }
                }
            }
        }
        
        // If we couldn't resolve the specific variable, try fallback variables on body
        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
            const bodyStyle = getComputedStyle(document.body);
            const accentRgb = bodyStyle.getPropertyValue('--interactive-accent-rgb').trim();
            if (accentRgb) {
                return `rgba(${accentRgb}, ${defaultOpacity})`;
            }
            const accentHex = bodyStyle.getPropertyValue('--interactive-accent').trim();
            if (accentHex && accentHex.startsWith('#')) {
                return hexToRgba(accentHex, defaultOpacity);
            }
        }
        
        // Hard fallback to a nice purple/blue accent color at 25% transparency
        return `rgba(115, 92, 237, ${defaultOpacity})`;
    }

    return colorStr;
}

/**
 * Converts r, g, b channel values to a standard hexadecimal color string.
 */
export function rgbToHex(r: number, g: number, b: number): string {
    const clamp = (val: number) => Math.max(0, Math.min(255, val));
    const toHex = (val: number) => clamp(val).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Dynamically resolves the active Obsidian theme accent color as a standard hexadecimal color string.
 * Supports fallback to custom defaults.
 */
export function getThemeAccentHex(): string {
    if (typeof document === 'undefined') return '#735ced';
    const bodyStyle = getComputedStyle(document.body);
    let accent = bodyStyle.getPropertyValue('--interactive-accent').trim();
    if (!accent) {
        const rgbChannels = bodyStyle.getPropertyValue('--interactive-accent-rgb').trim();
        if (rgbChannels) {
            const parts = rgbChannels.split(',').map(p => parseInt(p.trim(), 10));
            if (parts.length >= 3 && !parts.some(isNaN)) {
                return rgbToHex(parts[0], parts[1], parts[2]);
            }
        }
    }
    if (accent.startsWith('#')) {
        return accent;
    }
    const rgbMatch = accent.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbMatch) {
        return rgbToHex(parseInt(rgbMatch[1], 10), parseInt(rgbMatch[2], 10), parseInt(rgbMatch[3], 10));
    }
    return '#735ced';
}

/** Default ink color palette — curated for academic note-taking. */
export const INK_COLORS: string[] = [
    '#1a1a2e', // Deep navy (default)
    '#e94560', // Coral red
    '#0f3460', // Royal blue
    '#533483', // Purple
    '#2b6cb0', // Medium blue
    '#2d6a4f', // Forest green
    '#d90429', // Bright red
    '#006d77', // Teal
    '#e9c46a', // Gold
    '#264653', // Dark teal
];

/**
 * Computes the link background color based on the plugin settings.
 */
export function getLinkBackgroundColor(settings?: any): string {
    if (!settings) {
        return 'rgba(115, 92, 237, 0.25)';
    }
    const mode = settings.linkHighlightColorMode ?? 'theme';
    const opacity = settings.linkBackgroundOpacity ?? 0.25;
    
    if (mode === 'theme') {
        const themeBg = settings.linkBackgroundColor || 'rgba(var(--interactive-accent-rgb), 0.25)';
        return resolveColor(themeBg, opacity);
    } else {
        const customBg = settings.linkCustomBackgroundColor || '#735ced';
        return hexToRgba(customBg, opacity);
    }
}

const pencilPatternCache = new Map<string, CanvasPattern>();

function mulberry32(a: number) {
    return function() {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function getPencilCanvasTextureElement(color: string): HTMLCanvasElement {
    if (typeof document === 'undefined') {
        // Return dummy canvas object for headless Node environment tests
        return {
            width: 8,
            height: 8,
        } as any;
    }
    
    const canvas = document.createElement('canvas');
    const size = 128;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        // Parse the color's RGB components
        let r = 0, g = 0, b = 0, a = 1.0;
        const h = color.replace('#', '');
        if (h.length === 3) {
            r = parseInt(h[0] + h[0], 16);
            g = parseInt(h[1] + h[1], 16);
            b = parseInt(h[2] + h[2], 16);
        } else if (h.length >= 6) {
            r = parseInt(h.substring(0, 2), 16);
            g = parseInt(h.substring(2, 4), 16);
            b = parseInt(h.substring(4, 6), 16);
            if (h.length >= 8) {
                a = parseInt(h.substring(6, 8), 16) / 255;
            }
        }

        // Generate a deterministic 32x32 noise grid so paper tooth is consistent
        const rand = mulberry32(42); // Seeded random generator
        const noiseGrid: number[][] = [];
        for (let gy = 0; gy < 32; gy++) {
            noiseGrid[gy] = [];
            for (let gx = 0; gx < 32; gx++) {
                noiseGrid[gy][gx] = rand();
            }
        }

        const imgData = ctx.createImageData(size, size);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const i = (y * size + x) * 4;
                
                // Map to the 32x32 grid with toroidal wrapping for a perfectly seamless texture
                const gx = (x / size) * 32;
                const gy = (y / size) * 32;
                const x0 = Math.floor(gx);
                const y0 = Math.floor(gy);
                const x1 = (x0 + 1) % 32;
                const y1 = (y0 + 1) % 32;
                const tx = gx - x0;
                const ty = gy - y0;
                
                const v00 = noiseGrid[y0][x0];
                const v10 = noiseGrid[y0][x1];
                const v01 = noiseGrid[y1][x0];
                const v11 = noiseGrid[y1][x1];
                
                const vx0 = v00 * (1 - tx) + v10 * tx;
                const vx1 = v01 * (1 - tx) + v11 * tx;
                const noiseVal = vx0 * (1 - ty) + vx1 * ty; // Bilinearly smoothed noise
                
                // Generate ribbed lines to mimic organic paper mesh / sketchbook texture
                // Periods are 8 and 16 pixels (divisors of 128) to ensure seamlessness
                const ribH = Math.sin(y * (2 * Math.PI / 8.0));
                const ribV = Math.sin(x * (2 * Math.PI / 16.0));
                const ribVal = 0.5 + 0.3 * ribH + 0.2 * ribV;
                
                // Blend 65% low-frequency random noise with 35% ribbed paper ridges
                let combined = noiseVal * 0.65 + ribVal * 0.35;
                
                // Contrast curve: push valleys down to simulate graphite catching on peaks
                combined = Math.pow(combined, 1.3);
                
                imgData.data[i] = r;
                imgData.data[i + 1] = g;
                imgData.data[i + 2] = b;
                
                // Smooth texture alpha mapping: valleys are soft, peaks are darker, no harsh 100% transparent/opaque pixels
                imgData.data[i + 3] = Math.floor(255 * a * (0.15 + combined * 0.7));
            }
        }
        ctx.putImageData(imgData, 0, 0);
    }
    return canvas;
}

export function getPencilPattern(ctx: CanvasRenderingContext2D, color: string): CanvasPattern | null {
    if (pencilPatternCache.has(color)) {
        return pencilPatternCache.get(color)!;
    }
    const texture = getPencilCanvasTextureElement(color);
    const pattern = ctx.createPattern(texture, 'repeat');
    if (pattern) {
        pencilPatternCache.set(color, pattern);
    }
    return pattern;
}


