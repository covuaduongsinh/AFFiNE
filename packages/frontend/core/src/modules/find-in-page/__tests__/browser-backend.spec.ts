/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { BrowserFindInPageBackend } from '../services/browser-backend';

describe('BrowserFindInPageBackend', () => {
  let backend: BrowserFindInPageBackend;

  beforeEach(() => {
    document.body.innerHTML = `
      <div data-testid="main-container">
        <h1>Welcome to AFFiNE</h1>
        <p>AFFiNE is an open-source workspace with chess support.</p>
        <p>Learn more about chess coaching and review in AFFiNE.</p>
      </div>
    `;
    backend = new BrowserFindInPageBackend();
  });

  it('should find text matches across DOM text nodes', async () => {
    const res = await backend.find('AFFiNE');
    expect(res).not.toBeNull();
    expect(res?.matches).toBe(3);
    expect(res?.activeMatchOrdinal).toBe(1);
  });

  it('should navigate forward and loop around', async () => {
    await backend.find('AFFiNE');
    const next1 = await backend.find('AFFiNE', {
      forward: true,
      findNext: true,
    });
    expect(next1?.activeMatchOrdinal).toBe(2);

    const next2 = await backend.find('AFFiNE', {
      forward: true,
      findNext: true,
    });
    expect(next2?.activeMatchOrdinal).toBe(3);

    const next3 = await backend.find('AFFiNE', {
      forward: true,
      findNext: true,
    });
    expect(next3?.activeMatchOrdinal).toBe(1);
  });

  it('should navigate backward and loop around', async () => {
    await backend.find('AFFiNE');
    const prev = await backend.find('AFFiNE', {
      forward: false,
      findNext: true,
    });
    expect(prev?.activeMatchOrdinal).toBe(3);

    const prev2 = await backend.find('AFFiNE', {
      forward: false,
      findNext: true,
    });
    expect(prev2?.activeMatchOrdinal).toBe(2);
  });

  it('should return 0 matches for non-existent text', async () => {
    const res = await backend.find('NonExistentString123');
    expect(res).toEqual({ matches: 0, activeMatchOrdinal: 0 });
  });

  it('should clear matches', async () => {
    await backend.find('AFFiNE');
    backend.clear();
    const res = await backend.find('   ');
    expect(res).toBeNull();
  });
});
