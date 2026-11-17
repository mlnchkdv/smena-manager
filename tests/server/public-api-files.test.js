import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { once } from 'node:events';
import { app } from '../../src/server/app.js';
import { createEmptyDatabase, getWorkspaceDatabase, resetWorkspaceStore, mutateWorkspaceDatabase } from '../../src/server/workspace-store.js';
import { getStorageProvider, resetStorageProvider } from '../../src/server/storage/index.js';
import { integrationRegistry } from '../../src/server/integration-registry.js';
import { SmenaApiClient } from '../../packages/smena-mcp/src/client.js';
import { OperationJournal } from '../../packages/smena-mcp/src/operations.js';
import { uploadLocalFile } from '../../packages/smena-mcp/src/upload.js';

test('MCP uploads resume at provider offsets, verify SHA-256, register once and attach under live access', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-api-file-'));
  const previous = { DATABASE_PATH: process.env.DATABASE_PATH, SESSION_SECRET: process.env.SESSION_SECRET };
  process.env.DATABASE_PATH = path.join(dir, 'workspace.json');
  process.env.SESSION_SECRET = 'file-api-test-secret-'.repeat(3);
  resetStorageProvider();
  resetWorkspaceStore();
  const actor = { id: 'editor', email: 'editor@example.test', name: 'Editor', role: 'editor' };
  const owner = { id: 'owner', email: 'owner@example.test', name: 'Owner', role: 'admin' };
  const storage = getStorageProvider();
  await storage.saveDatabase({
    ...createEmptyDatabase(),
    me: 'owner',
    ws: { name: 'Test', url: 'test' },
    members: [
      { ...owner, role: 'Owner', status: 'active' },
      { ...actor, role: 'Member', status: 'active' },
    ],
    projects: [{ id: 'p', name: 'Project', members: ['editor'], private: false }],
    knowledgeNotes: [],
  });
  await integrationRegistry.policy('default', { enabled: true, writeEnabled: true, uploadsEnabled: true });
  const issued = await integrationRegistry.create(actor, 'default', {
    name: 'Codex',
    scopes: ['knowledge:read', 'knowledge:write', 'files:read', 'files:write'],
  });
  const other = await integrationRegistry.create(actor, 'default', { name: 'Other client', scopes: ['knowledge:read', 'files:read', 'files:write'] });
  const bytes = Buffer.alloc(12 * 1024 * 1024, 7),
    sha = createHash('sha256').update(bytes).digest('hex');
  const localFile = path.join(dir, 'test-video.mp4');
  await fs.writeFile(localFile, bytes);
  let source,
    starts = 0,
    accepted = 3 * 1024 * 1024,
    lost = true;
  storage.createResumableUpload = async (filename, size, mimeType, marker) => {
    starts++;
    source = { filename, size, mimeType, marker };
    return { uploadUrl: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=private-capability' };
  };
  storage.verifyResumableUpload = async (filename, size, marker) =>
    accepted === bytes.length && filename === source.filename && size === source.size && marker === source.marker
      ? { fileId: 'drive-object', filename, size, mimeType: source.mimeType, sha256: sha }
      : null;
  storage.openDownloadStream = async (_name, _id, range) => ({
    stream: Readable.from([range ? bytes.subarray(range.start, range.end + 1) : bytes]),
    mimeType: 'video/mp4',
    size: bytes.length,
    start: range?.start || 0,
    end: range?.end ?? bytes.length - 1,
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const client = new SmenaApiClient({ origin, token: issued.token }),
    secondClient = new SmenaApiClient({ origin, token: other.token });
  const journal = new OperationJournal({ directory: path.join(dir, 'journal') });
  const operationId = '10000000-0000-4000-8000-000000000001';
  const sent = [];
  try {
    const result = await uploadLocalFile({
      client,
      journal,
      file: localFile,
      workspaceId: 'default',
      projectId: 'p',
      operationId,
      mimeType: 'video/mp4',
      fetch: async (_url, options) => {
        assert.ok(!options.headers.Authorization);
        assert.equal(options.redirect, 'manual');
        const range = options.headers['Content-Range'];
        if (range.startsWith('bytes */'))
          return accepted === bytes.length
            ? new Response(JSON.stringify({ id: 'drive-object' }), { status: 200 })
            : new Response(null, { status: 308, headers: { Range: `bytes=0-${accepted - 1}` } });
        const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range);
        assert.ok(match);
        const start = Number(match[1]),
          end = Number(match[2]);
        sent.push(start);
        assert.equal(start, accepted);
        assert.ok(options.body.length <= 8 * 1024 * 1024);
        assert.deepEqual(options.body, bytes.subarray(start, end + 1));
        accepted = end + 1;
        if (lost) {
          lost = false;
          throw new TypeError('connection lost after acceptance');
        }
        return new Response(JSON.stringify({ id: 'drive-object' }), { status: 200 });
      },
    });
    assert.equal(result.sha256, sha);
    assert.deepEqual(sent, [3 * 1024 * 1024, 11 * 1024 * 1024]);
    assert.equal(starts, 1);
    const rows = (await journal.recent()).items;
    assert.equal(rows[0].state, 'completed');
    assert.ok(!JSON.stringify(rows).includes('private-capability'));
    const uploadId = (await client.call('GET', '/workspaces/default/operations/' + operationId)).result.upload_id;
    assert.ok(uploadId);
    const status = await client.call('GET', '/workspaces/default/uploads/' + uploadId);
    assert.equal(status.state, 'completed');
    assert.ok(!JSON.stringify(status).includes('private-capability'));
    await assert.rejects(secondClient.call('GET', '/workspaces/default/uploads/' + uploadId), { status: 404 });
    const resumed = await uploadLocalFile({
      client,
      journal: new OperationJournal({ directory: path.join(dir, 'journal') }),
      file: localFile,
      workspaceId: 'default',
      projectId: 'p',
      operationId,
      mimeType: 'video/mp4',
      fetch: async () => {
        throw new Error('completed files must not transfer again');
      },
    });
    assert.equal(resumed.id, result.id);
    assert.equal((await getWorkspaceDatabase()).files.length, 1);
    const note = await client.call('POST', '/workspaces/default/notes', {
      body: { title: 'Media', content_markdown: 'See linked material' },
      operationId: 'new-media-note-key',
    });
    const attached = await client.call('POST', '/workspaces/default/notes/' + note.id + '/attachments', {
      body: { file_id: result.id },
      etag: note.etag,
      operationId: 'attach-media-file-key',
    });
    const replay = await client.call('POST', '/workspaces/default/notes/' + note.id + '/attachments', {
      body: { file_id: result.id },
      etag: note.etag,
      operationId: 'attach-media-file-key',
    });
    assert.deepEqual(attached, replay);
    assert.deepEqual(Object.values((await getWorkspaceDatabase()).knowledgeNotes[0].assets), [result.id]);
    const download = await fetch(origin + '/api/v1/workspaces/default/files/' + result.id + '/content', {
      headers: { Authorization: 'Bearer ' + issued.token, Range: 'bytes=0-1023' },
    });
    assert.equal(download.status, 206);
    assert.equal((await download.arrayBuffer()).byteLength, 1024);
    const bad = await client.call('POST', '/workspaces/default/uploads', {
      body: { name: 'bad.mp4', size: bytes.length, project_id: 'p', sha256: '0'.repeat(64) },
      operationId: 'bad-checksum-key',
    });
    await assert.rejects(
      client.call('POST', '/workspaces/default/uploads/' + bad.upload_id + '/complete', { body: { file_id: 'drive-object' }, operationId: 'bad-complete-key' }),
      { code: 'UPLOAD_CHECKSUM_MISMATCH' },
    );
    assert.equal((await getWorkspaceDatabase()).files.length, 1);
    const baseline = await getWorkspaceDatabase();
    const racing = await client.call('POST', '/workspaces/default/uploads', {
      body: { name: 'racing.mp4', size: bytes.length, project_id: 'p', sha256: sha },
      operationId: 'member-permissions-race-begin',
    });
    const originalProof = storage.verifyResumableUpload;
    let probes = 0;
    storage.verifyResumableUpload = async () => {
      if (++probes === 2) await integrationRegistry.setMemberAccess(owner, 'default', baseline.members[1], { enabled: true, scopes: ['knowledge:read'] });
      return { fileId: 'drive-racing-object', filename: source.filename, size: bytes.length, mimeType: 'video/mp4', sha256: sha };
    };
    await assert.rejects(
      client.call('POST', '/workspaces/default/uploads/' + racing.upload_id + '/complete', {
        body: { file_id: 'drive-racing-object' },
        operationId: 'member-permissions-race-complete',
      }),
      { code: 'INTEGRATION_SCOPE_FORBIDDEN' },
    );
    assert.equal((await getWorkspaceDatabase()).files.length, 1, 'a scope reduction during Drive verification must prevent catalog publication');
    storage.verifyResumableUpload = originalProof;
    await integrationRegistry.setMemberAccess(owner, 'default', baseline.members[1], {
      enabled: true,
      scopes: ['knowledge:read', 'knowledge:write', 'files:read', 'files:write'],
    });
    await mutateWorkspaceDatabase(
      data => {
        data.projects[0].private = true;
        data.projects[0].members = ['owner'];
        data.projects[0].lead = 'owner';
        return data;
      },
      (await getWorkspaceDatabase()).revision,
    );
    await assert.rejects(client.call('GET', '/workspaces/default/files/' + result.id), { status: 404 });
    await assert.rejects(client.call('GET', '/workspaces/default/uploads/' + uploadId + '/transport'), { status: 403 });
    await integrationRegistry.revoke(actor, 'default', issued.integration.id);
    await assert.rejects(client.call('GET', '/workspaces/default/uploads/' + uploadId + '/transport'), { status: 401 });
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    resetStorageProvider();
    resetWorkspaceStore();
    for (const [key, value] of Object.entries(previous))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(dir).startsWith('smena-api-file-'));
    await fs.rm(dir, { recursive: true, force: true });
  }
});
