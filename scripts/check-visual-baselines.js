import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const manifest = JSON.parse(fs.readFileSync('docs/visual-baselines.json', 'utf8'));
if (!manifest.approved || !manifest.approvedBy || !manifest.approvedAt) {
  console.error('Visual acceptance pending: review candidates and approve the baseline manifest. No baseline was created or replaced.');
  process.exitCode = 2;
} else {
  fs.mkdirSync('output/playwright/visual-diffs', { recursive: true });
  for (const entry of manifest.files) {
    if (!/^[a-z0-9.-]+\.png$/i.test(entry.name)) throw new Error('Invalid baseline name');
    const baseline = fs.readFileSync(path.join('docs/visual-baselines', entry.name));
    if (createHash('sha256').update(baseline).digest('hex') !== entry.sha256) throw new Error('Baseline changed since approval: ' + entry.name);
    const expected = PNG.sync.read(baseline);
    const candidate = PNG.sync.read(fs.readFileSync(path.join('output/playwright/ergonomics26', entry.name)));
    if (expected.width !== candidate.width || expected.height !== candidate.height) throw new Error('Viewport mismatch: ' + entry.name);
    const diff = new PNG({ width: expected.width, height: expected.height });
    const changed = pixelmatch(expected.data, candidate.data, diff.data, diff.width, diff.height, { threshold: 0.1 });
    fs.writeFileSync(path.join('output/playwright/visual-diffs', entry.name), PNG.sync.write(diff));
    const ratio = changed / (diff.width * diff.height);
    console.log(`${entry.name}: ${(ratio * 100).toFixed(3)}% changed`);
    if (ratio > 0.001) process.exitCode = 1;
  }
}
