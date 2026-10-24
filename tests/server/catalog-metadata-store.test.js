import test from 'node:test';
import assert from 'node:assert/strict';
import { getStorageProvider, resetStorageProvider } from '../../src/server/storage/index.js';
import { GoogleDriveStorageProvider } from '../../src/server/storage/google-drive.js';
import { catalogCore, materializeCatalog, writeCatalogShards } from '../../src/server/storage/file-catalog-shards.js';
import { rememberStorageVersion } from '../../src/server/storage/version-token.js';
import { createCatalogAccounting } from '../../src/server/file-catalog-accounting.js';
import { createEmptyDatabase, getWorkspaceDatabase, mutateWorkspaceMetadata, resetWorkspaceStore } from '../../src/server/workspace-store.js';
import { replaceWorkspaceDocument } from '../../src/server/workspace-document-store.js';
import { applyPersonalSettings } from '../../src/shared/personal-settings.js';

async function fixture(t) {
  const keys = ['VERCEL', 'WORKSPACE_WRITE_MODE', 'REDIS_URL'];
  const env = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  delete process.env.VERCEL;
  resetStorageProvider();
  resetWorkspaceStore();
  const storage = getStorageProvider();
  let raw = {
    ...createEmptyDatabase(),
    _aggregateVersion: 1,
    revision: 9,
    members: [
      { id: 'me', role: 'Owner' },
      { id: 'other', role: 'Guest' },
    ],
    projects: [
      { id: 'p', name: 'Public' },
      { id: 'private', name: 'Private', access: 'private', members: ['other'] },
    ],
    files: [
      { id: 'f', project: 'p', name: 'Guide.md', storageName: 'guide', storageFileId: 'physical', bytes: 12, history: ['canonical metadata'] },
      { id: 'hidden', project: 'private', name: 'Private.txt', bytes: 20 },
    ],
    relations: [{ id: 'r', from: 'file:f', to: 'project:p', type: 'related' }],
    _documentRevisions: { knowledge: { revision: 2 }, bookmarks: { revision: 3 } },
    notifs: [
      { id: 'mine', recipient: 'me', read: false },
      { id: 'theirs', recipient: 'other', read: false },
    ],
  };
  storage.init = async () => {};
  storage.loadDatabase = async () => structuredClone(raw);
  raw = await getWorkspaceDatabase(); // The same normalization used by canonical publication.
  resetWorkspaceStore();
  const parts = new Map();
  const writePart = async text => {
    const id = `part-${parts.size}`;
    parts.set(id, text);
    return id;
  };
  let root = await writeCatalogShards(raw, null, writePart);
  const reads = { full: 0, metadata: 0, core: 0, writes: 0 };
  const drive = new GoogleDriveStorageProvider();
  drive.databaseFileId = 'db';
  let beforeWrite;
  drive.readDatabaseRoot = async () => {
    reads.metadata++;
    return rememberStorageVersion(structuredClone(root), `v${root.revision}`);
  };
  drive.updateVersionedJson = async (request, options) => {
    if (beforeWrite) {
      const callback = beforeWrite;
      beforeWrite = null;
      callback(root);
    }
    if (options.headers['If-Match'] !== `v${root.revision}`) throw Object.assign(new Error('Precondition failed'), { code: 412 });
    let text = '';
    for await (const chunk of request.media.body) text += chunk;
    root = JSON.parse(text);
    reads.writes++;
    return { headers: { etag: `v${root.revision}` } };
  };
  drive.readCatalogPart = () => assert.fail('Metadata writes must not read immutable parts');
  storage.loadDatabaseMetadata = drive.loadDatabaseMetadata.bind(drive);
  storage.saveDatabaseMetadata = drive.saveDatabaseMetadata.bind(drive);
  storage.loadDatabaseCore = async ({ identities }) => {
    reads.core++;
    return catalogCore(root, { identities });
  };
  storage.loadDatabase = async () => {
    reads.full++;
    return rememberStorageVersion(await materializeCatalog(root, async id => parts.get(id)), `v${root.revision}`);
  };
  storage.saveDatabase = async (next, options) => {
    assert.equal(options.expectedEtag, `v${root.revision}`);
    root = await writeCatalogShards(next, root._fileCatalog, writePart);
    reads.writes++;
  };
  process.env.VERCEL = '1';
  process.env.WORKSPACE_WRITE_MODE = 'drive';
  delete process.env.REDIS_URL;
  t.after(() => {
    for (const key of keys) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
    resetStorageProvider();
    resetWorkspaceStore();
  });
  return {
    storage,
    reads,
    raw,
    root: () => root,
    full: () => materializeCatalog(root, async id => parts.get(id)),
    race: callback => {
      beforeWrite = callback;
    },
  };
}

