import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkspaceResources } from '../../src/shared/workspace-load.js';

test('bootstrap starts independent reads together rather than waiting for the catalog/core response', async () => {
  const pending = new Map();
  const read = key => new Promise(resolve => pending.set(key, resolve));
  const loaded = loadWorkspaceResources({
    getWorkspace: () => read('core'),
    getWorkspaceDocument: read,
    getPersonalPreferences: () => read('prefs'),
    getFileUploadPolicy: () => read('policy'),
  });
  assert.deepEqual([...pending.keys()], ['core', 'knowledge', 'bookmarks', 'prefs', 'policy']);
  for (const [key, resolve] of pending) resolve(key);
  assert.deepEqual(await loaded, {
    snapshot: 'core',
    documentSnapshots: { knowledge: 'knowledge', bookmarks: 'bookmarks' },
    personal: 'prefs',
    filePolicy: 'policy',
  });
});

test('optional policy failures do not hide required bootstrap read failures', async () => {
  const api = {
    getWorkspace: async () => ({}),
    getWorkspaceDocument: async () => ({}),
    getPersonalPreferences: async () => ({}),
    getFileUploadPolicy: async () => {
      throw new Error('policy unavailable');
    },
  };
  assert.equal((await loadWorkspaceResources(api)).filePolicy, null);
  const error = Object.assign(new Error('Session changed'), { staleSession: true });
  api.getWorkspaceDocument = async () => {
    throw error;
  };
  await assert.rejects(loadWorkspaceResources(api), cause => cause === error);
});
