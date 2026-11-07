import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { releaseSourceSnapshot, assertReleaseSourceStable } from '../../scripts/release-source-snapshot.js';

test('source evidence tracks pending code and deletions while ignoring generated artifacts and unrelated private files', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-release-source-'));
  try {
    await promisify(execFile)('git', ['init', '-q', directory], { windowsHide: true });
    await fs.mkdir(path.join(directory, 'src'));
    await fs.writeFile(path.join(directory, 'src', 'app.js'), 'export const value = 1;');
    await promisify(execFile)('git', ['-C', directory, 'add', 'src/app.js'], { windowsHide: true });
    const initial = await releaseSourceSnapshot({ root: directory });
    assert.equal(initial.files, 1);
    assert.equal(initial.head, 'unborn');
    await fs.mkdir(path.join(directory, 'output'));
    await fs.writeFile(path.join(directory, 'output', 'trace.json'), 'generated');
    await fs.writeFile(path.join(directory, 'private-settings.json'), 'not a source file');
    await fs.writeFile(path.join(directory, '.env'), 'FAKE_TEST_VALUE=private');
    assert.deepEqual(await releaseSourceSnapshot({ root: directory }), initial);
    await fs.writeFile(path.join(directory, 'src', 'pending.js'), 'export const pending = true;');
    const added = await releaseSourceSnapshot({ root: directory });
    assert.equal(added.files, 2);
    assert.throws(() => assertReleaseSourceStable(initial, added), { code: 'RELEASE_SOURCE_CHANGED' });
    await fs.writeFile(path.join(directory, 'src', 'app.js'), 'export const value = 2;');
    const edited = await releaseSourceSnapshot({ root: directory });
    assert.notEqual(edited.sha256, added.sha256);
    await fs.unlink(path.join(directory, 'src', 'app.js'));
    const removed = await releaseSourceSnapshot({ root: directory });
    assert.equal(removed.files, 2, 'deleted tracked sources remain part of the evidence');
    assert.notEqual(removed.sha256, edited.sha256);
    assert.doesNotThrow(() => assertReleaseSourceStable(removed, structuredClone(removed)));
    assert.equal(JSON.stringify(removed).includes('FAKE_TEST_VALUE'), false);
  } finally {
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('smena-release-source-'));
    await fs.rm(resolved, { recursive: true, force: true });
  }
});
test('a different commit is stale even if source byte counts happen to match', () => {
  assert.throws(() => assertReleaseSourceStable({ head: 'before', files: 1, sha256: 'same' }, { head: 'after', files: 1, sha256: 'same' }), {
    code: 'RELEASE_SOURCE_CHANGED',
  });
});
