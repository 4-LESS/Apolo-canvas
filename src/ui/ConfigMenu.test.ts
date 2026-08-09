// @ts-nocheck
import { expect, test, vi, beforeEach, afterEach } from 'vitest';
import { Modal } from 'obsidian';

// Mock obsidian before importing ConfigMenu
vi.mock('obsidian', () => {
    return {
        App: class MockApp {},
        Modal: class MockModal {
            app: any;
            contentEl: any;
            static lastInstance: MockModal | null = null;

            constructor(app: any) {
                this.app = app;
                MockModal.lastInstance = this;
                this.contentEl = {
                    empty: vi.fn(),
                    createEl: vi.fn().mockImplementation((tag, attrs) => {
                        const el = {
                            addEventListener: vi.fn(),
                            appendChild: vi.fn(),
                            style: {},
                            focus: vi.fn()
                        };
                        if (tag === 'button' && attrs?.text === 'Delete') {
                            this.deleteBtnEl = el;
                        }
                        return el;
                    }),
                    createDiv: vi.fn().mockImplementation((attrs) => {
                        return {
                            addEventListener: vi.fn(),
                            appendChild: vi.fn(),
                            style: {},
                            createEl: vi.fn().mockImplementation((tag, attrs) => {
                                const el = {
                                    addEventListener: vi.fn(),
                                    appendChild: vi.fn(),
                                    style: {},
                                    focus: vi.fn()
                                };
                                if (tag === 'button' && attrs?.text === 'Delete') {
                                    this.deleteBtnEl = el;
                                }
                                return el;
                            })
                        };
                    })
                };
            }
            open = vi.fn();
            close = vi.fn();
            onOpen() {}
            onClose() {}
        }
    };
});

import { ConfigMenu } from './ConfigMenu';

beforeEach(() => {
    global.document = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    };
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    delete global.document;
});

test('ConfigMenu creation, show/hide, and interaction', () => {
    const mockEl = {
        style: {},
        createEl: vi.fn().mockImplementation((tag, attrs) => {
            return {
                style: {},
                addEventListener: vi.fn(),
                setAttribute: vi.fn(),
                classList: {
                    add: vi.fn(),
                    remove: vi.fn(),
                },
                empty: vi.fn(),
            };
        }),
        empty: vi.fn(),
    };

    const mockMountTarget = {
        createEl: vi.fn().mockReturnValue(mockEl)
    };

    const mockPage = {
        background: 'grid',
        gridSize: 20
    };

    const mockEngine = {
        requestFullRender: vi.fn(),
        requestSave: vi.fn()
    };

    const mockBtn = {
        addClass: vi.fn(),
        removeClass: vi.fn(),
        contains: vi.fn()
    };

    const mockApp = {};

    const menu = new ConfigMenu(mockMountTarget as any, mockEngine as any, mockPage as any, mockBtn as any, mockApp as any);
    expect(mockMountTarget.createEl).toHaveBeenCalledWith('div', { cls: 'ink-config-popover' });

    // Show menu
    menu.show();
    expect(mockEl.style.display).toBe('flex');
    expect(mockBtn.addClass).toHaveBeenCalledWith('is-active');

    // Run timers for click listener
    vi.runAllTimers();
    expect(global.document.addEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function));

    // Hide menu
    menu.hide();
    expect(mockEl.style.display).toBe('none');
    expect(mockBtn.removeClass).toHaveBeenCalledWith('is-active');
    expect(global.document.removeEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function));
});

test('ConfigMenu background selection, Remove from Note, and Delete Ink Data callbacks', () => {
    const bgClickHandlers: Record<string, Function> = {};
    let removeClickHandler: Function | null = null;
    let deleteClickHandler: Function | null = null;

    const createMockElement = (tag: string, attrs: any) => {
        const el = {
            style: {},
            classList: {
                add: vi.fn(),
                remove: vi.fn()
            },
            addEventListener: vi.fn().mockImplementation((event, cb) => {
                if (event === 'click') {
                    if (tag === 'button' && attrs?.cls === 'ink-config-bg-btn') {
                        bgClickHandlers[attrs.text] = cb;
                    } else if (tag === 'button' && attrs?.cls === 'ink-config-remove-btn') {
                        removeClickHandler = cb;
                    } else if (tag === 'button' && attrs?.cls === 'ink-config-delete-btn') {
                        deleteClickHandler = cb;
                    }
                }
            }),
            setAttribute: vi.fn(),
            createEl: vi.fn().mockImplementation((t, a) => {
                return createMockElement(t, a);
            }),
            className: attrs?.cls || '',
        };
        return el;
    };

    const mockEl = {
        style: {},
        createEl: vi.fn().mockImplementation((tag, attrs) => createMockElement(tag, attrs)),
        empty: vi.fn(),
    };

    const mockMountTarget = {
        createEl: vi.fn().mockReturnValue(mockEl)
    };

    const mockPage = { background: 'grid', gridSize: 20 };
    const mockEngine = { requestFullRender: vi.fn(), requestSave: vi.fn() };
    const mockBtn = { addClass: vi.fn(), removeClass: vi.fn() };
    const mockApp = {};

    const menu = new ConfigMenu(mockMountTarget as any, mockEngine as any, mockPage as any, mockBtn as any, mockApp as any);
    
    // Assert background buttons were created and clicked
    expect(bgClickHandlers['Grid']).toBeDefined();
    expect(bgClickHandlers['Lines']).toBeDefined();
    expect(bgClickHandlers['Dots']).toBeDefined();
    expect(bgClickHandlers['Blank']).toBeDefined();

    // Click on Lines
    const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    bgClickHandlers['Lines'](mockEvent);
    expect(mockPage.background).toBe('ruled');
    expect(mockEngine.requestFullRender).toHaveBeenCalled();
    expect(mockEngine.requestSave).toHaveBeenCalled();

    // Verify Remove from Note
    const removeSpy = vi.fn();
    menu.onRemoveFromNote = removeSpy;
    expect(removeClickHandler).toBeDefined();
    removeClickHandler!(mockEvent);
    expect(removeSpy).toHaveBeenCalled();

    // Verify Delete Ink Data and DeleteConfirmModal integration
    const deleteSpy = vi.fn();
    menu.onDeleteInkData = deleteSpy;
    expect(deleteClickHandler).toBeDefined();
    deleteClickHandler!(mockEvent);

    // Assert modal opened
    expect(Modal.lastInstance).not.toBeNull();
    expect(Modal.lastInstance.open).toHaveBeenCalled();

    // Now trigger open and invoke the delete callback
    Modal.lastInstance.onOpen();
    expect(Modal.lastInstance.deleteBtnEl).toBeDefined();

    // Register click event on mock delete button in modal
    let modalDeleteClickHandler: Function | null = null;
    Modal.lastInstance.deleteBtnEl.addEventListener.mock.calls.forEach(([event, cb]) => {
        if (event === 'click') {
            modalDeleteClickHandler = cb;
        }
    });

    expect(modalDeleteClickHandler).not.toBeNull();
    modalDeleteClickHandler!();

    expect(deleteSpy).toHaveBeenCalled();
    expect(Modal.lastInstance.close).toHaveBeenCalled();
});
