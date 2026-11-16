import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LocalStorageProvider } from '../../src/server/storage/local-storage.js';
import { IntegrationRegistry } from '../../src/server/integration-registry.js';

test('integration tokens are private, workspace-bound, revocable and rate limits survive a new registry', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-integration-'));
  const provider = new LocalStorageProvider(path.join(dir, 'workspace.json'));
  let now = Date.now();
  const registry = new IntegrationRegistry({ provider: () => provider, now: () => now });
  const owner = { id: 'owner', email: 'owner@example.test', role: 'admin' };
  const guest = { id: 'guest', email: 'guest@example.test', role: 'viewer' };
  try {
    await assert.rejects(async () => registry.create(owner, 'default', { name: 'Codex', scopes: ['knowledge:read'] }), { code: 'PUBLIC_API_DISABLED' });
    await registry.policy('default', { enabled: true, writeEnabled: true });
    const created = await registry.create(owner, 'default', { name: 'Codex', scopes: ['knowledge:read', 'knowledge:write'], expiresInDays: 1 });
    const raw = await fs.readFile(path.join(dir, 'smena-manager-integrations.json'), 'utf8');
    assert.ok(!raw.includes(created.token) && !raw.includes(created.token.split('.')[1]));
    const listing = await registry.list(owner, 'default');
    assert.ok(!JSON.stringify(listing).includes('secretHash'));
    assert.equal((await registry.list(guest, 'default')).integrations.length, 0);
    assert.equal((await registry.list(owner, 'another')).integrations.length, 0);
    assert.equal((await registry.verify(created.token)).workspaceId, 'default');
    await assert.rejects(registry.verify(created.token.slice(0, -1) + '!'), { statusCode: 401 });
    await assert.rejects(async () => registry.create(guest, 'default', { name: 'Denied', scopes: ['knowledge:write'] }), { statusCode: 403 });
    for (let n = 0; n < 60; n++) await registry.verify(created.token, { touch: true });
    const restarted = new IntegrationRegistry({ provider: () => new LocalStorageProvider(path.join(dir, 'workspace.json')), now: () => now });
    await assert.rejects(restarted.verify(created.token, { touch: true }), { code: 'INTEGRATION_RATE_LIMIT' });
    now += 60000;
    assert.ok(await restarted.verify(created.token, { touch: true }));
    await assert.rejects(registry.revoke(guest, 'default', created.integration.id), { statusCode: 404 });
    await registry.revoke(owner, 'default', created.integration.id);
    await assert.rejects(restarted.verify(created.token), { statusCode: 401 });
    // Replacing workspace content does not touch the independent credential file.
    await fs.writeFile(provider.databasePath, '{}');
    await assert.rejects(new IntegrationRegistry({ provider: () => provider, now: () => now }).verify(created.token), { statusCode: 401 });
    const temporary = await registry.create(guest, 'default', { name: 'Read only', scopes: ['knowledge:read'], expiresInDays: 1 });
    now += 86400001;
    await assert.rejects(registry.verify(temporary.token), { statusCode: 401 });
  } finally {
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(dir).startsWith('smena-integration-'));
    await fs.rm(dir, { recursive: true, force: true });
  }
});
