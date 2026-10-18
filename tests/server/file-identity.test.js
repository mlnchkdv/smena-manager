import assert from 'node:assert/strict';
import test from 'node:test';
import { detachTaskFile, sameFileReference } from '../../src/shared/file-identity.js';

test('deleting one upload preserves another attachment with the same filename', () => {
  const first = { id: 'first', name: 'report.pdf', storageFileId: 'drive-first' };
  const second = { id: 'second', name: 'report.pdf', storageFileId: 'drive-second' };
  const task = { attachments: [first, second] };
  assert.equal(detachTaskFile(task, second), second);
  assert.deepEqual(task.attachments, [first]);
  assert.equal(detachTaskFile(task, second), null);
  assert.deepEqual(task.attachments, [first]);
});

test('separate library aliases are distinguished even when they share stored bytes', () => {
  assert.equal(sameFileReference({ id: 'a', storageFileId: 'shared' }, { id: 'b', storageFileId: 'shared' }), false);
});

test('legacy references can match storage identity but never filename alone', () => {
  assert.equal(sameFileReference({ storageFileId: 'drive' }, { id: 'file', storageFileId: 'drive' }), true);
  assert.equal(sameFileReference({ storageName: 'stored.pdf' }, { storageName: 'stored.pdf' }), true);
  assert.equal(sameFileReference({ name: 'report.pdf' }, { name: 'report.pdf' }), false);
  assert.equal(detachTaskFile(null, {}), null);
  const task = {};
  assert.equal(detachTaskFile(task, { id: 'missing' }), null);
  assert.deepEqual(task.attachments, []);
});
