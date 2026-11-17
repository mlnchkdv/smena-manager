import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { app } from '../../src/server/app.js';
import { memberSharingFixture } from '../fixtures/member-sharing.js';

test('ordinary members cannot widen MCP grants or manage another member token or public link', async () => {
  const fixture = await memberSharingFixture();
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const call = (actor, method, route, body) =>
    fetch(origin + route, {
      method,
      headers: { Authorization: 'Bearer ' + fixture.sessions[actor], 'Content-Type': 'application/json', 'X-Smena-Workspace': 'default' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const tokenCall = (token, route, method = 'GET', body) =>
    fetch(origin + '/api/v1' + route, {
      method,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const full = ['knowledge:read', 'knowledge:write', 'files:read', 'files:write'];
  const grant = scopes => call(0, 'PATCH', '/api/integrations/members/member', { enabled: true, scopes });
  try {
    assert.equal((await call(0, 'PATCH', '/api/integrations/policy', { enabled: true, writeEnabled: true, uploadsEnabled: true })).status, 200);
    const view = await (await call(1, 'GET', '/api/integrations')).json();
    assert.equal(view.canManage, false);
    assert.equal(view.canWrite, true);
    assert.equal(view.members, undefined);
    assert.equal((await call(1, 'PATCH', '/api/integrations/policy', { enabled: false })).status, 403);
    assert.equal((await call(1, 'PATCH', '/api/integrations/members/member', { enabled: true, scopes: full })).status, 403);
    assert.equal((await call(1, 'PATCH', '/api/integrations/members/other', { enabled: false, scopes: [] })).status, 403);
    const issue = async actor => {
      const response = await call(actor, 'POST', '/api/integrations', { name: 'Member acceptance', scopes: full, expiresInDays: 1 });
      assert.equal(response.status, 201, await response.clone().text());
      return response.json();
    };
    const owned = await issue(1);
    const other = await issue(2);
    const ownList = await (await call(1, 'GET', '/api/integrations')).json();
    assert.deepEqual(
      ownList.integrations.map(row => row.id),
      [owned.integration.id],
    );
    assert.ok(!JSON.stringify(ownList).includes('secretHash'));
    assert.equal((await call(1, 'DELETE', '/api/integrations/' + other.integration.id)).status, 404);
    assert.equal((await tokenCall(owned.token, '/me')).status, 200);
    assert.equal((await tokenCall(owned.token, '/workspaces/default/notes/note')).status, 200);
    assert.equal((await tokenCall(owned.token, '/workspaces/default/files/file')).status, 200);
    const blocked = {
      'knowledge:read': ['/workspaces/default/notes/note'],
      'knowledge:write': ['/workspaces/default/notes', 'POST', { title: 'Denied', content_markdown: 'must not be written' }],
      'files:read': ['/workspaces/default/files/file'],
      'files:write': ['/workspaces/default/uploads', 'POST', {}],
    };
    for (const scope of full) {
      assert.equal((await grant(full.filter(value => value !== scope))).status, 200);
      assert.equal((await tokenCall(owned.token, ...blocked[scope])).status, 403, scope + ' is enforced on existing credentials');
      if (scope === 'knowledge:read') {
        const context = await tokenCall(owned.token, '/me');
        assert.equal(context.status, 200, 'file-only MCP access must still identify its workspace and effective scopes');
        assert.deepEqual(
          (await context.json()).scopes,
          full.filter(value => value !== scope),
        );
        assert.equal((await tokenCall(owned.token, '/workspaces')).status, 200);
      }
      assert.equal((await call(1, 'POST', '/api/integrations', { name: 'Bypass', scopes: [scope], expiresInDays: 1 })).status, 403);
      assert.equal((await tokenCall(other.token, '/me')).status, 200, 'another member is unaffected');
    }
    assert.equal((await grant(full)).status, 200);
    assert.equal((await tokenCall(owned.token, '/workspaces/default/notes/note')).status, 200);
    assert.equal((await call(0, 'PATCH', '/api/integrations/members/member', { enabled: false, scopes: [] })).status, 200);
    assert.equal((await tokenCall(owned.token, '/me')).status, 401);
    assert.equal((await call(1, 'POST', '/api/integrations', { name: 'Disabled', scopes: ['knowledge:read'], expiresInDays: 1 })).status, 403);
    assert.equal((await grant(full)).status, 200);
    assert.equal((await tokenCall(owned.token, '/me')).status, 401, 're-enabling never revives a revoked credential');
    const replacement = await issue(1);
    assert.equal((await tokenCall(replacement.token, '/me')).status, 200);
    assert.equal((await call(1, 'DELETE', '/api/integrations/' + replacement.integration.id)).status, 200);
    assert.equal((await tokenCall(replacement.token, '/me')).status, 401);

    for (const locale of ['ru', 'en']) {
      for (const [kind, targetId, projectId] of [
        ['note', 'note', null],
        ['note-folder', 'note-folder', null],
        ['file', 'file', 'shared'],
        ['file-folder', 'file-folder', 'shared'],
      ]) {
        const created = await call(1, 'POST', '/api/public-links', { kind, targetId, projectId, locale, expiresInDays: 1 });
        assert.equal(created.status, 201, kind + ': ' + (await created.clone().text()));
        const link = await created.json();
        const response = await fetch(origin + link.path);
        assert.equal(response.status, 200, kind + ' anonymous');
        if (kind !== 'file') assert.match(await response.text(), new RegExp(locale === 'ru' ? 'Публичный доступ' : 'Public access'));
        assert.equal((await call(2, 'DELETE', '/api/public-links/' + link.id)).status, 404);
        const query = new URLSearchParams({ kind, targetId, ...(projectId ? { projectId } : {}) });
        const hidden = await (await call(2, 'GET', '/api/public-links?' + query)).json();
        assert.equal(hidden.links.length, 0);
        if (kind.endsWith('-folder')) {
          const child = link.path.split('?')[0] + (kind === 'note-folder' ? '/note/note' : '/file/file');
          assert.equal((await fetch(origin + child)).status, 200);
          assert.equal((await call(1, 'DELETE', '/api/public-links/' + link.id)).status, 200);
          assert.equal((await fetch(origin + child)).status, 404);
        } else assert.equal((await call(1, 'DELETE', '/api/public-links/' + link.id)).status, 200);
        assert.equal((await fetch(origin + link.path)).status, 404, kind + ' revoked');
      }
    }
    assert.equal(
      (await call(1, 'POST', '/api/public-links', { kind: 'file', targetId: 'private-file', projectId: 'private', locale: 'en' })).status,
      404,
      'ordinary members cannot expose a private project',
    );
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await fixture.cleanup();
  }
});
