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
import { readKnowledgeNote } from '../../src/server/knowledge-note-store.js';
import { OperationJournal } from '../../packages/smena-mcp/src/operations.js';

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
    await integrationRegistry.setMemberAccess(actor, 'default', source.members[0], { enabled: true, scopes: [] });
    assert.equal((await call('/api/v1/workspaces/default/notes?q=needle')).status, 403);
    await integrationRegistry.setMemberAccess(actor, 'default', source.members[0], { enabled: true, scopes: ['knowledge:read'] });
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

test('public writes atomically persist receipts, history and audit across races, failures and restart', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-public-write-'));
  const old = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = path.join(dir, 'workspace.json');
  resetStorageProvider();
  resetWorkspaceStore();
  const actor = { id: 'owner', email: 'owner@example.test', name: 'Owner', role: 'admin' };
  await getStorageProvider().saveDatabase({
    ...createEmptyDatabase(),
    me: 'owner',
    ws: { url: 'test', name: 'Test' },
    members: [{ ...actor, role: 'Owner', status: 'active' }],
  });
  await integrationRegistry.policy('default', { enabled: true, writeEnabled: true });
  const issued = await integrationRegistry.create(actor, 'default', { name: 'Codex', scopes: ['knowledge:read', 'knowledge:write'] });
  const reader = await integrationRegistry.create(actor, 'default', { name: 'Read', scopes: ['knowledge:read'] });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const call = (method, url, body, key, etag, token = issued.token) =>
    fetch(origin + '/api/v1' + url, {
      method,
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        ...(key ? { 'Idempotency-Key': key } : {}),
        ...(etag ? { 'If-Match': etag } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    const payload = {
      title: 'Статья / Article',
      content_markdown: '## Test\n\n| A | B |\n|---|---|\n| Привет | 🌍 |\n\n```js\nconsole.log(1)\n```\n[[Other]]',
    };
    assert.equal((await call('POST', '/workspaces/default/notes', payload, 'read-test-key', null, reader.token)).status, 403);
    assert.equal((await call('POST', '/workspaces/default/notes', payload)).status, 428);
    const replies = await Promise.all([
      call('POST', '/workspaces/default/notes', payload, 'same-create-key'),
      call('POST', '/workspaces/default/notes', payload, 'same-create-key'),
    ]);
    assert.deepEqual(
      replies.map(res => res.status),
      [201, 201],
    );
    const results = await Promise.all(replies.map(res => res.json()));
    assert.deepEqual(results[0], results[1]);
    const created = results[0],
      id = created.id;
    assert.equal((await getWorkspaceDatabase()).knowledgeNotes.length, 1);
    assert.equal((await readKnowledgeNote(id, actor)).note.formatted_markdown, payload.content_markdown);
    assert.equal((await call('POST', '/workspaces/default/notes', { ...payload, title: 'Other' }, 'same-create-key')).status, 409);
    resetStorageProvider();
    resetWorkspaceStore();
    const repeated = await call('POST', '/workspaces/default/notes', payload, 'same-create-key');
    assert.equal(repeated.headers.get('Idempotency-Replayed'), 'true');
    assert.deepEqual(await repeated.json(), created);
    const contentPath = '/workspaces/default/notes/' + id + '/content';
    assert.equal((await call('PUT', contentPath, { content_markdown: 'first' }, 'missing-etag-key')).status, 428);
    const changed = await call('PUT', contentPath, { content_markdown: 'first' }, 'edit-first-key', created.etag);
    assert.equal(changed.status, 200);
    const first = await changed.json();
    assert.equal(first.version, 2);
    const replay = await call('PUT', contentPath, { content_markdown: 'first' }, 'edit-first-key', created.etag);
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), first);
    assert.equal((await call('PUT', contentPath, { content_markdown: 'stale' }, 'different-edit-key', created.etag)).status, 412);
    const second = await call('PUT', contentPath, { content_markdown: 'second' }, 'edit-second-key', first.etag);
    assert.equal(second.status, 200);
    const status = await call('GET', '/workspaces/default/operations/edit-second-key');
    assert.equal((await status.json()).state, 'completed');
    const root = await getWorkspaceDatabase();
    assert.equal(root._integrationOperations.length, 3);
    assert.equal(root._integrationAudit.length, 3);
    assert.equal(root.knowledgeNotes[0].history.length, 2);
    assert.equal(root.knowledgeNotes[0].history[0].integrationName, 'Codex');
    assert.ok(!JSON.stringify(root._integrationAudit).includes(issued.token));
    const storage = getStorageProvider(),
      original = storage.writeKnowledgeBody.bind(storage);
    storage.writeKnowledgeBody = async () => {
      throw new Error('injected storage failure');
    };
    assert.equal((await call('POST', '/workspaces/default/notes', { title: 'Recover', content_markdown: 'body' }, 'failed-create-key')).status, 500);
    storage.writeKnowledgeBody = original;
    assert.equal((await getWorkspaceDatabase())._integrationOperations.length, 3);
    assert.equal((await call('POST', '/workspaces/default/notes', { title: 'Recover', content_markdown: 'body' }, 'failed-create-key')).status, 201);
    await integrationRegistry.revoke(actor, 'default', issued.integration.id);
    assert.equal((await call('POST', '/workspaces/default/notes', payload, 'same-create-key')).status, 401);
    const journal = new OperationJournal({ directory: path.join(dir, 'journal') });
    await journal.reserve('operation-id', origin, 'POST', '/notes', { title: 'private text' }, null);
    const restarted = new OperationJournal({ directory: path.join(dir, 'journal') });
    assert.equal((await restarted.recent()).items[0].state, 'pending');
    assert.ok(!JSON.stringify(await restarted.recent()).includes('private text'));
    await assert.rejects(restarted.reserve('operation-id', origin, 'POST', '/notes', { title: 'different' }, null), { code: 'OPERATION_ID_REUSED' });
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    resetStorageProvider();
    resetWorkspaceStore();
    if (old === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = old;
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(dir).startsWith('smena-public-write-'));
    await fs.rm(dir, { recursive: true, force: true });
  }
});
