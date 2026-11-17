import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LocalStorageProvider } from '../../src/server/storage/local-storage.js';
import { IntegrationRegistry, applyIntegrationMemberAccess } from '../../src/server/integration-registry.js';

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

test('member MCP access narrows existing tokens, rejects self grants and revokes tokens permanently on disable', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-integration-'));
  const provider = new LocalStorageProvider(path.join(dir, 'workspace.json'));
  const registry = new IntegrationRegistry({ provider: () => provider });
  const owner = { id: 'owner', role: 'admin' };
  const profile = { id: 'google-profile', email: 'member@example.test', role: 'editor' };
  const member = { id: 'canonical-member', email: profile.email, role: 'Member', status: 'active' };
  const full = ['knowledge:read', 'knowledge:write', 'files:read', 'files:write'];
  try {
    await registry.policy('default', { enabled: true, writeEnabled: true, uploadsEnabled: true });
    const token = (await registry.create(profile, 'default', { name: 'Codex', scopes: full }, member)).token;
    await assert.rejects(async () => registry.setMemberAccess(profile, 'default', member, { enabled: true, scopes: full }), { statusCode: 403 });
    await assert.rejects(async () => registry.setMemberAccess(owner, 'default', member, { enabled: true, scopes: ['admin'] }), {
      code: 'INVALID_MEMBER_ACCESS',
    });
    await registry.setMemberAccess(owner, 'other-space', member, { enabled: false, scopes: [] });
    assert.equal(applyIntegrationMemberAccess(await registry.verify(token), member).scopes.length, 4);
    await registry.setMemberAccess(owner, 'default', member, { enabled: true, scopes: ['knowledge:read'] });
    assert.deepEqual(applyIntegrationMemberAccess(await registry.verify(token), member).scopes, ['knowledge:read']);
    await assert.rejects(async () => registry.create(profile, 'default', { name: 'Bypass', scopes: full }, member), { statusCode: 403 });
    const readToken = (await registry.create(profile, 'default', { name: 'Read only', scopes: ['knowledge:read'] }, member)).token;
    await registry.setMemberAccess(owner, 'default', member, { enabled: true, scopes: full });
    assert.deepEqual(applyIntegrationMemberAccess(await registry.verify(readToken), member).scopes, ['knowledge:read']);
    const listing = await registry.list(owner, 'default', { id: owner.id }, [member]);
    assert.equal(listing.members[0].id, member.id);
    assert.ok(!JSON.stringify(listing).includes(profile.email));
    await registry.setMemberAccess(owner, 'default', member, { enabled: false, scopes: [] });
    await assert.rejects(registry.verify(token), { statusCode: 401 });
    await assert.rejects(registry.verify(readToken), { statusCode: 401 });
    await assert.rejects(async () => registry.create(profile, 'default', { name: 'Blocked', scopes: ['knowledge:read'] }, member), {
      code: 'INTEGRATION_MEMBER_DISABLED',
    });
    await registry.setMemberAccess(owner, 'default', member, { enabled: true, scopes: full });
    await assert.rejects(registry.verify(token), { statusCode: 401 });
    // Old records without memberId are matched to the current canonical member too.
    const legacy = await registry.create(profile, 'default', { name: 'Legacy', scopes: ['knowledge:read'] });
    await registry.setMemberAccess(owner, 'default', member, { enabled: false, scopes: [] }, [member]);
    await assert.rejects(registry.verify(legacy.token), { statusCode: 401 });
  } finally {
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(dir).startsWith('smena-integration-'));
    await fs.rm(dir, { recursive: true, force: true });
  }
});
