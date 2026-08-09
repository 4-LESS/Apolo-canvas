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
