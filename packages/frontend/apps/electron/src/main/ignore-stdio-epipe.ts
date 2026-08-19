/**
 * Windows GUI `electron.exe` has no console. The first `console.error` or
 * Node warning then does `stderr.write` → `EPIPE`, which Electron turns into
 * the "A JavaScript error occurred in the main process" dialog.
 *
 * Swallow only broken-pipe errors so real crashes still surface.
 */
function ignoreBrokenPipe(stream: NodeJS.WriteStream | undefined) {
  stream?.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EPIPE' || error.code === 'ERR_STREAM_DESTROYED') {
      return;
    }
    throw error;
  });
}

export function ignoreStdioEpipe(): void {
  ignoreBrokenPipe(process.stdout);
  ignoreBrokenPipe(process.stderr);
  process.on('uncaughtException', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EPIPE') return;
    throw error;
  });
}

ignoreStdioEpipe();
