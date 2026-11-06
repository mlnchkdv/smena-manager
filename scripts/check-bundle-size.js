import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve(process.argv[2] || 'dist');
const assetsDir = path.join(dist, 'assets');
const initialLimit = 600 * 1024;
if (!fs.existsSync(assetsDir)) {
  console.error('Bundle budget: dist/assets is missing. Run `npm run build` first.');
  process.exit(1);
}

const manifestPath = path.join(dist, '.vite', 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error('Bundle budget: the Vite manifest is missing. Rebuild with manifest enabled.');
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const entry = Object.entries(manifest).find(([key, value]) => value.isEntry && (key === 'index.html' || value.name === 'index'))?.[0];
if (!entry) throw Error('Bundle budget: the main entry is missing.');
const visited = new Set(),
  files = new Set();
function visit(key) {
  if (visited.has(key)) return;
  visited.add(key);
  const chunk = manifest[key];
  if (!chunk) throw Error('Bundle budget: an imported chunk is missing.');
  if (chunk.file.endsWith('.js')) files.add(chunk.file);
  for (const child of chunk.imports || []) visit(child);
}
visit(entry);
let bytes = 0;
for (const file of files) {
  const target = path.resolve(dist, file);
  if (!target.startsWith(assetsDir + path.sep)) throw Error('Bundle budget: invalid asset path.');
  bytes += fs.statSync(target).size;
}
const kb = (bytes / 1024).toFixed(1);
console.log(`Bundle budget: initial JavaScript including ${files.size} static chunks ${kb} KiB (limit ${Math.round(initialLimit / 1024)} KiB).`);
if (bytes > initialLimit) {
  console.error('Bundle budget exceeded. Lazy-load the feature before raising the limit.');
  process.exit(1);
}
