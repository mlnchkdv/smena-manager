import { build } from 'esbuild';

// Vercel's CJS instrumentation cannot require htmlparser2's ESM entry point.
// Bundle the current, patched sanitizer into ESM rather than downgrade it.
await build({
  stdin: { contents: "export { default } from 'sanitize-html';", resolveDir: process.cwd(), sourcefile: 'sanitizer-entry.js' },
  outfile: '.generated/sanitizer.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  packages: 'bundle',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  legalComments: 'eof',
});
