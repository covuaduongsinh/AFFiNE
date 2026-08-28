#!/usr/bin/env node
import { resolve } from 'node:path';

import { startChessSync } from './server.js';

/**
 * Standalone entry point for the sync backend.
 *
 * The desktop app embeds the server and owns its lifecycle. This is how to run
 * the same server on its own — for a browser client, or as the one backend
 * several clients share. What it adds over calling `startChessSync()` is what a
 * long-lived process needs and a library must not assume: a data directory that
 * does not move, a failure that reads as a sentence, and a shutdown that closes
 * PGlite instead of leaving it to the kernel.
 */

// `loadConfig` resolves the data directory against the working directory, and a
// service manager may start us anywhere. A wrong guess is silent: PGlite
// happily creates an empty database, and every account and document then looks
// deleted.
const dataDir = resolve(process.env.CHESS_SYNC_DATA_DIR ?? './data/chess-sync');

const handle = await startChessSync({ dataDir }).catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`chess-sync failed to start: ${message}`);
  if ((error as { code?: string }).code === 'EADDRINUSE') {
    // Worth naming, because the tempting fix is the wrong one: another copy of
    // this server is already up, and starting a second one on a free port would
    // split the data across two databases.
    console.error('Another process is already listening on that port.');
  }
  return process.exit(1);
});

console.log(`listening on ${handle.baseUrl}`);
console.log(`  data     ${dataDir}`);

const host = process.env.CHESS_SYNC_HOST;
if (host && host !== '127.0.0.1' && host !== 'localhost') {
  // Signing in creates the account when it does not exist, and there is no
  // allowlist to sign in against.
  console.warn(
    `warning: reachable on ${host}; anyone who can reach it can create an account`
  );
}

let closing = false;
const shutdown = (signal: NodeJS.Signals) => {
  // A second Ctrl-C must not start a second close: PGlite throws when closed
  // twice, and that error would bury whatever the first close was reporting.
  if (closing) return;
  closing = true;
  console.log(`\n${signal}, closing…`);

  // PGlite flushes on close, so exiting early is the case that loses writes.
  // Give it room, but do not hang forever if something refuses to let go.
  setTimeout(() => {
    console.error('close timed out after 10s, exiting anyway');
    process.exit(1);
  }, 10000).unref();

  handle
    .close()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('close failed', error);
      process.exit(1);
    });
};

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, shutdown);
}
