import assert from 'node:assert/strict';
import test from 'node:test';
import { workspaceCapacities, fileStorageAccounting } from '../../src/server/file-capacity.js';
test('data guards remain independently visible when catalog dwarfs core/documents', () => {
  const result = workspaceCapacities({ revision: 1, projects: [], files: [{ name: 'x'.repeat(4 * 1024 * 1024) }] }, {});
  assert.ok(result.core.bytes < 100);
  assert.equal(result.catalog.maxBytes, 32 * 1024 * 1024);
  assert.equal(result.knowledge.maxBytes, 4 * 1024 * 1024);
  assert.equal(result.exports.maxBytes, 8 * 1024 * 1024);
});
test('storage accounting distinguishes aliases, retained bytes and unknown backup usage', () => {
  const file = { storageFileId: 'active', storageName: 'a', bytes: 12 };
  const value = fileStorageAccounting({
    files: [file, { ...file }],
    trash: [{ data: { storageFileId: 'retained', storageName: 'r' } }],
    _fileGc: [{ storageFileId: 'retained', storageName: 'r' }, { storageName: 'unknown' }],
    _fileRegistry: { 'id:active': { bytes: 12 }, 'id:retained': { bytes: 20 } },
  });
  assert.equal(value.logical.knownBytes, 24);
  assert.equal(value.activePhysical.knownBytes, 12);
  assert.equal(value.retainedPhysical.knownBytes, 20);
  assert.equal(value.retainedPhysical.files, 2);
  assert.equal(value.retainedPhysical.unknownFiles, 1);
  assert.equal(value.aliases, 1);
  assert.equal(value.backupPhysicalBytes, null);
});
