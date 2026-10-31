import test from 'node:test';
import assert from 'node:assert/strict';
import { rememberWorkspaceSection, workspaceSectionDestination } from '../../src/shared/workspace-navigation.js';

test('workspace section memory is account and scope specific, never restores object identifiers', () => {
  const values = new Map();
  const storage = { setItem: (k, v) => values.set(k, v), getItem: k => values.get(k) };
  const target = { id: 'private', url: 'my-team', role: 'editor' };
  rememberWorkspaceSection(storage, 'alice', target.id, 'knowledge');
  assert.equal(workspaceSectionDestination(storage, 'alice', target), '/my-team/knowledge');
  assert.equal(workspaceSectionDestination(storage, 'bob', target), '/my-team/home');
  assert.equal(workspaceSectionDestination(storage, 'alice', { ...target, id: 'other' }), '/my-team/home');
  rememberWorkspaceSection(storage, 'alice', target.id, 'project', { id: 'private-object', tab: 'settings' });
  assert.equal(workspaceSectionDestination(storage, 'alice', target), '/my-team/projects');
  rememberWorkspaceSection(storage, 'alice', target.id, 'settings', { sec: 'workspace' });
  assert.equal(workspaceSectionDestination(storage, 'alice', target), '/my-team/home');
  assert.equal(workspaceSectionDestination(storage, 'alice', { ...target, role: 'admin' }), '/my-team/settings/workspace');
  rememberWorkspaceSection(storage, 'alice', target.id, 'settings', { sec: '../escape' });
  assert.equal(workspaceSectionDestination(storage, 'alice', { ...target, role: 'admin' }), '/my-team/home');
  assert.equal(workspaceSectionDestination(undefined, 'alice', target), '/my-team/home');
});
