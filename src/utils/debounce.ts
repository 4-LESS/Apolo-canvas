/**
 * Creates a debounced version of a function that delays invocation
 * until `ms` milliseconds have elapsed since the last call.
 * The returned function has a `.cancel()` method.
 */
export function debounce<T extends (...args: any[]) => any>(
    fn: T,
    ms: number
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const debounced = (...args: Parameters<T>): void => {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            timeoutId = null;
            fn(...args);
        }, ms);
    };

    debounced.cancel = (): void => {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    };

    return debounced;
}
