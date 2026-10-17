import assert from 'node:assert/strict';
import test from 'node:test';

test('loading a workspace keeps the saved team of the signed-in member', async () => {
  globalThis.document = { querySelectorAll: () => [] };
  globalThis.localStorage = { getItem: () => null, setItem: () => undefined };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { platform: '', userAgent: '' } });
  const [{ applyWorkspaceSnapshot }, { S }, { seed }] = await Promise.all([
    import('../../src/core/bootstrap.js'),
    import('../../src/core/store.js'),
    import('../../src/data/seed.js'),
  ]);
  const originalUser = S.ui.currentUser;
  const data = seed();
  data.members[0].authProfileId = 'admin-profile';
  data.members[0].team = 'saved-team';
  S.ui.currentUser = {
    id: 'admin-profile',
    email: data.members[0].email,
    name: data.members[0].name,
    role: 'admin',
    team: 'configured-default-team',
  };

  try {
    applyWorkspaceSnapshot({ schemaVersion: 1, revision: 3, ...data });
    assert.equal(S.data.members[0].team, 'saved-team');
  } finally {
    S.ui.currentUser = originalUser;
  }
});
