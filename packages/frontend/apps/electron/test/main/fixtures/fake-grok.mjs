/**
 * Minimal Grok Build streaming-json speaker.
 * Reads `-p <prompt>` like the real CLI.
 */
if (
  process.argv.includes('--mcp-config') ||
  process.argv.includes('--no-auto-update')
) {
  process.stderr.write("error: unexpected argument '--mcp-config' found\n");
  process.exit(2);
}
const pIndex = process.argv.indexOf('-p');
const prompt = pIndex >= 0 ? (process.argv[pIndex + 1] ?? '') : '';
if (process.argv.includes('--fail')) {
  process.stdout.write(
    `${JSON.stringify({ type: 'error', error: 'fake grok failed' })}\n`
  );
  process.exit(2);
}
const text = `echo:${String(prompt).replace(/\s+/g, ' ').slice(0, 80)}`;
process.stdout.write(`${JSON.stringify({ type: 'text', text })}\n`);
process.stdout.write(`${JSON.stringify({ type: 'done' })}\n`);
