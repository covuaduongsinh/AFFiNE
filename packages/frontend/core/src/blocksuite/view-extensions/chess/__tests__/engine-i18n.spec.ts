import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const resources = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../../i18n/src/resources'
);

const en = JSON.parse(
  readFileSync(join(resources, 'en.json'), 'utf8')
) as Record<string, string>;
const vi = JSON.parse(
  readFileSync(join(resources, 'vi.json'), 'utf8')
) as Record<string, string>;

const ENGINE_KEYS = [
  'com.affine.chess.engine.analyze',
  'com.affine.chess.engine.scan',
  'com.affine.chess.engine.scanning',
  'com.affine.chess.engine.scanFailed',
  'com.affine.chess.engine.stop',
  'com.affine.chess.engine.unavailable',
  'com.affine.chess.engine.depth',
  'com.affine.chess.engine.acpl',
  'com.affine.chess.engine.inaccuracy',
  'com.affine.chess.engine.mistake',
  'com.affine.chess.engine.blunder',
  'com.affine.chess.engine.apply',
  'com.affine.chess.coach.title',
  'com.affine.chess.coach.ask',
  'com.affine.chess.coach.send',
  'com.affine.chess.coach.stop',
  'com.affine.chess.coach.placeholder',
  'com.affine.chess.coach.unavailable',
  'com.affine.chess.coach.cliHint',
  'com.affine.chess.coach.provider',
  'com.affine.chess.coach.provider.claude',
  'com.affine.chess.coach.provider.grok',
  'com.affine.chess.coach.provider.api',
  'com.affine.chess.coach.subscriptionReady',
  'com.affine.chess.coach.subscriptionMissing.claude',
  'com.affine.chess.coach.subscriptionMissing.grok',
  'com.affine.chess.coach.apiKey',
  'com.affine.chess.coach.apiSave',
  'com.affine.chess.coach.apiClear',
  'com.affine.chess.coach.apiSaved',
] as const;

describe('chess engine i18n', () => {
  it('ships every engine string in English and Vietnamese', () => {
    for (const key of ENGINE_KEYS) {
      expect(en[key]?.trim().length, key).toBeGreaterThan(0);
      expect(vi[key]?.trim().length, `${key} (vi)`).toBeGreaterThan(0);
    }
  });
});
