import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleDriveStorageProvider } from '../../src/server/storage/google-drive.js';
import { getStorageProvider, resetStorageProvider } from '../../src/server/storage/index.js';
import { createEmptyDatabase, getWorkspaceDatabase, tryMutateWorkspaceFiles, resetWorkspaceStore } from '../../src/server/workspace-store.js';
import { writeCatalogShards, materializeCatalog, catalogCore } from '../../src/server/storage/file-catalog-shards.js';
import { rememberStorageVersion } from '../../src/server/storage/version-token.js';
import { workspaceCoreData } from '../../src/shared/workspace-documents.js';
import { projectWorkspace } from '../../src/server/workspace-policy.js';
import { createCatalogAccounting } from '../../src/server/file-catalog-accounting.js';

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
    me: 'me',
    members: [
      { id: 'me', role: 'Member' },
      { id: 'owner', role: 'Owner' },
    ],
    projects: [
      { id: 'p', name: 'Public', fileFolders: [{ id: 'folder', name: 'Папка' }] },
      { id: 'private', name: 'Private', access: 'private', members: ['owner'] },
    ],
    files: [
      { id: 'f', name: 'Guide.txt', project: 'p', storageName: 'guide', storageFileId: 'physical', bytes: 12, history: ['canonical'] },
      { id: 'hidden', project: 'private', name: 'Private.txt', history: ['private'] },
    ],
    tasks: [
      {
        id: 't',
        project: 'p',
        title: 'Task',
        attachments: [{ id: 'f', name: 'Guide.txt', project: 'p', storageName: 'guide', storageFileId: 'physical', bytes: 12 }],
      },
    ],
    relations: [{ id: 'r', from: 'file:f', to: 'project:p', type: 'related' }],
  };
  storage.init = async () => {};
  storage.loadDatabase = async () => raw;
  raw = await getWorkspaceDatabase();
  resetWorkspaceStore();
  const parts = new Map();
  const write = async text => {
    const id = `part-${parts.size}`;
    parts.set(id, text);
    return id;
  };
  let root = await writeCatalogShards(raw, null, write);
  const counts = { root: 0, part: 0, full: 0, writes: 0, uploads: 0 };
  const drive = new GoogleDriveStorageProvider();
  drive.databaseFileId = 'db';
  drive.readDatabaseRoot = async () => {
    counts.root++;
    return rememberStorageVersion(structuredClone(root), `v${root.revision}`);
  };
  drive.readCatalogPart = async id => {
    counts.part++;
    return parts.get(id);
  };
  drive.client = {
    files: {
      create: async request => {
        let text = '';
        for await (const chunk of request.media.body) text += chunk;
        counts.uploads++;
        return { data: { id: await write(text) } };
      },
    },
  };
  let race;
  drive.updateVersionedJson = async (request, options) => {
    if (race) {
      race(root);
      race = null;
    }
    if (options.headers['If-Match'] !== `v${root.revision}`) throw Object.assign(new Error('Conflict'), { code: 412 });
    let text = '';
    for await (const chunk of request.media.body) text += chunk;
    root = JSON.parse(text);
    counts.writes++;
    return { headers: { etag: `v${root.revision}` } };
  };
  storage.loadDatabaseFilePatch = drive.loadDatabaseFilePatch.bind(drive);
  storage.saveDatabaseFilePatch = drive.saveDatabaseFilePatch.bind(drive);
  storage.loadDatabaseCore = async ({ identities }) => catalogCore(root, { identities });
  storage.loadDatabase = async () => {
    counts.full++;
    return rememberStorageVersion(await materializeCatalog(root, async id => parts.get(id)), `v${root.revision}`);
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
  const user = { id: 'me', role: 'editor' };
  const payload = () => {
    const { files, schemaVersion, revision, createdAt, updatedAt, workspace, ...incoming } = workspaceCoreData(projectWorkspace(catalogCore(root), user));
    void files;
    void schemaVersion;
    void revision;
    void createdAt;
    void updatedAt;
    void workspace;
    return incoming;
  };
  return {
    storage,
    drive,
    counts,
    raw,
    root: () => root,
    payload,
    user,
    parts,
    full: () => materializeCatalog(root, async id => parts.get(id)),
    race: callback => (race = callback),
  };
}

