import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTIVE_REFRESH_MS, HIDDEN_REFRESH_MS, MAX_FAILURE_REFRESH_MS, workspaceRefreshDelay } from '../../src/core/workspace-refresh.js';

test('workspace refresh is fast while active and conservative in the background', () => {
  assert.equal(workspaceRefreshDelay(), ACTIVE_REFRESH_MS);
  assert.equal(workspaceRefreshDelay({ hidden: true }), HIDDEN_REFRESH_MS);
  assert.equal(workspaceRefreshDelay({ offline: true }), HIDDEN_REFRESH_MS);
});

test('workspace refresh backs off after repeated failures', () => {
  assert.equal(workspaceRefreshDelay({ failures: 1 }), ACTIVE_REFRESH_MS * 2);
  assert.equal(workspaceRefreshDelay({ failures: 20 }), MAX_FAILURE_REFRESH_MS);
});
