import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Pinned in third_party/arasan/version.json. */
export const ARASAN_VERSION = '26.0';

/**
 * Find `resources/arasan` from either the CJS bundle (`dist/main.js`) or the
 * TypeScript source. `import.meta.url` is empty in the esbuild CJS output.
 */
function defaultDevArasanDir(): string {
  const candidates = [
    join(process.cwd(), 'resources', 'arasan'),
    join(__dirname, '..', 'resources', 'arasan'),
    join(__dirname, '..', '..', 'resources', 'arasan'),
    join(__dirname, '..', '..', '..', 'resources', 'arasan'),
  ];
  return candidates.find(dir => existsSync(dir)) ?? candidates[0];
}

export interface ResolveArasanOptions {
  dir?: string;
  platform?: NodeJS.Platform;
  variant?: string;
  resourcesPath?: string;
}

/**
 * Directory that holds the Arasan executable and its NNUE file.
 *
 * Packaged builds use Electron's extraResource folder. Dev and tests fall
 * back to `resources/arasan` next to this package, overridable with
 * `AFFINE_ARASAN_DIR`.
 */
export function resolveArasanDir(options: ResolveArasanOptions = {}): string {
  if (options.dir) return options.dir;
  if (process.env.AFFINE_ARASAN_DIR) return process.env.AFFINE_ARASAN_DIR;
  const resourcesPath = options.resourcesPath ?? process.resourcesPath;
  // `defaultApp` is set when Electron is launched against source, not a package.
  if (
    resourcesPath &&
    process.defaultApp !== true &&
    existsSync(join(resourcesPath, 'arasan'))
  ) {
    return join(resourcesPath, 'arasan');
  }
  return defaultDevArasanDir();
}

export function arasanExecutableName(
  platform: NodeJS.Platform,
  variant: 'avx2' | 'sse2'
): string {
  const suffix = variant === 'avx2' ? '-avx2' : '';
  const base = `arasanx-64${suffix}`;
  return platform === 'win32' ? `${base}.exe` : base;
}

/**
 * Candidate binaries, preferred first.
 *
 * AVX2 is tried before the portable SSE2 build. The manager falls back if
 * the faster binary dies on handshake (illegal instruction on old CPUs).
 * `AFFINE_ARASAN_VARIANT=sse2` skips AVX2 entirely.
 */
export function listArasanBinaries(
  options: ResolveArasanOptions = {}
): string[] {
  const dir = resolveArasanDir(options);
  const platform = options.platform ?? process.platform;
  const variant = (options.variant ?? process.env.AFFINE_ARASAN_VARIANT ?? '')
    .trim()
    .toLowerCase();

  const names: string[] = [];
  if (variant === 'sse2' || variant === 'basic') {
    names.push(arasanExecutableName(platform, 'sse2'));
  } else {
    names.push(arasanExecutableName(platform, 'avx2'));
    names.push(arasanExecutableName(platform, 'sse2'));
  }

  return names
    .map(name => join(dir, name))
    .filter(candidate => existsSync(candidate));
}

export function resolveArasanBinary(
  options: ResolveArasanOptions = {}
): string | null {
  return listArasanBinaries(options)[0] ?? null;
}

export function resolveArasanNnue(dir?: string): string | null {
  const root = dir ?? resolveArasanDir();
  const name = 'arasanv8-20260622.nnue';
  const path = join(root, name);
  return existsSync(path) ? path : null;
}

export function arasanWorkingDirectory(binary: string): string {
  return dirname(binary);
}
