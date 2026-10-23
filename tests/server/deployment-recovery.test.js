import test from 'node:test';
import assert from 'node:assert/strict';
import { deploymentReloadSafe } from '../../src/shared/deployment-recovery.js';
test('deployment reload requires a clean session with no forms, recovery errors or transfers', () => {
  assert.equal(deploymentReloadSafe({ clean: true }), true);
  for (const block of [
    { clean: false },
    { forms: 1 },
    { drafts: true },
    { loading: true },
    { authBusy: true },
    { uploads: [{}] },
    { transfer: {} },
    { sync: { hasActive: true } },
    { sync: { hasPending: true } },
    { sync: { hasConflict: true } },
    { sync: { errors: { core: 'offline' } } },
    { personal: { pending: true } },
    { personal: { status: 'offline' } },
  ]) {
    assert.equal(deploymentReloadSafe({ clean: true, ...block }), false, JSON.stringify(block));
  }
});
