import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertBuildDisk, buildInvocation } from '../../deploy/vps/build-resources.mjs';
import { releaseCleanupPlan, applyReleaseCleanup } from '../../deploy/vps/cleanup-releases.mjs';
test('all build children share a bounded cgroup and a secret-free environment; low disk fails before staging', async () => {
  const invocation = buildInvocation('/srv/smena-manager/releases/.stage-a', '/opt/smena-node/bin/npm', ['run', 'build'], {
    PATH: '/usr/bin',
    NODE_OPTIONS: '--max-old-space-size=1536',
  });
  for (const argument of ['--property=MemoryMax=3G', '--property=KillMode=control-group', '--property=User=smena-build', '--wait', '--pipe'])
    assert.ok(invocation.includes(argument));
  assert.throws(() => buildInvocation('/srv/stage', '/bin/node', [], { SESSION_SECRET: 'never pass credentials' }), /credentials/);
  await assert.rejects(
    assertBuildDisk('/unused', async () => ({ bsize: 1, blocks: 120 * 1024 ** 3, bavail: 11 * 1024 ** 3 })),
    /space/,
  );
  assert.ok((await assertBuildDisk('/unused', async () => ({ bsize: 1, blocks: 120 * 1024 ** 3, bavail: 20 * 1024 ** 3 }))).free > 0);
});
test('cleanup preview preserves current/previous, five newest releases, shared assets and all data; stale review refuses deletion', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-cleanup-'));
  const now = Date.now(),
    day = 86400000,
    releases = path.join(root, 'releases');
  try {
    await fs.mkdir(releases);
    const ids = [];
    for (let i = 0; i < 9; i++) {
      const id = String(i).repeat(40) + '-00000000-0000-0000-0000-000000000000',
        directory = path.join(releases, id);
      ids.push(id);
      await fs.mkdir(directory);
      await fs.writeFile(path.join(directory, 'artifact'), 'old artifact');
      await fs.utimes(directory, new Date(now - (20 - i) * day), new Date(now - (20 - i) * day));
    }
    await fs.symlink(path.join(releases, ids[0]), path.join(root, 'current'), process.platform === 'win32' ? 'junction' : 'dir');
    await fs.symlink(path.join(releases, ids[1]), path.join(root, 'previous'), process.platform === 'win32' ? 'junction' : 'dir');
    await fs.mkdir(path.join(root, 'shared'));
    await fs.writeFile(path.join(root, 'shared', 'keep.js'), 'keep lazy chunk');
    await fs.mkdir(path.join(root, 'data'));
    await fs.writeFile(path.join(root, 'data', 'keep'), 'never touch');
    const plan = await releaseCleanupPlan(root, now);
    assert.deepEqual(
      plan.candidates.map(item => item.id),
      ids.slice(2, 4),
    );
    assert.equal((await releaseCleanupPlan(root, now)).reviewKey, plan.reviewKey);
    assert.equal(await fs.readFile(path.join(releases, ids[2], 'artifact'), 'utf8'), 'old artifact');
    await assert.rejects(applyReleaseCleanup(root, '0'.repeat(64), now), /changed/);
    assert.equal((await applyReleaseCleanup(root, plan.reviewKey, now)).removed, 2);
    assert.equal((await fs.readdir(releases)).length, 7);
    assert.equal(await fs.readFile(path.join(root, 'shared', 'keep.js'), 'utf8'), 'keep lazy chunk');
    assert.equal(await fs.readFile(path.join(root, 'data', 'keep'), 'utf8'), 'never touch');
  } finally {
    assert.ok(root.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(root).startsWith('smena-cleanup-'));
    await fs.rm(root, { recursive: true, force: true });
  }
});
