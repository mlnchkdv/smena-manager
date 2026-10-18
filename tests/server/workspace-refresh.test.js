import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTIVE_REFRESH_MS, HIDDEN_REFRESH_MS, MAX_FAILURE_REFRESH_MS, pollConnectionFlags, workspaceRefreshDelay } from '../../src/core/workspace-refresh.js';

test('successful unchanged polls clear read outages without hiding pending write failures', () => {
  assert.deepEqual(pollConnectionFlags(), { offline: false, syncUnavailable: false });
  assert.deepEqual(pollConnectionFlags({ errors: { workspace: 'offline', knowledge: 'unavailable' } }), { offline: true, syncUnavailable: true });
  assert.deepEqual(pollConnectionFlags({ errors: { bookmarks: 'conflict' } }), { offline: false, syncUnavailable: false });
});

test('workspace refresh is fast while active and conservative in the background', () => {
  assert.equal(workspaceRefreshDelay(), ACTIVE_REFRESH_MS);
  assert.equal(workspaceRefreshDelay({ hidden: true }), HIDDEN_REFRESH_MS);
  assert.equal(workspaceRefreshDelay({ offline: true }), HIDDEN_REFRESH_MS);
});

test('workspace refresh backs off after repeated failures', () => {
  assert.equal(workspaceRefreshDelay({ failures: 1 }), ACTIVE_REFRESH_MS * 2);
  assert.equal(workspaceRefreshDelay({ failures: 20 }), MAX_FAILURE_REFRESH_MS);
});