test('document and personal saves read no catalog parts and never poison the full canonical cache', async t => {
  const f = await fixture(t);
  await getWorkspaceDatabase(); // A warm full cache must be invalidated by root-only writes.
  f.reads.full = 0;
  const descriptors = structuredClone(f.root()._fileCatalog.shards);
  const saved = await replaceWorkspaceDocument('knowledge', { knowledgeNotes: [{ id: 'n', title: 'Заметка Guide' }], knowledgeFolders: [] }, 2);
  assert.equal(saved.revision, 3);
  const preferences = await mutateWorkspaceMetadata(
    db =>
      applyPersonalSettings(db, 'me', {
        preferences: { lang: 'English (US)' },
        profile: { name: 'Updated' },
        readState: { ids: ['mine', 'theirs'], read: true },
      }),
    10,
    { scope: 'preferences', memberId: 'me' },
  );
  assert.equal(preferences.files.length, 2, 'Identity rows preserve API ACL projection and demand catalog totals');
  assert.equal(preferences.files[0].history, undefined);
  assert.equal(f.reads.full, 0);
  assert.equal(f.reads.writes, 2);
  assert.deepEqual(f.root()._fileCatalog.shards, descriptors);
  const complete = await getWorkspaceDatabase();
  assert.equal(f.reads.full, 1);
  assert.deepEqual(complete.files, f.raw.files);
  assert.equal(complete.knowledgeNotes[0].title, 'Заметка Guide');
  assert.equal(complete.members[0].name, 'Updated');
  assert.equal(complete.notifs[0].read, true);
  assert.equal(complete.notifs[1].read, false);
  assert.deepEqual(f.root()._fileCatalog.accounting, createCatalogAccounting(complete));
  assert.deepEqual(complete._fileRegistry, f.raw._fileRegistry);
});

test('stale documents and forbidden personal/file/ACL changes never publish or materialize', async t => {
  const f = await fixture(t);
  await assert.rejects(replaceWorkspaceDocument('knowledge', { knowledgeNotes: [], knowledgeFolders: [] }, 1), { code: 'REVISION_CONFLICT' });
  for (const mutate of [
    db => {
      db.members[0].role = 'Admin';
      return db;
    },
    db => {
      db.files = [{ id: 'injected' }];
      return db;
    },
    db => applyPersonalSettings(db, 'other', { profile: { name: 'Impersonated' } }),
  ]) {
    await assert.rejects(mutateWorkspaceMetadata(mutate, 9, { scope: 'preferences', memberId: 'me' }));
  }
  await assert.rejects(
    mutateWorkspaceMetadata(db => db, 9, { scope: 'toString' }),
    TypeError,
  );
  assert.equal(f.reads.full, 0);
  assert.equal(f.reads.writes, 0);
  assert.equal(f.root().revision, 9);
});

test('root CAS retries unrelated edits without losing them and refuses a concurrently changed document', async t => {
  const f = await fixture(t);
  f.race(root => {
    root.revision++;
    root.ws = { name: 'Concurrent workspace' };
    root._fileCatalog.accounting.revision++;
    root._fileCatalog.accounting.catalogBytes++;
  });
  const saved = await replaceWorkspaceDocument('bookmarks', { links: [{ id: 'l', title: 'Bookmark', url: 'https://example.test' }], linkFolders: [] }, 3);
  assert.equal(saved.revision, 4);
  assert.equal(f.root().ws.name, 'Concurrent workspace');
  assert.equal(f.root().revision, 11);
  assert.equal(f.reads.full, 0);
  f.race(root => {
    root.revision++;
    root._documentRevisions.bookmarks.revision++;
    root._fileCatalog.accounting.revision++;
  });
  await assert.rejects(replaceWorkspaceDocument('bookmarks', { links: [], linkFolders: [] }, 4), { code: 'REVISION_CONFLICT', currentRevision: 5 });
  assert.equal(f.reads.writes, 1);
  assert.equal(f.root().links.length, 1);
  assert.equal(f.reads.full, 0);
});

