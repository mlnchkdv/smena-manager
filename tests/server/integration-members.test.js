import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { app } from '../../src/server/app.js';
import { createTrackedSession, getAccessProfiles } from '../../src/server/auth.js';
import { createEmptyDatabase, resetWorkspaceStore } from '../../src/server/workspace-store.js';
import { getStorageProvider, resetStorageProvider } from '../../src/server/storage/index.js';
import { createWorkspace } from '../../src/server/workspace-directory.js';

test('MCP member grants in an independent workspace exclude main-workspace login profiles', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-member-grants-'));
  const previous = Object.fromEntries(['DATABASE_PATH', 'SESSION_SECRET', 'ACCESS_IDS_JSON'].map(key => [key, process.env[key]]));
  const owner = { id: 'owner', email: 'owner@example.test', name: 'Owner', role: 'admin', accessId: 'owner-grants-test-access', active: true };
  const outsider = {
    id: 'main-only',
    email: 'main-only@example.test',
    name: 'Main only',
    role: 'editor',
    accessId: 'outsider-grants-test-access',
    active: true,
  };
  Object.assign(process.env, {
    DATABASE_PATH: path.join(directory, 'workspace.json'),
    SESSION_SECRET: 'member-grants-test-secret-with-more-than-32-characters',
    ACCESS_IDS_JSON: JSON.stringify([owner, outsider]),
  });
  resetStorageProvider();
  resetWorkspaceStore();
  await getStorageProvider().saveDatabase({
    ...createEmptyDatabase(),
    me: owner.id,
    ws: { name: 'Main', url: 'main' },
    members: [
      { ...owner, role: 'Owner', status: 'active' },
      { ...outsider, role: 'Member', status: 'active' },
    ],
  });
  const profiles = getAccessProfiles();
  const isolated = await createWorkspace(owner, { name: 'Independent workspace', includeMembers: false }, profiles);
  const token = await createTrackedSession(
    profiles.find(profile => profile.id === owner.id),
    { get: () => '' },
    'access_id',
  );
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const call = (method, suffix = '', body, workspaceId = isolated.id) =>
    fetch(origin + '/api/integrations' + suffix, {
      method,
      headers: { Authorization: 'Bearer ' + token, 'X-Smena-Workspace': workspaceId, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    const response = await call('GET');
    assert.equal(response.status, 200);
    const independent = await response.json();
    assert.deepEqual(
      independent.members.map(member => member.name),
      ['Owner'],
    );
    assert.equal((await call('PATCH', '/members/main-only', { enabled: false, scopes: [] })).status, 404);
    assert.equal((await call('PATCH', '/members/' + independent.members[0].id, { enabled: true, scopes: ['knowledge:read'] })).status, 200);
    const main = await (await call('GET', '', null, 'default')).json();
    assert.deepEqual(main.members.map(member => member.name).sort(), ['Main only', 'Owner']);
    assert.equal(main.members.find(member => member.name === 'Owner').scopes.length, 4, 'personal grants are workspace scoped');
    assert.equal((await call('GET')).status, 200);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    resetStorageProvider();
    resetWorkspaceStore();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(directory).startsWith('smena-member-grants-'));
    await fs.rm(directory, { recursive: true, force: true });
  }
});
