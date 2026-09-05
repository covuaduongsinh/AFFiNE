import { describe, expect, it } from 'vitest';

import { yDocToMarkdown } from './export.js';
import { markdownToYDoc } from './import.js';

describe('Markdown Importer', () => {
  it('parses Markdown into a valid BlockSuite YDoc with all block types', () => {
    const markdown = [
      '# My Test Document',
      '',
      '## Introduction',
      'This is a **bold** and *italic* paragraph with a [link](https://affine.pro).',
      '',
      '- [x] Task 1 completed',
      '- [ ] Task 2 pending',
      '',
      '1. First numbered item',
      '2. Second numbered item',
      '',
      '- Bullet item A',
      '- Bullet item B',
      '',
      '```typescript',
      'const answer = 42;',
      '```',
      '',
      '---',
      '',
      '```pgn',
      '1. e4 e5 2. Nf3 Nc6',
      '```',
      '',
      '```fen',
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      '```',
    ].join('\n');

    const { title, doc } = markdownToYDoc(markdown);
    expect(title).toBe('My Test Document');

    const blocks = doc.getMap('blocks');
    expect(blocks.size).toBeGreaterThan(5);

    // Verify round-trip conversion (import -> export)
    const exported = yDocToMarkdown(doc);
    expect(exported).not.toBeNull();
    expect(exported?.title).toBe('My Test Document');
    expect(exported?.markdown).toContain('# My Test Document');
    expect(exported?.markdown).toContain('## Introduction');
    expect(exported?.markdown).toContain('**bold**');
    expect(exported?.markdown).toContain('*italic*');
    expect(exported?.markdown).toContain('[link](https://affine.pro)');
    expect(exported?.markdown).toContain('- [x] Task 1 completed');
    expect(exported?.markdown).toContain('- [ ] Task 2 pending');
    expect(exported?.markdown).toContain('1. First numbered item');
    expect(exported?.markdown).toContain('- Bullet item A');
    expect(exported?.markdown).toContain(
      '```typescript\nconst answer = 42;\n```'
    );
    expect(exported?.markdown).toContain('---\n');
    expect(exported?.markdown).toContain('```pgn\n1. e4 e5 2. Nf3 Nc6\n```');
    expect(exported?.markdown).toContain(
      '```fen\nrnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1\n```'
    );
  });

  it('detects Yusupov style FEN blocks and creates affine:chess-board blocks', () => {
    const yusupovMarkdown = [
      '# Chapter 1: Tactics',
      '',
      'White to move and win:',
      '',
      '```',
      'fen: r2r2k1/pb3p1p/1pq3Q1/n3P3/2BP4/8/P3RPPP/4R1K1 w - - 0 1',
      '```',
      '',
      'Solution is 1. Bxf7+!',
    ].join('\n');

    const { doc } = markdownToYDoc(yusupovMarkdown);
    const blocks = doc.getMap('blocks');

    let boardBlock: any = null;
    blocks.forEach((block: any) => {
      if (block.get('sys:flavour') === 'affine:chess-board') {
        boardBlock = block;
      }
    });

    expect(boardBlock).not.toBeNull();
    expect(boardBlock.get('prop:fen')).toBe(
      'r2r2k1/pb3p1p/1pq3Q1/n3P3/2BP4/8/P3RPPP/4R1K1 w - - 0 1'
    );
    expect(boardBlock.get('prop:orientation')).toBe('white');
  });

  it('detects raw FEN with orientation and annotations', () => {
    const markdown = [
      '# Exercise',
      '',
      '```chessboard',
      'fen: 8/8/4P3/8/8/8/8/8 w - - 0 1',
      'orientation: black',
      'annotations: Ae1-e8 Hf5',
      '```',
    ].join('\n');

    const { doc } = markdownToYDoc(markdown);
    const blocks = doc.getMap('blocks');

    let boardBlock: any = null;
    blocks.forEach((block: any) => {
      if (block.get('sys:flavour') === 'affine:chess-board') {
        boardBlock = block;
      }
    });

    expect(boardBlock).not.toBeNull();
    expect(boardBlock.get('prop:fen')).toBe('8/8/4P3/8/8/8/8/8 w - - 0 1');
    expect(boardBlock.get('prop:orientation')).toBe('black');
    expect(boardBlock.get('prop:arrows').toJSON()).toEqual([
      { from: 'e1', to: 'e8', color: '#f1ad24' },
    ]);
    expect(boardBlock.get('prop:highlights').toJSON()).toEqual([
      { square: 'f5', color: '#e67768' },
    ]);
  });

  it('detects untagged PGN blocks and creates affine:chess-game', () => {
    const markdown = [
      '# Famous Game',
      '',
      '```',
      '[Event "World Championship"]',
      '[White "Kasparov"]',
      '[Black "Karpov"]',
      '',
      '1. e4 e5 2. Nf3 Nc6',
      '```',
    ].join('\n');

    const { doc } = markdownToYDoc(markdown);
    const blocks = doc.getMap('blocks');

    let gameBlock: any = null;
    blocks.forEach((block: any) => {
      if (block.get('sys:flavour') === 'affine:chess-game') {
        gameBlock = block;
      }
    });

    expect(gameBlock).not.toBeNull();
    expect(gameBlock.get('prop:pgn')).toContain('1. e4 e5 2. Nf3 Nc6');
  });

  it('chunks contiguous text lines into a single paragraph block', () => {
    const markdown = [
      '# Document with Multi-line Paragraphs',
      '',
      'Line 1 of first paragraph.',
      'Line 2 of first paragraph.',
      'Line 3 of first paragraph.',
      '',
      'Line 1 of second paragraph.',
      'Line 2 of second paragraph.',
    ].join('\n');

    const { doc } = markdownToYDoc(markdown);
    const blocks = doc.getMap('blocks');

    const paragraphBlocks: any[] = [];
    blocks.forEach((block: any) => {
      if (
        block.get('sys:flavour') === 'affine:paragraph' &&
        block.get('prop:type') === 'text'
      ) {
        paragraphBlocks.push(block);
      }
    });

    expect(paragraphBlocks).toHaveLength(2);
    expect(paragraphBlocks[0].get('prop:text').toString()).toBe(
      'Line 1 of first paragraph.\nLine 2 of first paragraph.\nLine 3 of first paragraph.'
    );
    expect(paragraphBlocks[1].get('prop:text').toString()).toBe(
      'Line 1 of second paragraph.\nLine 2 of second paragraph.'
    );
  });
});
