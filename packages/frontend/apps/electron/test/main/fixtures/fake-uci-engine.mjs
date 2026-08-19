/**
 * Minimal UCI speaker used by session tests. Speaks the same dialect Arasan
 * does, without needing the real binary in CI.
 */
import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin });

let searching = false;
let crashOnGo = process.argv.includes('--crash-on-go');

function say(line) {
  process.stdout.write(`${line}\n`);
}

rl.on('line', line => {
  const command = line.trim();
  if (command === 'uci') {
    say('id name FakeArasan 0.1');
    say('id author test');
    say('uciok');
    return;
  }
  if (command === 'isready') {
    say('readyok');
    return;
  }
  if (command === 'quit') {
    process.exit(0);
    return;
  }
  if (command.startsWith('go')) {
    if (crashOnGo) {
      process.exit(2);
      return;
    }
    searching = true;
    say(
      'info depth 8 seldepth 12 multipv 1 score cp 24 nodes 1000 nps 10000 time 1 pv e2e4 e7e5'
    );
    if (command.includes('infinite')) {
      return;
    }
    searching = false;
    say('bestmove e2e4 ponder e7e5');
    return;
  }
  if (command === 'stop' && searching) {
    searching = false;
    say('bestmove e2e4');
  }
});
