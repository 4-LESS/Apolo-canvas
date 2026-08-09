import { expect, test } from 'vitest';
import { InkDocument } from './InkDocument';
import { Stroke } from './Stroke';

test('insertPage at index creates a blank page with unique ID and shifts existing pages', () => {
    const doc = new InkDocument();
    
    // 1. Create two pages
    const page1 = doc.addPage();
    const page2 = doc.addPage();
    
    expect(doc.pageCount).toBe(2);
    
    // 2. Draw a stroke on page 1 (which is at index 0)
    const stroke = new Stroke('s1', 'pen');
    stroke.addPoint(10, 10, 0.5);
    stroke.addPoint(20, 20, 0.5);
    page1.addElement(stroke);
    
    expect(page1.elements.length).toBe(1);
    expect(page2.elements.length).toBe(0);
    
    // 3. Insert a new page at index 1 (shifting the old page 2 to index 2)
    const newPage = doc.insertPage(1);
    
    expect(doc.pageCount).toBe(3);
    expect(doc.getPageByIndex(0)).toBe(page1);
    expect(doc.getPageByIndex(1)).toBe(newPage);
    expect(doc.getPageByIndex(2)).toBe(page2);
    
    // 4. Assert that the newly inserted page is blank (elements.length === 0)
    expect(newPage.elements.length).toBe(0);
    
    // 5. Assert that the page's ID differs from both existing pages
    expect(newPage.id).not.toBe(page1.id);
    expect(newPage.id).not.toBe(page2.id);
});

test('addPage and insertPage can accept custom page IDs', () => {
    const doc = new InkDocument();
    const customPageId = 'custom-uuid-123';
    const page = doc.addPage(undefined, customPageId);
    expect(page.id).toBe(customPageId);
    expect(doc.getPage(customPageId)).toBe(page);

    const insertedPageId = 'custom-uuid-456';
    const insertedPage = doc.insertPage(1, undefined, insertedPageId);
    expect(insertedPage.id).toBe(insertedPageId);
    expect(doc.getPage(insertedPageId)).toBe(insertedPage);
});
