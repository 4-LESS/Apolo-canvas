import { expect, test } from 'vitest';
import { HistoryManager, MoveElementsCommand, DeleteElementsCommand, AddElementsCommand, SortElementsCommand, SplitElementCommand, ChangeUrlCommand } from './HistoryManager';
import { InkPage } from '../model/InkPage';
import { Stroke } from '../model/Stroke';

test('MoveElementsCommand applies and undoes delta', () => {
    const stroke1 = new Stroke('s1', 'pen');
    stroke1.addPoint(10, 10, 1);
    stroke1.addPoint(20, 20, 1);
    
    const cmd = new MoveElementsCommand([stroke1], { x: 5, y: -5 });
    cmd.execute();
    
    expect(stroke1.points[0]).toEqual([15, 5, 1]);
    expect(stroke1.points[1]).toEqual([25, 15, 1]);
    
    cmd.undo();
    
    expect(stroke1.points[0]).toEqual([10, 10, 1]);
    expect(stroke1.points[1]).toEqual([20, 20, 1]);
});

test('DeleteElementsCommand tracks original indices and restores order', () => {
    const page = new InkPage('page1');
    const s1 = new Stroke('s1', 'pen');
    const s2 = new Stroke('s2', 'pen');
    const s3 = new Stroke('s3', 'pen');
    
    page.addElement(s1);
    page.addElement(s2);
    page.addElement(s3);
    
    const cmd = new DeleteElementsCommand(page, ['s1', 's3']);
    cmd.execute();
    
    expect(page.elements.length).toBe(1);
    expect(page.elements[0].id).toBe('s2');
    
    cmd.undo();
    
    expect(page.elements.length).toBe(3);
    expect(page.elements[0].id).toBe('s1');
    expect(page.elements[1].id).toBe('s2');
    expect(page.elements[2].id).toBe('s3');
});

test('AddElementsCommand bulk adds and removes', () => {
    const page = new InkPage('page1');
    const s1 = new Stroke('s1', 'pen');
    const s2 = new Stroke('s2', 'pen');
    
    const cmd = new AddElementsCommand(page, [s1, s2]);
    cmd.execute();
    
    expect(page.elements.length).toBe(2);
    expect(page.elements[0].id).toBe('s1');
    expect(page.elements[1].id).toBe('s2');
    
    cmd.undo();
    
    expect(page.elements.length).toBe(0);
});

test('MoveElementsCommand triggers fullRender on execute and undo', () => {
    const stroke1 = new Stroke('s1', 'pen');
    stroke1.addPoint(10, 10, 1);
    
    let renderCalled = 0;
    const mockRenderer = {
        fullRender() {
            renderCalled++;
        }
    };
    
    const cmd = new MoveElementsCommand([stroke1], { x: 5, y: -5 }, mockRenderer);
    cmd.execute();
    expect(renderCalled).toBe(1);
    
    cmd.undo();
    expect(renderCalled).toBe(2);
});

test('SortElementsCommand reorders elements and can be undone', () => {
    const page = new InkPage('page1');
    const s1 = new Stroke('s1', 'pen');
    const s2 = new Stroke('s2', 'pen');
    const s3 = new Stroke('s3', 'pen');

    page.addElement(s1);
    page.addElement(s2);
    page.addElement(s3);

    const originalOrder = [...page.elements];
    const newOrder = [s2, s3, s1];

    const cmd = new SortElementsCommand(page, originalOrder, newOrder);
    cmd.execute();

    expect(page.elements).toEqual([s2, s3, s1]);

    cmd.undo();

    expect(page.elements).toEqual([s1, s2, s3]);
});

test('SplitElementCommand replaces parent element with children and restores it on undo', () => {
    const page = new InkPage('page1');
    const s1 = new Stroke('s1', 'pen');
    const childA = new Stroke('childA', 'pen');
    const childB = new Stroke('childB', 'pen');
    
    page.addElement(s1);
    
    let renderCalled = 0;
    const mockRenderer = {
        fullRender() {
            renderCalled++;
        }
    };
    
    const cmd = new SplitElementCommand(page, s1, childA, childB, mockRenderer);
    cmd.execute();
    
    expect(page.elements.length).toBe(2);
    expect(page.elements[0].id).toBe('childA');
    expect(page.elements[1].id).toBe('childB');
    expect(renderCalled).toBe(1);
    
    cmd.undo();
    
    expect(page.elements.length).toBe(1);
    expect(page.elements[0].id).toBe('s1');
    expect(renderCalled).toBe(2);
});

test('ChangeUrlCommand sets and restores url and linkGroupId', () => {
    const s1 = new Stroke('s1', 'pen');
    const s2 = new Stroke('s2', 'pen');
    
    const cmd = new ChangeUrlCommand([
        { element: s1, oldUrl: undefined, newUrl: 'url1', oldGroupId: undefined, newGroupId: 'g1' },
        { element: s2, oldUrl: undefined, newUrl: 'url1', oldGroupId: undefined, newGroupId: 'g1' }
    ]);
    
    cmd.execute();
    expect(s1.url).toBe('url1');
    expect((s1 as any).linkGroupId).toBe('g1');
    expect(s2.url).toBe('url1');
    expect((s2 as any).linkGroupId).toBe('g1');
    
    cmd.undo();
    expect(s1.url).toBeUndefined();
    expect((s1 as any).linkGroupId).toBeUndefined();
    expect(s2.url).toBeUndefined();
    expect((s2 as any).linkGroupId).toBeUndefined();
});

test('DeleteElementsCommand clears grouped links and restores on undo', () => {
    const page = new InkPage('page1');
    const s1 = new Stroke('s1', 'pen');
    const s2 = new Stroke('s2', 'pen');
    s1.url = 'url1';
    (s1 as any).linkGroupId = 'g1';
    s2.url = 'url1';
    (s2 as any).linkGroupId = 'g1';
    
    page.addElement(s1);
    page.addElement(s2);
    
    // Deleting s1 should clear s2's link because they share the group g1
    const cmd = new DeleteElementsCommand(page, ['s1']);
    cmd.execute();
    
    expect(page.elements.length).toBe(1);
    expect(page.elements[0].id).toBe('s2');
    expect(s2.url).toBeUndefined();
    expect((s2 as any).linkGroupId).toBeUndefined();
    
    cmd.undo();
    
    expect(page.elements.length).toBe(2);
    expect(s1.url).toBe('url1');
    expect((s1 as any).linkGroupId).toBe('g1');
    expect(s2.url).toBe('url1');
    expect((s2 as any).linkGroupId).toBe('g1');
});

test('SplitElementCommand clears grouped links and restores on undo', () => {
    const page = new InkPage('page1');
    const parent = new Stroke('parent', 'pen');
    const other = new Stroke('other', 'pen');
    const childA = new Stroke('childA', 'pen');
    const childB = new Stroke('childB', 'pen');
    
    parent.url = 'url1';
    (parent as any).linkGroupId = 'g1';
    other.url = 'url1';
    (other as any).linkGroupId = 'g1';
    
    page.addElement(parent);
    page.addElement(other);
    
    // Splitting parent should clear other's link because they share the group g1
    const cmd = new SplitElementCommand(page, parent, childA, childB);
    cmd.execute();
    
    expect(other.url).toBeUndefined();
    expect((other as any).linkGroupId).toBeUndefined();
    
    cmd.undo();
    
    expect(parent.url).toBe('url1');
    expect((parent as any).linkGroupId).toBe('g1');
    expect(other.url).toBe('url1');
    expect((other as any).linkGroupId).toBe('g1');
});

