/**
 * Download the pinned Arasan Windows engine (MIT) into
 * packages/frontend/apps/electron/resources/arasan/.
 *
 * Does not extract book.bin or anything from gui/. Re-run with --force
 * to replace an existing copy.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifestPath = join(root, 'third_party', 'arasan', 'version.json');
const destDir = join(
  root,
  'packages',
  'frontend',
  'apps',
  'electron',
  'resources',
  'arasan'
);

const force = process.argv.includes('--force');

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const windows = manifest.windows;
if (!windows?.url || !windows.sha256 || !Array.isArray(windows.extract)) {
  throw new Error(
    'third_party/arasan/version.json is missing windows.{url,sha256,extract}'
  );
}

const required = windows.extract.filter(name => !name.endsWith('LICENSE'));
const alreadyThere = required.every(name => existsSync(join(destDir, name)));
if (alreadyThere && !force) {
  console.log(`Arasan ${manifest.version} already present in ${destDir}`);
  process.exit(0);
}

await mkdir(destDir, { recursive: true });

const tmpDir = join(root, 'download', 'arasan');
await mkdir(tmpDir, { recursive: true });
const zipPath = join(tmpDir, `arasan-${manifest.version}.zip`);

console.log(`Downloading ${windows.url}`);
const response = await fetch(windows.url);
if (!response.ok) {
  throw new Error(`download failed: ${response.status} ${response.statusText}`);
}
const buffer = Buffer.from(await response.arrayBuffer());
const digest = createHash('sha256').update(buffer).digest('hex');
if (digest !== windows.sha256) {
  throw new Error(
    `sha256 mismatch for Arasan ${manifest.version}: got ${digest}, expected ${windows.sha256}`
  );
}
await writeFile(zipPath, buffer);

const extract = spawnSync(
  'tar',
  ['-xf', zipPath, '-C', destDir, ...windows.extract],
  { stdio: 'inherit' }
);
if (extract.status !== 0) {
  throw new Error(`tar extract failed with status ${extract.status}`);
}

for (const name of windows.extract) {
  if (!existsSync(join(destDir, name))) {
    throw new Error(`expected ${name} after extract`);
  }
}

console.log(`Arasan ${manifest.version} installed at ${destDir}`);
