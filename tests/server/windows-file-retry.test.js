import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { renameWithRetry } from '../../src/server/storage/windows-file-retry.js';

test('a Windows lock lasting beyond the old retry window preserves the old root until atomic replacement', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-windows-retry-'));
  assert.ok(path.isAbsolute(directory) && directory.startsWith(path.join(os.tmpdir(), 'smena-windows-retry-')));
  try {
    const target = path.join(directory, 'root.json'),
      source = path.join(directory, 'root.tmp');
    await fs.writeFile(target, 'previous');
    await fs.writeFile(source, 'next');
    let attempts = 0;
    const delays = [];
    await renameWithRetry(source, target, {
      platform: 'win32',
      wait: async ms => delays.push(ms),
      rename: async (from, to) => {
        if (++attempts <= 5) {
          assert.equal(await fs.readFile(target, 'utf8'), 'previous');
          throw Object.assign(new Error('Locked'), { code: 'EPERM' });
        }
        await fs.rename(from, to);
      },
    });
    assert.equal(await fs.readFile(target, 'utf8'), 'next');
    assert.ok(attempts >= 6 && attempts <= 8);
    assert.ok(delays.reduce((n, delay) => n + delay, 0) <= 3175);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('permanent locks remain bounded; unrelated errors and non-Windows errors fail immediately', async () => {
  let attempts = 0,
    delay = 0;
  await assert.rejects(
    renameWithRetry('source', 'target', {
      platform: 'win32',
      wait: async ms => {
        delay += ms;
      },
      rename: async () => {
        attempts++;
        throw Object.assign(new Error('Locked'), { code: 'EBUSY' });
      },
    }),
    { code: 'EBUSY' },
  );
  assert.equal(attempts, 8);
  assert.equal(delay, 3175);
  for (const [platform, code] of [
    ['linux', 'EPERM'],
    ['win32', 'ENOENT'],
  ]) {
    attempts = 0;
    await assert.rejects(
      renameWithRetry('source', 'target', {
        platform,
        wait: async () => assert.fail('Must not wait'),
        rename: async () => {
          attempts++;
          throw Object.assign(new Error('No retry'), { code });
        },
      }),
      { code },
    );
    assert.equal(attempts, 1);
  }
});
