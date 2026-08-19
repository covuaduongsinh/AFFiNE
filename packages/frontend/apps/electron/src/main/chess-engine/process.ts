import { type ChildProcess, spawn } from 'node:child_process';

import { arasanWorkingDirectory } from './binary';
import { createChildProcessIo, type UciIo } from './io';

export interface SpawnArasanOptions {
  binary: string;
  onStderr?: (chunk: string) => void;
}

export function spawnArasanProcess(options: SpawnArasanOptions): {
  child: ChildProcess;
  io: UciIo;
} {
  const child = spawn(options.binary, [], {
    cwd: arasanWorkingDirectory(options.binary),
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    shell: false,
  });
  return {
    child,
    io: createChildProcessIo(child, { onStderr: options.onStderr }),
  };
}
