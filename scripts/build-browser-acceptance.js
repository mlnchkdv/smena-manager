import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';

// CLI snippets execute in a VM without a dynamic-import callback. Bundle the
// helpers and canonical capability policy into one self-contained function.
const selfTest = process.argv.includes('--self-test');
const result = await build({
  entryPoints: [selfTest ? 'scripts/browser-acceptance-regression.js' : 'scripts/browser-acceptance.js'],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'Acceptance',
  platform: 'browser',
});
await mkdir('output', { recursive: true });
const filename = `output/browser-acceptance${selfTest ? '-self-test' : ''}.cli.js`;
await writeFile(
  filename,
  `async page => {
${result.outputFiles[0].text}
try { return await Acceptance.${selfTest ? 'checkAcceptanceRegression' : 'acceptBrowserPage'}(page); }
catch { return { passed: false, state: 'acceptance-incomplete' }; }
}\n`,
  'utf8',
);
console.log(`Prepared ${filename}. Run it against the current isolated Playwright CLI page.`);
