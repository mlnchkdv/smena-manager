import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { createFileArchivePlan, archiveSelectionIssue, FILE_ZIP_MAX_BYTES, safeArchiveSegment } from '../../src/shared/file-archive-policy.js';
import { buildFileZip } from '../../src/shared/file-zip.js';
const fixture = () => ({
  me: 'm',
  projects: [{ id: 'p', name: 'Проект', members: ['m'], fileFolders: [{ id: 'a', name: 'Папка' }] }],
  files: [
    { id: '1', name: 'текст.txt', project: 'p', folderId: 'a', storageName: 'one', bytes: 4 },
    { id: '2', name: 'ТЕКСТ.txt', project: 'p', folderId: 'a', storageName: 'two', bytes: 4 },
  ],
});
test('ZIP plans preserve folders and Unicode without duplicate paths or unsafe filenames', async () => {
  const data = fixture();
  data.files.push({ id: '3', name: '../../CON.txt', project: 'p', storageName: 'three', bytes: 4 });
  const plan = createFileArchivePlan(data, ['1', '2', '3'], 'editor');
  assert.equal(new Set(plan.map(item => item.path.toLocaleLowerCase())).size, 3);
  assert.equal(plan[0].path, 'Проект/Папка/текст.txt');
  assert.equal(plan[1].path, 'Проект/Папка/ТЕКСТ (2).txt');
  for (const item of plan) assert.equal(item.path.split('/').includes('..'), false);
  assert.equal(safeArchiveSegment('CON.txt'), '_CON.txt');
  assert.equal(safeArchiveSegment('я'.repeat(140) + '.txt').endsWith('.txt'), true);
  const blob = await buildFileZip(plan, async file => new TextEncoder().encode(`Content ${file.id}`));
  const unpacked = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  assert.deepEqual(
    Object.keys(unpacked),
    plan.map(item => item.path),
  );
  assert.equal(strFromU8(unpacked[plan[1].path]), 'Content 2');
});
test('ZIP preflight denies missing, inaccessible, legacy and oversized selections but permits read-only access', () => {
  const data = fixture();
  assert.equal(createFileArchivePlan(data, ['1'], 'viewer').length, 1);
  assert.throws(() => createFileArchivePlan(data, ['1', 'gone'], 'editor'));
  data.projects[0].private = true;
  data.projects[0].members = [];
  assert.throws(() => createFileArchivePlan(data, ['1'], 'editor'), /access/);
  assert.match(archiveSelectionIssue([{ id: 'old' }]), /no stored content/);
  assert.match(archiveSelectionIssue(Array.from({ length: 101 }, () => ({ storageName: 's' }))), /100 files/);
  assert.match(archiveSelectionIssue([{ storageName: 's', bytes: FILE_ZIP_MAX_BYTES + 1 }]), /50 MB/);
});
test('ZIP building aborts on any failed read, account check or cancellation; actual bytes are bounded', async () => {
  const plan = createFileArchivePlan(fixture(), ['1', '2'], 'editor');
  let reads = 0;
  await assert.rejects(
    buildFileZip(plan, async () => {
      if (++reads === 2) throw Error('not available');
      return new Uint8Array(1);
    }),
    /not available/,
  );
  const controller = new AbortController();
  await assert.rejects(
    buildFileZip(
      plan,
      async () => {
        controller.abort();
        return new Uint8Array(1);
      },
      { signal: controller.signal },
    ),
    { name: 'AbortError' },
  );
  await assert.rejects(
    buildFileZip(plan, async () => new Uint8Array(1), {
      validate() {
        throw Error('account changed');
      },
    }),
    /account changed/,
  );
  await assert.rejects(
    buildFileZip(plan, async () => new Uint8Array(FILE_ZIP_MAX_BYTES + 1)),
    /50 MB/,
  );
});
