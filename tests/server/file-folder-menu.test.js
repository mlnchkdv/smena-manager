import test from 'node:test';
import assert from 'node:assert/strict';

test('folder menus retain native disclosure state across renders, isolated by project and account', async () => {
  const original = globalThis.document;
  globalThis.document = { querySelectorAll: () => [], addEventListener: () => {} };
  const { S } = await import('../../src/core/store.js');
  const { fileFolderMenu, rememberFileFolderMenu } = await import('../../src/ui/file-folder-menu.js');
  const user = S.ui.currentUser;
  const key = JSON.stringify([user?.id, S.data.ws?.id || S.data.ws?.url, 'p', 'f']);
  const toggle = (open, isConnected = true, identity = key) => rememberFileFolderMenu({ target: { open, isConnected, dataset: { fileFolderMenu: identity } } });
  try {
    assert.doesNotMatch(fileFolderMenu('p', 'f'), / open$/u);
    toggle(true);
    assert.match(fileFolderMenu('p', 'f'), / open$/u);
    toggle(false, false);
    toggle(false, true, 'another-menu');
    assert.match(fileFolderMenu('p', 'f'), / open$/u);
    assert.doesNotMatch(fileFolderMenu('other-project', 'f'), / open$/u);
    S.ui.currentUser = { id: 'another-user' };
    assert.doesNotMatch(fileFolderMenu('p', 'f'), / open$/u);
    S.ui.currentUser = user;
    toggle(false);
    assert.doesNotMatch(fileFolderMenu('p', 'f'), / open$/u);
  } finally {
    S.ui.currentUser = user;
    if (original === undefined) delete globalThis.document;
    else globalThis.document = original;
  }
});
