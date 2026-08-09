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
function rgbToHex(r: number, g: number, b: number): string {
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
        return resolveColor('rgba(var(--interactive-accent-rgb), 0.25)', opacity);
    } else {
        const customBg = settings.linkCustomBackgroundColor || '#735ced';
        return hexToRgba(customBg, opacity);
    }
}
