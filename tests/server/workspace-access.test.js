import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeAccessProfiles, workspaceAccessProfiles } from '../../src/shared/workspace-access.js';

test('workspace members become Google access profiles with safe roles', () => {
  const profiles = workspaceAccessProfiles({
    members: [
      { id: 'm1', name: 'Admin', email: 'ADMIN@example.com', role: 'Admin', status: 'active' },
      { id: 'm2', name: 'Member', email: 'member@example.com', role: 'Member', status: 'invited' },
      { id: 'm3', name: 'Guest', email: 'guest@example.com', role: 'Guest', status: 'active' },
      { id: 'm4', name: 'Removed', email: 'removed@example.com', role: 'Member', status: 'removed' },
    ],
  });

  assert.deepEqual(
    profiles.map(profile => [profile.email, profile.role]),
    [
      ['admin@example.com', 'admin'],
      ['member@example.com', 'editor'],
      ['guest@example.com', 'viewer'],
    ],
  );
});

test('configured profiles take precedence over workspace member profiles', () => {
  const configured = [{ id: 'fixed', email: 'member@example.com', role: 'admin', active: true }];
  const profiles = mergeAccessProfiles(configured, {
    members: [
      { id: 'm1', email: 'member@example.com', role: 'Member', status: 'active' },
      { id: 'm2', email: 'new@example.com', role: 'Member', status: 'invited' },
    ],
  });

  assert.equal(profiles.length, 2);
  assert.equal(profiles[0].id, 'fixed');
  assert.equal(profiles[1].email, 'new@example.com');
});
