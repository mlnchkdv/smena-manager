import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedEditableTasks } from '../../src/shared/task-bulk-scope.js';

const database = {
  me: 'me',
  projects: [
    { id: 'edit', members: ['me'], perms: { me: 'Can edit' } },
    { id: 'read', members: ['me'], perms: { me: 'Can view' } },
    { id: 'hidden', private: true, members: ['other'] },
  ],
  tasks: [
    { id: 'a', project: 'edit' },
    { id: 'b', project: 'edit' },
    { id: 'c', project: 'read' },
    { id: 'd', project: 'hidden' },
    { id: 'e', project: 'edit', archived: true },
    { id: 'orphan', project: 'missing' },
  ],
};
test('bulk action cannot include hidden prior selection, archived tasks, or read-only projects', () => {
  const selected = new Set(database.tasks.map(t => t.id));
  assert.deepEqual(
    selectedEditableTasks(['a', 'c', 'd', 'e', 'orphan'], selected, database, 'editor').map(t => t.id),
    ['a'],
  );
  assert.deepEqual(
    selectedEditableTasks(['a'], selected, database, 'admin').map(t => t.id),
    ['a'],
  );
  assert.deepEqual(selectedEditableTasks(['a'], selected, database, 'viewer'), []);
  assert.deepEqual(selectedEditableTasks(['a'], new Set(['b']), database, 'editor'), []);
});
test('recheck uses current permissions after confirmation, not the opener snapshot', () => {
  const selected = new Set(['a']);
  const changed = structuredClone(database);
  changed.projects[0].perms.me = 'Can comment';
  assert.deepEqual(selectedEditableTasks(['a'], selected, changed, 'editor'), []);
  assert.equal(selectedEditableTasks(['a', 'a'], selected, database, 'editor').length, 1);
});