test('rename and folder moves use only selected parts, retain hidden rows/registry/relations and invalidate the complete cache', async t => {
  const f = await fixture(t);
  const first = { ...f.raw.files[0], name: 'Новое имя.md' };
  const result = await tryMutateWorkspaceFiles(f.payload(), { upsert: [first], remove: [] }, 9, f.user);
  assert.ok(result);
  assert.equal(result.revision, 10);
  assert.equal(result.files.length, 2);
  assert.equal(result.relations[0].id, 'r');
  assert.equal(f.counts.full, 0);
  assert.equal(f.counts.part, 1);
  assert.equal(f.counts.writes, 1);
  const incoming = f.payload();
  incoming.tasks[0].attachments[0].folderId = 'folder';
  assert.ok(await tryMutateWorkspaceFiles(incoming, { upsert: [{ ...first, folderId: 'folder' }], remove: [] }, 10, f.user));
  const full = await getWorkspaceDatabase();
  assert.equal(f.counts.full, 1);
  assert.equal(full.files[0].name, 'Новое имя.md');
  assert.equal(full.tasks[0].attachments[0].folderId, 'folder');
  assert.deepEqual(full.files[1], f.raw.files[1]);
  assert.deepEqual(full._fileRegistry, f.raw._fileRegistry);
  assert.deepEqual(f.root()._fileCatalog.accounting, createCatalogAccounting(full));
});

test('latest role and project ACL reject writes before reading private parts; stale revisions never stage', async t => {
  const f = await fixture(t);
  const changes = { upsert: [{ ...f.raw.files[0], name: 'Renamed' }], remove: [] };
  await assert.rejects(tryMutateWorkspaceFiles(f.payload(), changes, 8, f.user), { code: 'REVISION_CONFLICT' });
  f.root().members[0].role = 'Guest';
  await assert.rejects(tryMutateWorkspaceFiles(f.payload(), changes, 9, { ...f.user, role: 'admin' }), { code: 'ENTITY_FORBIDDEN' });
  f.root().members[0].role = 'Member';
  await assert.rejects(tryMutateWorkspaceFiles(f.payload(), { upsert: [{ ...f.raw.files[1], name: 'Private' }], remove: [] }, 9, f.user), {
    code: 'ENTITY_FORBIDDEN',
  });
  assert.equal(f.counts.part, 0);
  assert.equal(f.counts.uploads, 0);
  assert.equal(f.counts.writes, 0);
});

test('mixed core changes, additions, removals and physical changes fall back without partial publication', async t => {
  const f = await fixture(t);
  const changes = { upsert: [{ ...f.raw.files[0], name: 'Renamed' }], remove: [] };
  const incoming = f.payload();
  incoming.tasks[0].title = 'Other change';
  assert.equal(await tryMutateWorkspaceFiles(incoming, changes, 9, f.user), null);
  assert.equal(await tryMutateWorkspaceFiles(f.payload(), { upsert: [{ id: 'new', name: 'new', project: 'p' }], remove: [] }, 9, f.user), null);
  assert.equal(await tryMutateWorkspaceFiles(f.payload(), { upsert: [], remove: ['f'] }, 9, f.user), null);
  assert.equal(await tryMutateWorkspaceFiles(f.payload(), { upsert: [{ ...f.raw.files[0], storageName: 'forged' }], remove: [] }, 9, f.user), null);
  assert.equal(f.counts.writes, 0);
  assert.equal(f.counts.full, 0);
});

test('CAS loss never overwrites a concurrent root and forged snapshot objects are rejected', async t => {
  const f = await fixture(t);
  f.race(root => {
    root.revision++;
    root.projects[0].name = 'Concurrent';
  });
  await assert.rejects(tryMutateWorkspaceFiles(f.payload(), { upsert: [{ ...f.raw.files[0], name: 'Renamed' }], remove: [] }, 9, f.user), {
    code: 'REVISION_CONFLICT',
  });
  assert.equal(f.root().projects[0].name, 'Concurrent');
  assert.equal(f.counts.writes, 0);
  await assert.rejects(f.drive.saveDatabaseFilePatch({ data: f.raw, files: f.raw.files }, f.raw.files, f.raw.tasks, 10, new Date().toISOString()), {
    code: 'STORAGE_VERSION_MISSING',
  });
});

