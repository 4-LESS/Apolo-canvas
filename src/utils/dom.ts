export interface ElementSize {
    width: number;
    height: number;
}

export function getElementCssSize(
    el: HTMLElement,
    fallbackWidth: number,
    fallbackHeight: number
): ElementSize {
    const rect = typeof el.getBoundingClientRect === 'function'
        ? el.getBoundingClientRect()
        : null;

    const width = rect?.width || el.clientWidth || el.offsetWidth || fallbackWidth;
    const height = rect?.height || el.clientHeight || el.offsetHeight || fallbackHeight;

    return { width, height };
}

export function getElementCssWidth(el: HTMLElement, fallbackWidth: number): number {
    const rect = typeof el.getBoundingClientRect === 'function'
        ? el.getBoundingClientRect()
        : null;

    return rect?.width || el.clientWidth || el.offsetWidth || fallbackWidth;
}

// Class helpers tolerant of both real DOM elements and the Obsidian-style
// mocks used in tests (which expose addClass/removeClass/toggleClass methods).

export function addClass(el: HTMLElement, cls: string): void {
    if (!el) return;
    if (typeof (el as any).addClass === 'function') (el as any).addClass(cls);
    else if (el.classList) el.classList.add(cls);
}

export function removeClass(el: HTMLElement, cls: string): void {
    if (!el) return;
    if (typeof (el as any).removeClass === 'function') (el as any).removeClass(cls);
    else if (el.classList) el.classList.remove(cls);
}

export function toggleClass(el: HTMLElement, cls: string, value: boolean): void {
    if (!el) return;
    if (typeof (el as any).toggleClass === 'function') (el as any).toggleClass(cls, value);
    else if (el.classList && typeof el.classList.toggle === 'function') el.classList.toggle(cls, value);
    else if (el.classList) value ? el.classList.add(cls) : el.classList.remove(cls);
}

export function hasClass(el: HTMLElement, cls: string): boolean {
    if (!el) return false;
    if (typeof (el as any).hasClass === 'function') return (el as any).hasClass(cls);
    return !!el.classList?.contains(cls);
}
