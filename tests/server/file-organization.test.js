import assert from 'node:assert/strict';
import test from 'node:test';
import {
  archiveFileFolder,
  fileBatchTargets,
  fileFolderPath,
  moveFilesToFolder,
  moveFileFolder,
  planFileFolderMove,
  restoredFileFolder,
  restoreFileFolder,
  saveFileFolder,
  validateProjectFileFolders,
} from '../../src/shared/file-organization.js';
import { createEmptyDatabase } from '../../src/server/workspace-store.js';
import { validateWorkspaceData } from '../../src/shared/workspace-schema.js';
import { mergeClientWorkspace, projectWorkspace } from '../../src/server/workspace-policy.js';

function fixture() {
  return {
    ...createEmptyDatabase(),
    me: 'm',
    members: [{ id: 'm' }, { id: 'owner' }],
    projects: [
      {
        id: 'p',
        name: 'Team',
        members: ['m'],
        perms: { m: 'Can edit' },
        fileFolders: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B', parentId: 'a' },
        ],
      },
      { id: 'private', private: true, members: ['owner'], fileFolders: [{ id: 'hidden', name: 'Hidden' }] },
    ],
    files: [{ id: 'f', project: 'p', folderId: 'a', by: 'm', storageName: 'stored.txt', storageFileId: 'drive-id', bytes: 4, mimeType: 'text/plain' }],
    tasks: [{ id: 't', project: 'p', attachments: [{ id: 'f', project: 'p', folderId: 'a', storageName: 'stored.txt' }] }],
  };
}

test('folder tree relocation previews affected items and validates before any mutation', () => {
  const data = fixture();
  data.projects[0].fileFolders.push({ id: 'c', name: 'C' });
  const beforeFiles = structuredClone(data.files),
    beforeTasks = structuredClone(data.tasks);
  const preview = planFileFolderMove(data, 'p', 'a', 'c', 'editor');
  assert.equal(preview.folderCount, 2);
  assert.equal(preview.fileCount, 1);
  assert.equal(data.projects[0].fileFolders[0].parentId, undefined);
  assert.ok(moveFileFolder(data, 'p', 'a', 'c', 'editor'));
  assert.deepEqual(
    fileFolderPath(data.projects[0], 'b').map(folder => folder.id),
    ['c', 'a', 'b'],
  );
  assert.deepEqual(data.files, beforeFiles);
  assert.deepEqual(data.tasks, beforeTasks);
  const before = structuredClone(data);
  for (const parent of ['a', 'b', 'missing']) assert.throws(() => moveFileFolder(data, 'p', 'a', parent, 'editor'));
  assert.deepEqual(data, before);
  data.projects[0].perms.m = 'Can view';
  assert.throws(() => moveFileFolder(data, 'p', 'a', null, 'editor'));
});

test('file folders remain project scoped and preserve physical identity on a move', () => {
  const data = fixture();
  const before = structuredClone(data.files[0]);
  assert.equal(moveFilesToFolder(data, ['f'], 'p', 'b', 'editor'), 1);
  assert.deepEqual(data.files[0], { ...before, folderId: 'b' });
  assert.equal(data.tasks[0].attachments[0].folderId, 'b');
  assert.deepEqual(
    fileFolderPath(data.projects[0], 'b').map(folder => folder.id),
    ['a', 'b'],
  );
  assert.equal(projectWorkspace(data, { id: 'm', role: 'editor' }).projects.length, 1);
});

test('file folder moves fail atomically for missing files, cross-project destinations and revoked rights', () => {
  for (const args of [
    [['f', 'missing'], 'p', 'a', 'editor'],
    [['f'], 'p', 'hidden', 'editor'],
    [['f'], 'private', 'hidden', 'editor'],
    [['f'], 'p', 'a', 'viewer'],
  ]) {
    const data = fixture();
    const before = structuredClone(data);
    assert.throws(() => moveFilesToFolder(data, ...args), { code: 'FILE_FOLDER_INVALID' });
    assert.deepEqual(data, before);
  }
});

