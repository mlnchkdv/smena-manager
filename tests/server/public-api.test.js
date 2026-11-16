import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { app } from '../../src/server/app.js';
import { createEmptyDatabase, getWorkspaceDatabase, resetWorkspaceStore, mutateWorkspaceDatabase } from '../../src/server/workspace-store.js';
import { getStorageProvider, resetStorageProvider } from '../../src/server/storage/index.js';
import { integrationRegistry } from '../../src/server/integration-registry.js';
import { stageKnowledgeSearch } from '../../src/server/knowledge-search-store.js';
import { patchKnowledgeNote } from '../../src/server/knowledge-note-store.js';

test('public read API enforces isolated credentials, bounded UTF-8 reads, cursor versions and live membership', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-public-api-'));
  const oldPath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = path.join(dir, 'workspace.json');
  resetStorageProvider();
  resetWorkspaceStore();
  const actor = { id: 'owner', email: 'owner@example.test', name: 'Owner', role: 'admin' };
  const source = {
    ...createEmptyDatabase(),
    me: 'owner',
    ws: { name: 'Smena', url: 'smena' },
    members: [
      { ...actor, role: 'Owner', status: 'active' },
      { id: 'other-admin', email: 'other@example.test', role: 'Owner', name: 'Other owner', status: 'active' },
    ],
    knowledgeNotes: [
      { id: 'a', title: 'Тест / Test', formatted_markdown: 'Привет 🌍 needle\n'.repeat(5000) },
      { id: 'b', title: 'Second', formatted_markdown: 'short' },
    ],
  };
  await stageKnowledgeSearch(source, {}, getStorageProvider(), { reset: true });
  await getStorageProvider().saveDatabase(source);
  await integrationRegistry.policy('default', { enabled: true });
  const { token, integration } = await integrationRegistry.create(actor, 'default', { name: 'Codex read', scopes: ['knowledge:read'] });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const call = (url, extra = {}) => fetch(origin + url, { ...extra, headers: { Authorization: 'Bearer ' + token, ...extra.headers } });
  try {
    assert.equal((await fetch(origin + '/api/v1/me')).status, 401);
    assert.equal((await call('/api/workspace')).status, 401);
    assert.equal((await call('/api/v1/workspaces/other/notes/a')).status, 404);
    assert.equal((await call('/api/v1/me', { headers: { 'X-Smena-Workspace': 'default' } })).status, 422);
    const context = await (await call('/api/v1/me')).json();
    assert.equal(context.workspace.id, 'default');
    assert.deepEqual(context.scopes, ['knowledge:read']);
    const search = await (await call('/api/v1/workspaces/default/notes?q=needle')).json();
    assert.deepEqual(
      search.items.map(note => note.id),
      ['a'],
    );
    assert.ok(!JSON.stringify(search).includes('bodyRef'));
    const result = await call('/api/v1/workspaces/default/notes/a?max_bytes=300');
    const first = await result.json();
    assert.ok(Buffer.byteLength(first.content_markdown) <= 300 && !first.content_markdown.includes('\ufffd'));
    assert.ok(first.next_cursor && first.url.endsWith('/smena/note/a'));
    const next = await (await call('/api/v1/workspaces/default/notes/a?max_bytes=300&cursor=' + encodeURIComponent(first.next_cursor))).json();
    assert.equal(
      first.content_markdown + next.content_markdown,
      source.knowledgeNotes[0].formatted_markdown.slice(0, first.content_markdown.length + next.content_markdown.length),
    );
    const internal = await import('../../src/server/knowledge-versions.js');
    await patchKnowledgeNote('a', { title: 'Changed' }, internal.knowledgeSnapshotHash(source.knowledgeNotes[0]), actor);
    assert.equal((await call('/api/v1/workspaces/default/notes/a?cursor=' + encodeURIComponent(first.next_cursor))).status, 409);
    const baseline = await getWorkspaceDatabase();
    await mutateWorkspaceDatabase(data => {
      data.members[0].status = 'removed';
      return data;
    }, baseline.revision);
    assert.equal((await call('/api/v1/me')).status, 403);
    await integrationRegistry.revoke(actor, 'default', integration.id);
    assert.equal((await call('/api/v1/me')).status, 401);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    resetStorageProvider();
    resetWorkspaceStore();
    if (oldPath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = oldPath;
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(dir).startsWith('smena-public-api-'));
    await fs.rm(dir, { recursive: true, force: true });
  }
});
