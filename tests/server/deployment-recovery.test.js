import test from 'node:test';
import assert from 'node:assert/strict';
import { deploymentReloadSafe, failedOverlayTarget } from '../../src/shared/deployment-recovery.js';

test('only failed read-only overlays can be reopened after a deployment', () => {
  const preview = { overlayLoadFailed: true, knowledgeDrawer: 'n1', knowledgeDrawerView: 'preview' };
  assert.deepEqual(failedOverlayTarget(preview), { kind: 'note', id: 'n1' });
  for (const patch of [{ knowledgeDirty: true }, { knowledgeDrawerView: 'edit' }, { overlayLoadFailed: false }, { modals: [{}] }, { pop: {} }])
    assert.equal(failedOverlayTarget({ ...preview, ...patch }), null);
  assert.deepEqual(failedOverlayTarget({ overlayLoadFailed: true, drawer: 't1' }), { kind: 'task', id: 't1' });
  assert.equal(failedOverlayTarget({ overlayLoadFailed: true, drawer: 't1', form: {} }), null);
  assert.equal(deploymentReloadSafe({ clean: true, sync: { hasConflict: true }, forms: false }), false);
});
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
