import type { ChildProcess } from 'node:child_process';

export interface UciIo {
  send(line: string): void;
  onLine(listener: (line: string) => void): () => void;
  onClose(listener: (code: number | null) => void): () => void;
  onStderr?(listener: (chunk: string) => void): () => void;
  kill(): void;
}

export interface ChildProcessIoOptions {
  onStderr?: (chunk: string) => void;
}

/**
 * Line-buffer a child process that speaks UCI on stdin/stdout.
 *
 * The working directory must already be the engine folder so the NNUE file
 * sitting next to the binary is found.
 */
export function createChildProcessIo(
  child: ChildProcess,
  options: ChildProcessIoOptions = {}
): UciIo {
  const stdout = child.stdout;
  const stdin = child.stdin;
  if (!stdout || !stdin) {
    throw new Error('uci child process is missing stdio pipes');
  }

  const lineListeners = new Set<(line: string) => void>();
  const closeListeners = new Set<(code: number | null) => void>();
  let buffer = '';
  let closed = false;

  const emitLine = (line: string) => {
    for (const listener of lineListeners) listener(line);
  };

  const flush = (chunk: string) => {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      if (line.length > 0) emitLine(line);
      newline = buffer.indexOf('\n');
    }
  };

  stdout.setEncoding('utf8');
  stdout.on('data', (chunk: string) => {
    flush(chunk);
  });
  if (child.stderr) {
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      options.onStderr?.(chunk);
    });
  }

  const handleClose = (code: number | null) => {
    if (closed) return;
    closed = true;
    if (buffer.trim()) emitLine(buffer.replace(/\r$/, ''));
    buffer = '';
    for (const listener of closeListeners) listener(code);
  };

  child.on('exit', handleClose);
  child.on('error', () => handleClose(1));
  const pipeError = () => {
    if (child.exitCode !== null || child.signalCode) {
      handleClose(child.exitCode ?? 1);
    }
  };
  stdin.on('error', pipeError);
  stdout.on('error', pipeError);

  return {
    send(line: string) {
      if (closed || stdin.destroyed || !stdin.writable) return;
      try {
        stdin.write(`${line}\n`);
      } catch {
        pipeError();
      }
    },
    onLine(listener) {
      lineListeners.add(listener);
      return () => {
        lineListeners.delete(listener);
      };
    },
    onClose(listener) {
      closeListeners.add(listener);
      return () => {
        closeListeners.delete(listener);
      };
    },
    kill() {
      if (closed) return;
      try {
        child.kill();
      } catch {
        // already gone
      }
    },
  };
}
