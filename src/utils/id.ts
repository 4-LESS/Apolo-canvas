/**
 * Generates a unique element ID.
 * Format: "el-" followed by 8 random hex characters.
 */
export function generateId(): string {
    const bytes = new Uint8Array(4);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = Math.floor(Math.random() * 256);
        }
    }
    const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    return `el-${hex}`;
}

/**
 * Generates a unique block ID.
 * Format: <timestamp-ms>-<5-char-random>
 */
export function generateBlockId(): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 7);
    return `${ts}-${rand}`;
}
