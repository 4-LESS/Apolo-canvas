import { expect, test, describe, beforeAll, afterAll } from 'vitest';
import { hexToRgba, resolveColor, getLinkBackgroundColor } from './color';

describe('color utilities', () => {
    test('hexToRgba converts colors correctly', () => {
        expect(hexToRgba('#ff0000', 0.5)).toBe('rgba(255,0,0,0.5)');
        expect(hexToRgba('#00ff00', 0.25)).toBe('rgba(0,255,0,0.25)');
        expect(hexToRgba('#fff', 1)).toBe('rgba(255,255,255,1)');
        expect(hexToRgba('#ff000080', 1)).toBe('rgba(255,0,0,0.502)');
    });

    test('resolveColor handles non-CSS variables directly', () => {
        expect(resolveColor('rgba(255, 0, 0, 0.5)')).toBe('rgba(255, 0, 0, 0.5)');
        expect(resolveColor('#123456')).toBe('#123456');
    });

    describe('with DOM variables mocked', () => {
        let originalWindow: any;
        let originalDocument: any;

        beforeAll(() => {
            originalWindow = global.window;
            originalDocument = global.document;

            // Mock window and document
            global.window = {} as any;
            global.document = {} as any;

            // Mock getComputedStyle
            global.getComputedStyle = (() => {
                return {
                    getPropertyValue: (prop: string) => {
                        if (prop === '--interactive-accent') {
                            return '#735ced';
                        }
                        if (prop === '--interactive-accent-rgb') {
                            return '115, 92, 237';
                        }
                        return '';
                    }
                };
            }) as any;
        });

        afterAll(() => {
            global.window = originalWindow;
            global.document = originalDocument;
            delete (global as any).getComputedStyle;
        });

        test('resolveColor resolves CSS variables correctly', () => {
            expect(resolveColor('rgba(var(--interactive-accent-rgb), 0.15)', 0.25)).toBe('rgba(115, 92, 237, 0.25)');
            expect(resolveColor('var(--interactive-accent)', 0.5)).toBe('rgba(115,92,237,0.5)');
        });
    });

    describe('with empty DOM variables', () => {
        let originalWindow: any;
        let originalDocument: any;

        beforeAll(() => {
            originalWindow = global.window;
            originalDocument = global.document;

            // Mock window and document
            global.window = {} as any;
            global.document = {} as any;

            // Mock getComputedStyle returning empty
            global.getComputedStyle = (() => {
                return {
                    getPropertyValue: () => ''
                };
            }) as any;
        });

        afterAll(() => {
            global.window = originalWindow;
            global.document = originalDocument;
            delete (global as any).getComputedStyle;
        });

        test('resolveColor falls back to hardcoded default color when DOM resolution fails', () => {
            expect(resolveColor('rgba(var(--interactive-accent-rgb), 0.15)', 0.25)).toBe('rgba(115, 92, 237, 0.25)');
        });
    });

    describe('getLinkBackgroundColor', () => {
        test('handles undefined settings', () => {
            expect(getLinkBackgroundColor(undefined)).toBe('rgba(115, 92, 237, 0.25)');
        });

        test('handles custom color mode', () => {
            const settings = {
                linkHighlightColorMode: 'custom',
                linkCustomBackgroundColor: '#ff0000',
                linkBackgroundOpacity: 0.5
            };
            expect(getLinkBackgroundColor(settings)).toBe('rgba(255,0,0,0.5)');
        });

        test('handles theme color mode with mocked DOM variables', () => {
            let originalWindow = global.window;
            let originalDocument = global.document;
            global.window = {} as any;
            global.document = {} as any;
            global.getComputedStyle = (() => {
                return {
                    getPropertyValue: (prop: string) => {
                        if (prop === '--interactive-accent') return '#735ced';
                        return '';
                    }
                };
            }) as any;

            const settings = {
                linkHighlightColorMode: 'theme',
                linkBackgroundOpacity: 0.3
            };
            expect(getLinkBackgroundColor(settings)).toBe('rgba(115,92,237,0.3)');

            global.window = originalWindow;
            global.document = originalDocument;
            delete (global as any).getComputedStyle;
        });
    });
});
