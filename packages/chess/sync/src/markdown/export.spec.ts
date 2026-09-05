import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { sanitizeFilename, yDocToMarkdown } from './export.js';

describe('Markdown Exporter', () => {
  it('sanitizes filenames correctly', () => {
    expect(sanitizeFilename('test / new : update ? *')).toBe('test - new - update');
    expect(sanitizeFilename('   ')).toBe('Untitled');
    expect(sanitizeFilename('My Note.md')).toBe('My Note.md');
  });

  it('converts YDoc page with heading, lists, code, and chess pgn to Markdown', () => {
    const doc = new Y.Doc();
    const blocks = doc.getMap('blocks');

    // Root page block
    const pageBlock = new Y.Map();
    pageBlock.set('sys:flavour', 'affine:page');
    const titleText = new Y.Text();
    titleText.insert(0, 'Test Note');
    pageBlock.set('prop:title', titleText);
    const pageChildren = new Y.Array();
    pageChildren.push(['note-1']);
    pageBlock.set('sys:children', pageChildren);
    blocks.set('page-1', pageBlock);

    // Note block
    const noteBlock = new Y.Map();
    noteBlock.set('sys:flavour', 'affine:note');
    const noteChildren = new Y.Array();
    noteChildren.push(['p-1', 'p-2', 'list-1', 'code-1', 'chess-1']);
    noteBlock.set('sys:children', noteChildren);
    blocks.set('note-1', noteBlock);

    // Heading 1
    const p1 = new Y.Map();
    p1.set('sys:flavour', 'affine:paragraph');
    p1.set('prop:type', 'h1');
    const p1Text = new Y.Text();
    p1Text.insert(0, 'Welcome to AFFiNE');
    p1.set('prop:text', p1Text);
    blocks.set('p-1', p1);

    // Paragraph with bold & link
    const p2 = new Y.Map();
    p2.set('sys:flavour', 'affine:paragraph');
    const p2Text = new Y.Text();
    p2Text.insert(0, 'Hello world');
    p2.set('prop:text', p2Text);
    blocks.set('p-2', p2);

    // Todo list
    const list1 = new Y.Map();
    list1.set('sys:flavour', 'affine:list');
    list1.set('prop:type', 'todo');
    list1.set('prop:checked', true);
    const list1Text = new Y.Text();
    list1Text.insert(0, 'Complete task');
    list1.set('prop:text', list1Text);
    blocks.set('list-1', list1);

    // Code block
    const code1 = new Y.Map();
    code1.set('sys:flavour', 'affine:code');
    code1.set('prop:language', 'typescript');
    code1.set('prop:text', 'console.log("hello");');
    blocks.set('code-1', code1);

    // Chess block
    const chess1 = new Y.Map();
    chess1.set('sys:flavour', 'affine:chess-game');
    chess1.set('prop:pgn', '1. e4 e5 2. Nf3 Nc6');
    blocks.set('chess-1', chess1);

    const result = yDocToMarkdown(doc);
    expect(result).not.toBeNull();
    expect(result?.title).toBe('Test Note');
    expect(result?.markdown).toContain('# Test Note');
    expect(result?.markdown).toContain('# Welcome to AFFiNE');
    expect(result?.markdown).toContain('Hello world');
    expect(result?.markdown).toContain('- [x] Complete task');
    expect(result?.markdown).toContain('```typescript\nconsole.log("hello");\n```');
    expect(result?.markdown).toContain('```pgn\n1. e4 e5 2. Nf3 Nc6\n```');
  });
});
