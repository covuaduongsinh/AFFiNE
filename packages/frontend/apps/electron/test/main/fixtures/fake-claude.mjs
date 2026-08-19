/**
 * Minimal Claude Code stream-json speaker for coach adapter tests.
 * Reads the prompt from stdin so FEN never has to sit on argv.
 */
const chunks = [];
process.stdin.on('data', chunk => chunks.push(chunk));
process.stdin.on('end', () => {
  const prompt = Buffer.concat(chunks).toString('utf8');
  if (process.argv.includes('--fail')) {
    process.stdout.write(
      `${JSON.stringify({ type: 'error', error: 'fake claude failed' })}\n`
    );
    process.exit(2);
    return;
  }
  const text = `echo:${prompt.replace(/\s+/g, ' ').slice(0, 80)}`;
  process.stdout.write(
    `${JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text }] },
    })}\n`
  );
  process.stdout.write(
    `${JSON.stringify({ type: 'result', subtype: 'success', result: text })}\n`
  );
});