test('folder names, hierarchy, duplicates, cycles and active children of archives are validated', () => {
  for (const folders of [
    [{ id: 'a', name: '' }],
    [{ id: 'a', name: 'A', parentId: 'a' }],
    [{ id: 'a', name: 'A', parentId: 'missing' }],
    [
      { id: 'a', name: 'A' },
      { id: 'b', name: ' a ' },
    ],
    [
      { id: 'a', name: 'A', archived: true },
      { id: 'b', name: 'B', parentId: 'a' },
    ],
  ]) {
    assert.throws(() => validateProjectFileFolders({ fileFolders: folders }), { code: 'FILE_FOLDER_INVALID' });
  }
  const deep = Array.from({ length: 33 }, (_, i) => ({ id: `f${i}`, name: `Folder ${i}`, parentId: i ? `f${i - 1}` : null }));
  assert.throws(() => validateProjectFileFolders({ fileFolders: deep }), { code: 'FILE_FOLDER_INVALID' });
});

test('empty folders can be archived and restored without permanent deletion', () => {
  const data = fixture();
  assert.throws(() => archiveFileFolder(data, 'p', 'a', 'editor'), /empty/);
  archiveFileFolder(data, 'p', 'b', 'editor');
  moveFilesToFolder(data, ['f'], 'p', null, 'editor');
  archiveFileFolder(data, 'p', 'a', 'editor');
  restoreFileFolder(data, 'p', 'b', 'editor');
  assert.equal(data.projects[0].fileFolders.find(folder => folder.id === 'b').parentId, null);
  assert.equal(data.projects[0].fileFolders.length, 2);
  assert.equal(restoredFileFolder({ project: 'p', folderId: 'a' }, data).folderId, null);
});

test('bulk file preflight rejects partial and over-limit batches and respects ownership on deletion', () => {
  const data = fixture();
  data.files.push({ ...data.files[0], id: 'other', by: 'owner' });
  assert.equal(fileBatchTargets(data, ['f', 'other'], 'editor').length, 2);
  assert.throws(() => fileBatchTargets(data, ['f', 'other'], 'editor', true), { code: 'FILE_FOLDER_INVALID' });
  assert.equal(fileBatchTargets(data, ['f', 'other'], 'admin', true).length, 2);
  assert.throws(() => fileBatchTargets(data, ['f', 'gone'], 'admin', true), { code: 'FILE_FOLDER_INVALID' });
  assert.throws(
    () =>
      fileBatchTargets(
        data,
        Array.from({ length: 501 }, (_, i) => `f${i}`),
        'admin',
      ),
    { code: 'FILE_FOLDER_INVALID' },
  );
  data.projects[0].perms.m = 'Can view';
  assert.throws(() => fileBatchTargets(data, ['f'], 'editor', true), { code: 'FILE_FOLDER_INVALID' });
});

test('folder mutations and folder-bearing file snapshots cannot bypass project permissions', () => {
  const data = fixture();
  data.tasks = [];
  saveFileFolder(data, { projectId: 'p', id: 'c', name: ' C ', parentId: 'a' }, 'editor');
  assert.equal(data.projects[0].fileFolders.at(-1).name, 'C');
  assert.ok(validateWorkspaceData(data));
  data.files[0].folderId = 'hidden';
  assert.throws(() => validateWorkspaceData(data), { code: 'WORKSPACE_INVALID' });
  data.files[0].folderId = 'a';
  data.projects[0].perms.m = 'Can view';
  const incoming = projectWorkspace(data, { id: 'm', role: 'editor' });
  incoming.projects[0].fileFolders[0].name = 'Forbidden';
  assert.throws(() => mergeClientWorkspace(data, incoming, 'editor', 'm'), { code: 'ENTITY_FORBIDDEN' });
  assert.throws(() => saveFileFolder(data, { projectId: 'p', id: 'd', name: 'D' }, 'editor'), { code: 'FILE_FOLDER_INVALID' });
});
