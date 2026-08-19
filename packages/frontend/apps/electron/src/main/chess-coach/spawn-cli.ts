import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

/** Spawn a local CLI without a shell. `.mjs` fixtures run under the current Node. */
export function spawnCli(
  binary: string,
  args: string[]
): ChildProcessWithoutNullStreams {
  if (binary.endsWith('.mjs') || binary.endsWith('.js')) {
    return spawn(process.execPath, [binary, ...args], {
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }
  if (process.platform === 'win32' && binary.toLowerCase().endsWith('.cmd')) {
    return spawn('cmd.exe', ['/d', '/s', '/c', binary, ...args], {
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }
  return spawn(binary, args, {
    shell: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/** First existing path, or null. Empty strings are skipped. */
export function firstExistingPath(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

/** `name`, `name.exe`, `name.cmd` under every PATH entry from `env`. */
export function pathCandidates(name: string, env: NodeJS.ProcessEnv): string[] {
  const pathEnv = env.PATH ?? env.Path ?? '';
  const names =
    process.platform === 'win32'
      ? [`${name}.exe`, `${name}.cmd`, name]
      : [name];
  const out: string[] = [];
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    for (const file of names) {
      out.push(path.join(dir, file));
    }
  }
  return out;
}
