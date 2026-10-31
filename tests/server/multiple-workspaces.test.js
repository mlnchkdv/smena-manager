import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inWorkspace } from '../../src/server/workspace-context.js';
import { getStorageProvider, resetStorageProvider } from '../../src/server/storage/index.js';
import { createWorkspace, setWorkspaceArchived, directoryLoginProfiles, listUserWorkspaces } from '../../src/server/workspace-directory.js';
import {
  getWorkspaceDatabase,
  mutateWorkspaceDatabase,
  replaceWorkspaceDatabase,
  createEmptyDatabase,
  resetWorkspaceStore,
} from '../../src/server/workspace-store.js';
import { bindInitialAdministrator } from '../../src/shared/member-identity.js';
import { LocalStorageProvider } from '../../src/server/storage/local-storage.js';
import { rememberStorageVersion } from '../../src/server/storage/version-token.js';

const owner = { id: 'workspace-test-owner', name: 'Owner', email: 'owner@example.test', role: 'admin', active: true };
const guest = { id: 'workspace-test-guest', name: 'Guest', email: 'guest@example.test', role: 'viewer', active: true };
let directory;
test.before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-multiple-workspaces-'));
  for (const key of [
    'VERCEL',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REFRESH_TOKEN',
    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_SERVICE_ACCOUNT_KEY',
    'GOOGLE_PRIVATE_KEY',
  ])
    delete process.env[key];
  process.env.DATABASE_PATH = path.join(directory, 'workspace.json');
  process.env.UPLOADS_PATH = path.join(directory, 'uploads');
  process.env.BACKUPS_PATH = path.join(directory, 'backups');
  process.env.ACCESS_IDS_JSON = JSON.stringify([owner, guest].map(profile => ({ ...profile, accessId: `${profile.id}-test` })));
  process.env.SESSION_SECRET = 'multi-workspace-tests-only-secret-at-least-32-characters';
  resetStorageProvider();
  resetWorkspaceStore();
  const root = bindInitialAdministrator(bindInitialAdministrator(createEmptyDatabase(), owner), guest);
  root.ws = { id: 'legacy-root', name: 'Original', url: 'original', c: '#555555' };
  await replaceWorkspaceDatabase(root, 0);
});
test.after(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

test('workspace provisioning isolates concurrent data, files, membership, backups and directory writes', async () => {
  const [a, b] = await Promise.all([
    createWorkspace(owner, { name: 'Проект A', includeMembers: false }, [owner, guest]),
    createWorkspace(owner, { name: 'Workspace B', includeMembers: true, locale: 'en' }, [owner, guest]),
  ]);
  assert.notEqual(a.id, b.id);
  assert.equal((await listUserWorkspaces(owner, [owner, guest])).length, 3);
  assert.deepEqual((await listUserWorkspaces(guest, [owner, guest])).map(item => item.id).sort(), ['default', b.id].sort());
  await Promise.all(
    [a, b].map((entry, index) =>
      inWorkspace(entry.id, async () => {
        const data = await getWorkspaceDatabase();
        assert.equal(data.ws.id, entry.id);
        assert.equal(data.members.length, index ? 2 : 1);
        await mutateWorkspaceDatabase(
          current => ({ ...current, knowledgeNotes: [{ id: 'same-note-id', title: entry.name, content: 'Private namespace' }] }),
          data.revision,
        );
        const storage = getStorageProvider();
        assert.notEqual(storage.uploadsPath, process.env.UPLOADS_PATH);
        await storage.uploadFile('same.txt', Buffer.from(entry.name), 'text/plain');
        await storage.createDatabaseBackup(await getWorkspaceDatabase(), entry.name);
      }),
    ),
  );
  for (const entry of [a, b])
    await inWorkspace(entry.id, async () => {
      const data = await getWorkspaceDatabase();
      assert.equal(data.knowledgeNotes[0].title, entry.name);
      assert.equal((await getStorageProvider().listDatabaseBackups()).length, 1);
      assert.equal(await fs.readFile(path.join(getStorageProvider().uploadsPath, 'same.txt'), 'utf8'), entry.name);
      await replaceWorkspaceDatabase({ ...data, ws: { ...data.ws, id: 'forged', url: 'forged' }, _workspaceDirectory: [{ id: 'forged' }] }, data.revision);
      assert.equal((await getWorkspaceDatabase()).ws.url, entry.url);
      assert.deepEqual((await getWorkspaceDatabase())._workspaceDirectory, []);
    });
  const root = await getWorkspaceDatabase();
  await replaceWorkspaceDatabase({ ...createEmptyDatabase(), members: root.members, ws: root.ws, _workspaceDirectory: [] }, root.revision);
  assert.equal((await listUserWorkspaces(owner, [owner, guest])).length, 3, 'restores cannot replace the global directory');
  assert.throws(() => inWorkspace('../escape', () => getWorkspaceDatabase()), /Invalid workspace/u);
  await assert.rejects(createWorkspace(guest, { name: 'Denied' }), /access/u);
  await assert.rejects(createWorkspace({ ...guest, role: 'admin' }, { name: 'Stale privileged profile' }), /access/u);
});

test('HTTP workspace boundary rejects nonmembers and traversal, applies per-workspace roles and keeps global sessions', async () => {
  const { app } = await import('../../src/server/app.js');
  const { createSession, verifySession } = await import('../../src/server/auth.js');
  const { registerAuthSession } = await import('../../src/server/auth-session-store.js');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const tokens = new Map();
  const call = async (user, url, scope, options = {}) => {
    if (!tokens.has(user.id)) {
      const token = createSession(user),
        verified = verifySession(token);
      await registerAuthSession({
        id: verified.sessionId,
        userId: user.id,
        createdAt: verified.issuedAt,
        lastSeenAt: verified.issuedAt,
        expiresAt: verified.expiresAt,
      });
      tokens.set(user.id, token);
    }
    return fetch(`${base}${url}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${tokens.get(user.id)}`,
        ...(scope ? { 'X-Smena-Workspace': scope } : {}),
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      },
    });
  };
  try {
    const spaces = await listUserWorkspaces(owner, [owner, guest]);
    const a = spaces.find(item => item.name === 'Проект A');
    const b = spaces.find(item => item.name === 'Workspace B');
    assert.equal((await call(guest, '/api/workspace', a.id)).status, 403);
    assert.equal((await call(owner, '/api/workspace', '../escape')).status, 403);
    assert.equal((await call(owner, `/api/workspace?workspace=${b.id}`, a.id)).status, 403);
    const response = await call(guest, '/api/workspace', b.id);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.ws.id, b.id);
    assert.equal(body.data._workspaceDirectory, undefined);
    assert.equal(body.data.members.length, 2, 'global profiles must not be injected into child workspaces');
    assert.equal((await call(guest, '/api/workspaces', b.id, { method: 'POST', body: JSON.stringify({ name: 'Denied' }) })).status, 403);
    assert.equal((await call(owner, '/api/auth/me')).status, 200);
    await inWorkspace(a.id, async () => {
      const data = await getWorkspaceDatabase();
      await mutateWorkspaceDatabase(
        current => ({
          ...current,
          members: [...current.members, { id: 'new-child-member', name: 'Child member', email: 'child@example.test', role: 'Member', status: 'active' }],
          _userPrefs: { ...current._userPrefs, 'new-child-member': { lang: 'English (UK)', theme: 'dark' }, [owner.id]: { lang: 'Русский' } },
        }),
        data.revision,
      );
    });
    const profile = (await directoryLoginProfiles([owner, guest])).find(item => item.email === 'child@example.test');
    assert.ok(profile.id.startsWith('workspace:account-'));
    assert.equal((await call(profile, '/api/auth/me', a.id)).status, 200);
    assert.equal((await call(profile, '/api/workspace', b.id)).status, 403);
    assert.equal((await call(profile, '/api/workspace', 'default')).status, 403);
    const createdResponse = await call(profile, '/api/workspaces', a.id, {
      method: 'POST',
      body: JSON.stringify({ name: 'Member-owned workspace' }),
    });
    assert.equal(createdResponse.status, 201);
    const owned = (await createdResponse.json()).workspace;
    const ownedResponse = await call(profile, '/api/workspace', owned.id);
    assert.equal(ownedResponse.status, 200);
    const ownedData = (await ownedResponse.json()).data;
    assert.equal(ownedData.members.length, 1);
    assert.equal(ownedData.members[0].role, 'Owner');
    assert.equal(ownedData.members[0].email, profile.email);
    assert.deepEqual((await (await call(profile, '/api/preferences', owned.id)).json()).preferences, { lang: 'English (UK)' });
    ownedData.ws.name = 'Configured by its creator';
    ownedData.projects.push({ id: 'owned-project', name: 'Owner-only project marker', members: [ownedData.me], lead: ownedData.me });
    ownedData.tasks.push({ id: 'owned-task', title: 'Owner-only task marker', project: 'owned-project', status: 'todo' });
    assert.equal(
      (
        await call(profile, '/api/workspace', owned.id, {
          method: 'PUT',
          body: JSON.stringify({ revision: ownedData.revision, data: ownedData }),
        })
      ).status,
      200,
    );
    assert.equal((await (await call(profile, '/api/workspace', owned.id)).json()).data.ws.name, 'Configured by its creator');
    for (const [name, data] of Object.entries({
      knowledge: { knowledgeNotes: [{ id: 'owned-note', title: 'Owner-only note marker', formatted_markdown: '# Private content' }], knowledgeFolders: [] },
      bookmarks: { links: [{ id: 'owned-bookmark', title: 'Owner-only bookmark marker', url: 'https://example.test/owned' }], linkFolders: [] },
    })) {
      const initial = (await (await call(profile, `/api/workspace-documents/${name}`, owned.id)).json()).data;
      assert.equal(
        (await call(profile, `/api/workspace-documents/${name}`, owned.id, { method: 'PUT', body: JSON.stringify({ revision: initial.revision, data }) }))
          .status,
        200,
      );
      const reloaded = (await (await call(profile, `/api/workspace-documents/${name}`, owned.id)).json()).data;
      const field = name === 'knowledge' ? 'knowledgeNotes' : 'links';
      assert.equal(reloaded[field][0].id, data[field][0].id);
      const sourceDocument = (await (await call(profile, `/api/workspace-documents/${name}`, a.id)).json()).data;
      assert.ok(!sourceDocument[field].some(item => item.id === data[field][0].id));
    }
    const upload = new FormData();
    upload.set('file', new Blob(['Owner-only file marker'], { type: 'text/plain' }), 'owned-isolation.txt');
    upload.set('project', 'owned-project');
    upload.set('revision', String((await (await call(profile, '/api/workspace', owned.id)).json()).data.revision));
    const uploaded = await call(profile, '/api/files/upload', owned.id, { method: 'POST', body: upload });
    assert.equal(uploaded.status, 201);
    const file = (await uploaded.json()).file;
    assert.equal(await (await call(profile, `/api/files/${file.id}/content`, owned.id)).text(), 'Owner-only file marker');
    assert.equal((await call(profile, `/api/files/${file.id}/content`, a.id)).status, 404);
    // A source administrator is not automatically a member of a personal workspace.
    for (const endpoint of [
      '/api/workspace',
      '/api/workspace-documents/knowledge',
      '/api/workspace-documents/bookmarks',
      '/api/files/catalog',
      `/api/files/${file.id}/content`,
    ])
      assert.equal((await call(owner, endpoint, owned.id)).status, 403, endpoint);
    assert.ok(!(await listUserWorkspaces(owner, [owner, guest])).some(item => item.id === owned.id));
    assert.equal(
      (await call(profile, '/api/preferences', owned.id, { method: 'PUT', body: JSON.stringify({ preferences: { lang: 'Русский' } }) })).status,
      200,
    );
    assert.equal((await (await call(profile, '/api/preferences', owned.id)).json()).preferences.lang, 'Русский');
    assert.equal(
      (await (await call(profile, '/api/preferences', a.id)).json()).preferences.lang,
      'English (UK)',
      'later language changes remain workspace-local',
    );
    resetWorkspaceStore();
    resetStorageProvider();
    const coldOwned = (await (await call(profile, '/api/workspace', owned.id)).json()).data;
    assert.equal(coldOwned.ws.name, 'Configured by its creator');
    assert.equal(coldOwned.tasks.find(item => item.id === 'owned-task').title, 'Owner-only task marker');
    assert.equal((await (await call(profile, '/api/workspace-documents/knowledge', owned.id)).json()).data.knowledgeNotes[0].id, 'owned-note');
    assert.equal((await (await call(profile, '/api/workspace-documents/bookmarks', owned.id)).json()).data.links[0].id, 'owned-bookmark');
    assert.equal(await (await call(profile, `/api/files/${file.id}/content`, owned.id)).text(), 'Owner-only file marker');
    assert.equal((await call(owner, '/api/workspace', owned.id)).status, 403);
    const sourceData = (await (await call(profile, '/api/workspace', a.id)).json()).data;
    assert.ok(!sourceData.projects.some(item => item.id === 'owned-project'));
    assert.ok(!sourceData.tasks.some(item => item.id === 'owned-task'));
    assert.ok(!sourceData.files.some(item => item.id === file.id));
    const sourceName = sourceData.ws.name;
    sourceData.ws.name = 'Forbidden source edit';
    assert.equal(
      (
        await call(profile, '/api/workspace', a.id, {
          method: 'PUT',
          body: JSON.stringify({ revision: sourceData.revision, data: sourceData }),
        })
      ).status,
      200,
    );
    assert.equal((await (await call(profile, '/api/workspace', a.id)).json()).data.ws.name, sourceName, 'source administrator fields remain protected');
    const ownedDirectory = await listUserWorkspaces(profile);
    assert.equal(ownedDirectory.find(item => item.id === owned.id).role, 'admin');
    assert.equal(ownedDirectory.find(item => item.id === a.id).role, 'editor');
    assert.equal((await call(profile, '/api/workspace', b.id)).status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('first workspace publication reads a fresh validator after a metadata create response without an ETag', async () => {
  const load = LocalStorageProvider.prototype.loadDatabase;
  const save = LocalStorageProvider.prototype.saveDatabase;
  let guardedWrites = 0;
  LocalStorageProvider.prototype.loadDatabase = async function () {
    const data = await load.call(this);
    return data && this.databasePath.includes(`${path.sep}workspaces${path.sep}`) ? rememberStorageVersion(data, `"revision-${data.revision}"`) : data;
  };
  LocalStorageProvider.prototype.saveDatabase = async function (data, options = {}) {
    const current = await load.call(this);
    if (current && this.databasePath.includes(`${path.sep}workspaces${path.sep}`)) {
      assert.equal(options.expectedEtag, `"revision-${current.revision}"`);
      guardedWrites++;
    }
    return save.call(this, data);
  };
  try {
    await createWorkspace(owner, { name: 'Versioned provisioning' }, [owner]);
    assert.equal(guardedWrites, 1);
  } finally {
    LocalStorageProvider.prototype.loadDatabase = load;
    LocalStorageProvider.prototype.saveDatabase = save;
  }
});

test('creation retry recovers the same published workspace and rejects changed inputs', async () => {
  const operationId = '9dc628ae-9d07-42b8-9d93-e19d6a3b581a';
  const input = { name: 'Idempotent workspace', operationId };
  const first = await createWorkspace(owner, input, [owner]);
  const retry = await createWorkspace(owner, input, [owner]);
  assert.equal(retry.id, first.id);
  assert.equal((await listUserWorkspaces(owner)).filter(item => item.id === first.id).length, 1);
  await assert.rejects(createWorkspace(owner, { ...input, name: 'Changed' }), error => error.code === 'WORKSPACE_INPUT_CHANGED');
});

test('new workspace language falls back to creation locale without copying another member preferences', async () => {
  const entry = await createWorkspace(owner, { name: 'English creation locale', locale: 'en', includeMembers: true }, [owner, guest]);
  const data = await inWorkspace(entry.id, () => getWorkspaceDatabase());
  assert.deepEqual(data._userPrefs, { [owner.id]: { lang: 'English (US)' } });
  assert.equal(data.members.find(member => member.id === owner.id).locale, 'en');
  assert.ok(data.members.some(member => member.email === guest.email));
});

test('workspace archive is reversible, scoped and hides contents without clearing them', async () => {
  const created = await createWorkspace(owner, { name: 'Lifecycle test' });
  await setWorkspaceArchived(owner, created.id, true);
  const entry = (await listUserWorkspaces(owner)).find(item => item.id === created.id);
  assert.equal(entry.archived, true);
  assert.equal((await inWorkspace(created.id, () => getWorkspaceDatabase())).ws.name, 'Lifecycle test');
  await assert.rejects(setWorkspaceArchived(guest, created.id, false));
  await assert.rejects(setWorkspaceArchived(owner, 'default', true));
  await setWorkspaceArchived(owner, created.id, false);
  assert.equal((await listUserWorkspaces(owner)).find(item => item.id === created.id).archived, false);
});

test('failed provisioning resumes the reserved namespace without resetting its written content', async () => {
  const operationId = 'f6a1513c-7f6a-42c3-ae9b-e4434358b6b4';
  const input = { name: 'Recover partial creation', operationId };
  const original = LocalStorageProvider.prototype.ensureUploadsFolder;
  LocalStorageProvider.prototype.ensureUploadsFolder = async () => {
    throw new Error('Simulated interruption after metadata write');
  };
  try {
    await assert.rejects(createWorkspace(owner, input), /Simulated interruption/);
  } finally {
    if (original) LocalStorageProvider.prototype.ensureUploadsFolder = original;
    else delete LocalStorageProvider.prototype.ensureUploadsFolder;
  }
  const reserved = (await getWorkspaceDatabase({ fields: ['_workspaceDirectory'] }))._workspaceDirectory.find(item => item.state === 'failed');
  assert.ok(reserved);
  assert.ok(!(await listUserWorkspaces(owner)).some(item => item.id === reserved.id));
  await inWorkspace(reserved.id, async () => {
    const data = await getWorkspaceDatabase();
    await mutateWorkspaceDatabase(
      current => ({ ...current, knowledgeNotes: [{ id: 'retained-note', title: 'Keep me', content: 'Already written content' }] }),
      data.revision,
    );
  });
  const recovered = await createWorkspace(owner, input);
  assert.equal(recovered.id, reserved.id);
  const data = await inWorkspace(reserved.id, () => getWorkspaceDatabase());
  assert.equal(data.knowledgeNotes[0].id, 'retained-note');
  assert.equal((await getWorkspaceDatabase({ fields: ['_workspaceDirectory'] }))._workspaceDirectory.find(item => item.id === reserved.id).state, 'active');
});
