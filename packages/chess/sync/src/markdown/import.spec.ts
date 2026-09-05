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
});
