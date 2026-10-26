import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

async function sources(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(entry => (entry.isDirectory() ? sources(path.join(dir, entry.name)) : /\.(css|js)$/.test(entry.name) ? path.join(dir, entry.name) : [])),
    )
  ).flat();
}
const files = await Promise.all((await sources('src')).map(async file => ({ file, text: await readFile(file, 'utf8') })));
const definitions = new Set(files.flatMap(({ text }) => [...text.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1])));
// Set by graph/layout renderers rather than a static CSS declaration.
const dynamic = new Set(['--cols', '--folder-depth', '--node-color', '--p']);
const missing = files.flatMap(({ file, text }) =>
  [...text.matchAll(/var\((--[\w-]+)\s*\)/g)].filter(match => !definitions.has(match[1]) && !dynamic.has(match[1])).map(match => `${file}: ${match[1]}`),
);
if (missing.length) {
  console.error([...new Set(missing)].join('\n'));
  process.exitCode = 1;
} else console.log('UI custom properties: all references resolve.');
