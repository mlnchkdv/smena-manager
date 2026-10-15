import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyWorkspace } from '../../src/shared/empty-workspace.js';

test('empty workspace removes all workspace content but preserves authorized members', () => {
  const database = {
    ws: { name: 'Old workspace', url: 'old', c: '#123456' },
    workspaces: [{ id: 'w1' }, { id: 'w2' }],
    me: 'm1',
    members: [
      { id: 'm1', name: 'Danila', authProfileId: 'admin-danila' },
      { id: 'm2', name: 'Demo member' },
      { id: 'm3', name: 'Alex', authProfileId: 'editor-alex' },
    ],
    projects: [{ id: 'p1' }],
    tasks: [{ id: 't1' }],
    comments: [{ id: 'c1' }],
    knowledgeNotes: [{ id: 'n1' }],
    knowledgeFolders: [],
    links: [{ id: 'l1' }],
    linkFolders: [],
    files: [{ id: 'f1' }],
    activity: [{ id: 'a1' }],
    notifs: [{ id: 'notification-1' }],
    events: [{ id: 'e1' }],
    projOrder: ['p1'],
    savedViews: [{ id: 'v1' }],
    recentSearches: ['query'],
    sessions: [{ id: 's1' }],
    invoices: [{ id: 'i1' }],
    teams: [{ id: 'product' }],
    tfa: true,
    notifPrefs: { email: true },
  };

  const empty = emptyWorkspace(database);

  assert.deepEqual(empty.ws, { name: '', url: '', c: '#123456' });
  assert.equal(empty.me, 'm1');
  assert.deepEqual(
    empty.members.map(member => member.id),
    ['m1', 'm3'],
  );
  assert.deepEqual(empty.workspaces, []);
  assert.deepEqual(empty.projects, []);
  assert.deepEqual(empty.tasks, []);
  assert.deepEqual(empty.files, []);
  assert.equal(empty.tfa, false);
  assert.deepEqual(empty.notifPrefs, {});
  assert.equal(database.projects.length, 1);
});
