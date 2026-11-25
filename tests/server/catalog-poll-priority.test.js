import assert from 'node:assert/strict';
import test from 'node:test';
import { setSessionToken, clearSession, queryFileCatalog, getWorkspaceRevision } from '../../src/core/api.js';

test('a revision probe waits for a foreground catalog read, including a failed read', async t => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
    clearSession();
  });
  setSessionToken('cookie');
  for (const status of [200, 503]) {
    let finish;
    const calls = [];
    globalThis.fetch = async path => {
      calls.push(path);
      if (path.endsWith('/catalog/query'))
        await new Promise(resolve => {
          finish = resolve;
        });
      return new Response('{}', { status: path.endsWith('/catalog/query') ? status : 200 });
    };
    const query = queryFileCatalog({ offset: 50 }).catch(e => e.status);
    const poll = getWorkspaceRevision();
    await Promise.resolve();
    assert.deepEqual(calls, ['/api/files/catalog/query']);
    finish();
    await Promise.all([query, poll]);
    assert.deepEqual(calls, ['/api/files/catalog/query', '/api/workspace/revision']);
  }
});
