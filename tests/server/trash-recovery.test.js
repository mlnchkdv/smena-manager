import test from 'node:test';
import assert from 'node:assert/strict';
import { trashRestorePlan } from '../../src/shared/trash-recovery.js';
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
});
