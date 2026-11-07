import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat } from 'node:fs/promises';
import path from 'node:path';

const execute = promisify(execFile);
const eligible = [
  'src',
  'scripts',
  'tests',
  'public',
  'deploy',
  'docs',
  '.github',
  'package.json',
  'package-lock.json',
  'index.html',
  'vite.config.js',
  'playwright.config.js',
  'eslint.config.js',
];
const generated = name => /^(?:output|dist|node_modules|\.data|\.vercel)(?:\/|$)/.test(name);
async function git(root, args) {
  return (await execute('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true })).stdout;
}
async function fileHash(root, name) {
  const target = path.resolve(root, name);
  if (!target.startsWith(root + path.sep)) throw new Error('A source path escaped the repository.');
  try {
    const info = await lstat(target);
    // Do not follow links into a user directory or silently accept an external
    // source changing outside the checked tree.
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Release source inspection requires regular repository files.');
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(target)) hash.update(chunk);
    return hash.digest('hex');
  } catch (error) {
    if (error.code === 'ENOENT') return 'missing';
    throw error;
  }
}

export async function releaseSourceSnapshot({ root = process.cwd() } = {}) {
  root = path.resolve(root);
  const [tracked, extra, head] = await Promise.all([
    git(root, ['ls-files', '--cached', '-z']),
    git(root, ['ls-files', '--others', '--exclude-standard', '-z', '--', ...eligible]),
    git(root, ['rev-parse', '--verify', 'HEAD']).then(
      value => value.trim(),
      () => 'unborn',
    ),
  ]);
  const files = [...new Set((tracked + extra).split('\0').filter(name => name && !generated(name)))].sort();
  const hashes = new Array(files.length);
  let index = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (index < files.length) {
        const current = index++;
        hashes[current] = await fileHash(root, files[current]);
      }
    }),
  );
  const hash = createHash('sha256');
  files.forEach((name, i) => hash.update(name).update('\0').update(hashes[i]).update('\0'));
  return { head, files: files.length, sha256: hash.digest('hex') };
}

export function assertReleaseSourceStable(before, after) {
  if (!before || !after || before.head !== after.head || before.files !== after.files || before.sha256 !== after.sha256)
    throw Object.assign(new Error('Repository sources changed during local release checks. Repeat the gate on a stable tree.'), {
      code: 'RELEASE_SOURCE_CHANGED',
    });
}