test('legacy accounting and normalization side effects safely fall back to a complete canonical write', async t => {
  const f = await fixture(t);
  delete f.root()._fileCatalog.accounting;
  await replaceWorkspaceDocument('knowledge', { knowledgeNotes: [], knowledgeFolders: [] }, 2);
  assert.equal(f.reads.full, 1);
  assert.deepEqual((await f.full()).files, f.raw.files);
  delete f.root().projects[0].desc;
  await replaceWorkspaceDocument('knowledge', { knowledgeNotes: [], knowledgeFolders: [] }, 3);
  assert.equal(f.reads.full, 2);
  assert.equal(f.root().projects[0].desc, '');
  assert.deepEqual((await f.full()).files, f.raw.files);
});

test('oversized documents are rejected before publication, without using absent rows for capacity checks', async t => {
  const f = await fixture(t);
  await assert.rejects(
    replaceWorkspaceDocument(
      'knowledge',
      { knowledgeNotes: [{ id: 'n', title: 'Big', formatted_markdown: 'x'.repeat(4 * 1024 * 1024) }], knowledgeFolders: [] },
      2,
    ),
    { code: 'WORKSPACE_TOO_LARGE' },
  );
  assert.equal(f.reads.full, 0);
  assert.equal(f.reads.writes, 0);
});

test('HTTP demand preferences preserve ACL-filtered file totals/relations while legacy clients receive canonical rows', async t => {
  const f = await fixture(t);
  const keys = ['SESSION_SECRET', 'ACCESS_IDS_JSON'];
  const env = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.SESSION_SECRET = 'isolated-metadata-api-test-session-secret';
  const profile = { id: 'me', role: 'editor', name: 'Member', accessId: 'isolated-access' };
  process.env.ACCESS_IDS_JSON = JSON.stringify([profile]);
  t.after(() => {
    for (const key of keys) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
  });
  let sessions = [];
  f.storage.loadAuthSessions = async () => structuredClone(sessions);
  f.storage.saveAuthSessions = async records => {
    sessions = structuredClone(records);
  };
  const { app } = await import('../../src/server/app.js');
  const { createSession } = await import('../../src/server/auth.js');
  const { registerAuthSession } = await import('../../src/server/auth-session-store.js');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const sessionId = 'metadata-test-session';
  const issuedAt = Date.now(),
    expiresAt = issuedAt + 3600000;
  await registerAuthSession({ id: sessionId, userId: 'me', createdAt: issuedAt, lastSeenAt: issuedAt, expiresAt });
  const token = createSession(profile, { sessionId, issuedAt, expiresAt });
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Smena-File-Catalog': 'demand' };
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${origin}/api/preferences`, { method: 'PUT', body: '{}', headers: { 'Content-Type': 'application/json' } })).status, 401);
  // The current stored role is authoritative, not the role embedded at sign-in.
  f.root().members[0].role = 'Guest';
  for (const lang of ['English (US)', 'Русский']) {
    const response = await fetch(`${origin}/api/preferences`, { method: 'PUT', headers, body: JSON.stringify({ preferences: { lang } }) });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.fileCatalog, { total: 1, mode: 'demand' });
    assert.equal(Object.hasOwn(body.data, 'files'), false);
    assert.deepEqual(
      body.data.projects.map(project => project.id),
      ['p'],
    );
    assert.deepEqual(
      body.data.relations.map(relation => relation.id),
      ['r'],
    );
    assert.equal(body.preferences.lang, lang);
  }
  assert.equal(f.reads.full, 0);
  const forbidden = await fetch(`${origin}/api/preferences`, { method: 'PUT', headers, body: JSON.stringify({ profile: { role: 'Owner' } }) });
  assert.equal(forbidden.status, 400);
  const document = await fetch(`${origin}/api/workspace-documents/knowledge`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ data: { knowledgeNotes: [], knowledgeFolders: [] }, revision: 2 }),
  });
  assert.equal(document.status, 403);
  assert.equal(f.reads.writes, 2);
  delete headers['X-Smena-File-Catalog'];
  const legacy = await fetch(`${origin}/api/preferences`, { method: 'PUT', headers, body: JSON.stringify({ preferences: { lang: 'Русский' } }) });
  assert.equal(legacy.status, 200);
  const body = await legacy.json();
  assert.deepEqual(body.data.files[0].history, ['canonical metadata']);
  assert.equal(body.data.files.length, 1);
  assert.equal(f.reads.full, 1);
  assert.equal(f.root().members[0].role, 'Guest');
  assert.deepEqual((await f.full()).files, f.raw.files);
});
