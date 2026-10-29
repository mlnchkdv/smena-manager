import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeWorkspaceSettings } from '../../src/shared/workspace-settings-draft.js';

test('workspace draft preserves independent remote edits and detects competing field changes', () => {
  const base = { name: 'Team', description: '', url: 'team', c: '#111111' };
  const draft = { ...base, name: 'My team' };
  const remote = { ...base, description: 'Another administrator added this' };
  const merged = mergeWorkspaceSettings(base, draft, remote);
  assert.equal(merged.value.name, 'My team');
  assert.equal(merged.value.description, remote.description);
  assert.deepEqual(merged.conflicts, []);
  assert.deepEqual(mergeWorkspaceSettings(base, draft, { ...remote, name: 'Other team' }).conflicts, ['name']);
  assert.deepEqual(mergeWorkspaceSettings(base, draft, { ...remote, name: draft.name }).conflicts, []);
  assert.equal(base.name, 'Team');
});
