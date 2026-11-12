import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ROOT, releasePattern } from './lib.mjs';
const DAY = 86400000;
const missing = error => {
  if (error.code !== 'ENOENT') throw error;
  return null;
};
export async function releaseCleanupPlan(root = ROOT, now = Date.now()) {
  root = path.resolve(root);
  const releases = path.join(root, 'releases');
  if ((await fs.realpath(root)) !== root || (await fs.realpath(releases)) !== releases) throw Error('Use real managed directories.');
  const selected = [];
  for (const name of ['current', 'previous']) {
    const link = path.join(root, name),
      info = await fs.lstat(link).catch(missing);
    if (!info) {
      if (name === 'current') throw Error('No current release; cleanup is disabled.');
      continue;
    }
    if (!info.isSymbolicLink()) throw Error('Invalid release selector.');
    const target = await fs.realpath(link);
    if (path.dirname(target) !== releases || !releasePattern.test(path.basename(target))) throw Error('Selector escaped managed releases.');
    selected.push(path.basename(target));
  }
  const entries = [];
  for (const entry of await fs.readdir(releases, { withFileTypes: true })) {
    const staged = entry.name.startsWith('.stage-');
    if (!releasePattern.test(staged ? entry.name.slice(7) : entry.name)) continue;
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw Error('Unexpected managed release type.');
    const directory = path.join(releases, entry.name);
    if ((await fs.realpath(directory)) !== directory) throw Error('Release path escaped managed directory.');
    const info = await fs.lstat(directory);
    entries.push({ id: entry.name, staged, mtimeMs: info.mtimeMs, ino: info.ino });
  }
  const newest = entries
    .filter(entry => !entry.staged)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, 5)
    .map(entry => entry.id);
  const candidates = entries
    .filter(entry => !selected.includes(entry.id) && !newest.includes(entry.id) && now - entry.mtimeMs > (entry.staged ? 2 : 7) * DAY)
    .sort((a, b) => a.id.localeCompare(b.id));
  const plan = { version: 1, protected: [...new Set([...selected, ...newest])].sort(), candidates };
  return { ...plan, reviewKey: createHash('sha256').update(JSON.stringify(plan)).digest('hex') };
}
export async function applyReleaseCleanup(root, reviewKey, now = Date.now()) {
  const plan = await releaseCleanupPlan(root, now);
  if (!reviewKey || plan.reviewKey !== reviewKey) throw Error('Cleanup plan changed. Review a fresh dry run.');
  for (const entry of plan.candidates) {
    const fresh = await releaseCleanupPlan(root, now);
    if (!fresh.candidates.some(item => JSON.stringify(item) === JSON.stringify(entry))) throw Error('Cleanup target changed.');
    const directory = path.resolve(root, 'releases', entry.id),
      boundary = path.resolve(root, 'releases');
    if (path.dirname(directory) !== boundary || (await fs.realpath(directory)) !== directory || (await fs.lstat(directory)).isSymbolicLink())
      throw Error('Unsafe cleanup target.');
    await fs.rm(directory, { recursive: true, force: false });
  }
  return { removed: plan.candidates.length, sharedAssets: 'retained', data: 'untouched' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.platform !== 'linux' || process.getuid() !== 0) throw Error('Run as root on the VPS. Default is dry-run.');
    const args = process.argv.slice(2),
      locked = args.at(-1) === '--locked';
    if (locked) args.pop();
    if (args.length && (args.length !== 2 || args[0] !== '--apply' || !/^[a-f0-9]{64}$/.test(args[1])))
      throw Error('Use no arguments for preview, or --apply REVIEW_KEY.');
    if (args.length && !locked) {
      const result = spawnSync(
        'flock',
        ['--nonblock', '--no-fork', '/run/lock/smena-manager-deploy.lock', process.execPath, process.argv[1], ...args, '--locked'],
        { stdio: 'inherit' },
      );
      process.exitCode = result.status ?? 1;
    } else console.log(JSON.stringify(args.length ? await applyReleaseCleanup(ROOT, args[1]) : await releaseCleanupPlan(), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
