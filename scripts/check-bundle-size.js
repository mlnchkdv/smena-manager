import fs from 'node:fs';
import path from 'node:path';

const assetsDir = path.resolve('dist/assets');
const initialLimit = 600 * 1024;
if (!fs.existsSync(assetsDir)) {
  console.error('Bundle budget: dist/assets is missing. Run `npm run build` first.');
  process.exit(1);
}

const initial = fs
  .readdirSync(assetsDir)
  .filter(name => /^index-[\w-]+\.js$/u.test(name))
  .map(name => ({ name, bytes: fs.statSync(path.join(assetsDir, name)).size }))
  .sort((a, b) => b.bytes - a.bytes)[0];

if (!initial) {
  console.error('Bundle budget: the initial JavaScript entry was not found.');
  process.exit(1);
}

const kb = (initial.bytes / 1024).toFixed(1);
console.log(`Bundle budget: initial JavaScript ${kb} KiB (limit ${Math.round(initialLimit / 1024)} KiB).`);
if (initial.bytes > initialLimit) {
  console.error(`Bundle budget exceeded by ${initial.name}. Lazy-load the feature before raising the limit.`);
  process.exit(1);
}
