import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreBookmarkTrash, trashRestorePlan } from '../../src/shared/trash-recovery.js';
test('restore preview rejects ID collisions, missing projects and lost edit access without modifying data', () => {
  const data = {
    projects: [{ id: 'p', name: 'Private', access: 'private', members: ['m'], perms: { m: 'Can view' } }],
    knowledgeNotes: [],
    knowledgeFolders: [],
    tasks: [],
    files: [],
  };
  const task = { kind: 'task', data: { task: { id: 't', project: 'p' } } };
  assert.ok(trashRestorePlan(task, data, 'm', 'editor').error);
  assert.equal(trashRestorePlan(task, data, 'm', 'admin').error, '');
  assert.ok(trashRestorePlan({ ...task, data: { task: { id: 't', project: 'missing' } } }, data, 'm', 'admin').error);
  const note = { kind: 'note', data: { note: { id: 'n', title: 'Same', folderId: 'gone' } } };
  const before = JSON.stringify(note);
  assert.equal(trashRestorePlan(note, data, 'm', 'editor').missingFolder, true);
  assert.equal(JSON.stringify(note), before);
  data.knowledgeNotes.push({ id: 'n' });
  assert.match(trashRestorePlan(note, data, 'm', 'admin').error, /ID/);
  data.projects[0].fileFolders = [
    { id: 'a', name: 'Captures' },
    { id: 'b', parentId: 'a', name: 'A/B' },
  ];
  const file = { kind: 'file', data: { file: { id: 'f', project: 'p', folderId: 'b' } } };
  assert.equal(trashRestorePlan(file, data, 'm', 'admin').target, 'Private / Captures / A/B');
  data.projects[0].fileFolders[1].archived = true;
  const root = trashRestorePlan(file, data, 'm', 'admin');
  assert.equal(root.target, 'Private');
  assert.equal(root.missingFolder, true);
});

test('restoring a bookmark page from trash is atomic and retains saved copies and folders', () => {
  const bookmark = { id: 'a', folder: 'kept', pageSnapshots: [{ id: 'copy' }], is_archived: true };
  const second = { id: 'b', folder: 'gone', favorite: true };
  const note = { kind: 'note', id: 'trash-note', data: { note: { id: 'n' } } };
  const data = {
    linkFolders: [{ id: 'kept' }],
    links: [{ id: 'b' }],
    trash: [{ kind: 'bookmark', id: 'trash-a', data: { link: bookmark } }, { kind: 'bookmark', id: 'trash-b', data: { link: second } }, note],
  };
  const ids = ['trash-a', 'trash-b'];
  const before = structuredClone(data);
  assert.equal(restoreBookmarkTrash(data, ids, 'm', 'editor'), 0);
  assert.deepEqual(data, before);
  data.links = [];
  assert.equal(restoreBookmarkTrash(data, ids, 'm', 'viewer'), 0);
  assert.equal(restoreBookmarkTrash(data, ['trash-a', 'trash-note'], 'm', 'editor'), 0);
  assert.equal(restoreBookmarkTrash(data, ids, 'm', 'editor'), 2);
  assert.deepEqual(data.links, [bookmark, { ...second, folder: null }]);
  assert.deepEqual(data.trash, [note]);
  assert.equal(restoreBookmarkTrash(data, ids, 'm', 'editor'), 0);
});
