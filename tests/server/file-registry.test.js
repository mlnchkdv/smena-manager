import assert from 'node:assert/strict';
import test from 'node:test';
import { indexStoredFiles, registerFileMetadata } from '../../src/server/file-registry.js';
import { projectWorkspace } from '../../src/server/workspace-policy.js';

test('physical metadata is server-owned, shared by aliases and retained independently of public references', () => {
  const file = { id: 'f', name: 'Display name', storageFileId: 'physical', storageName: 'blob.txt', bytes: 10, mimeType: 'text/plain' };
  const data = { projects: [], tasks: [], files: [file], members: [], notifs: [] };
  registerFileMetadata(data, file, true);
  data.files.push({ ...file, id: 'alias', name: 'Another name' });
  indexStoredFiles(data);
  assert.equal(Object.keys(data._fileRegistry).length, 1);
  data.files = [];
  indexStoredFiles(data);
  assert.equal(data._fileRegistry['id:physical'].verified, true);
  assert.equal(projectWorkspace(data, { id: 'm', role: 'admin' })._fileRegistry, undefined);
  assert.throws(() => registerFileMetadata(data, { ...file, bytes: 999 }), { code: 'FILE_METADATA_CONFLICT' });
});