test('corrupt selected parts fail closed without staging uploads', async t => {
  const f = await fixture(t);
  const part = f.root()._fileCatalog.shards.find(part => part.project === 'p');
  f.parts.set(part.id, '[]');
  await assert.rejects(tryMutateWorkspaceFiles(f.payload(), { upsert: [{ ...f.raw.files[0], name: 'Renamed' }], remove: [] }, 9, f.user), {
    code: 'FILE_CATALOG_CORRUPT',
  });
  assert.equal(f.counts.uploads, 0);
  assert.equal(f.counts.writes, 0);
});

test('lost coordination ownership after staging prevents publication and snapshots ignore the mutable provider cursor', async t => {
  const f = await fixture(t);
  const snapshot = await f.drive.loadDatabaseFilePatch(new Set(['f']), () => true);
  f.drive.databaseEtag = 'unrelated-cursor';
  const files = snapshot.files.map(file => ({ ...file, name: 'Staged' }));
  let checks = 0;
  await assert.rejects(
    f.drive.saveDatabaseFilePatch(snapshot, files, f.root().tasks, 10, new Date().toISOString(), () => {
      if (++checks > 1) throw new Error('Lease lost');
    }),
    /Lease lost/,
  );
  assert.equal(f.counts.writes, 0);
  assert.equal((await f.full()).files[0].name, 'Guide.txt');
  // The same issued snapshot remains bound to v9 rather than databaseEtag.
  assert.ok(await f.drive.saveDatabaseFilePatch(snapshot, files, f.root().tasks, 10, new Date().toISOString()));
  assert.equal(f.counts.writes, 1);
});

test('HTTP demand file edits preserve ACL-filtered relations/totals and refresh full content on demand', async t => {
  const f = await fixture(t);
  const keys = ['SESSION_SECRET', 'ACCESS_IDS_JSON'];
  const env = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.SESSION_SECRET = 'isolated-file-patch-session-secret';
  const profile = { id: 'me', role: 'editor', name: 'Member', accessId: 'isolated-file-patch' };
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
  const sessionId = 'file-patch-session',
    issuedAt = Date.now(),
    expiresAt = issuedAt + 3600000;
  await registerAuthSession({ id: sessionId, userId: 'me', createdAt: issuedAt, lastSeenAt: issuedAt, expiresAt });
  const token = createSession(profile, { sessionId, issuedAt, expiresAt });
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Smena-File-Catalog': 'demand' };
  const origin = `http://127.0.0.1:${server.address().port}`;
  // Match the member profile binding and metadata removal used by the browser.
  const response = await fetch(`${origin}/api/workspace`, { headers });
  assert.equal(response.status, 200);
  const initial = (await response.json()).data;
  const { schemaVersion, revision, createdAt, updatedAt, workspace, ...incoming } = initial;
  void schemaVersion;
  void revision;
  void createdAt;
  void updatedAt;
  void workspace;
  const renamed = { ...f.raw.files[0], name: 'HTTP Русский.md' };
  const saved = await fetch(`${origin}/api/workspace`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ data: incoming, revision: 9, fileChanges: { upsert: [renamed], remove: [] } }),
  });
  assert.equal(saved.status, 200, await saved.clone().text());
  const body = await saved.json();
  assert.deepEqual(body.fileCatalog, { total: 1, mode: 'demand' });
  assert.equal(Object.hasOwn(body.data, 'files'), false);
  assert.deepEqual(
    body.data.relations.map(edge => edge.id),
    ['r'],
  );
  assert.equal(f.counts.full, 0);
  assert.equal(f.counts.part, 1);
  assert.equal((await f.full()).files[0].name, 'HTTP Русский.md');
  const forbidden = await fetch(`${origin}/api/workspace`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ data: body.data, revision: 10, fileChanges: { upsert: [{ ...f.raw.files[1], name: 'Private' }], remove: [] } }),
  });
  assert.equal(forbidden.status, 403);
});
