import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createEmptyDatabase, resetWorkspaceStore, getWorkspaceDatabase } from '../../src/server/workspace-store.js';
import { getStorageProvider, resetStorageProvider } from '../../src/server/storage/index.js';
import { researchStore } from '../../src/server/research-store.js';
import { inWorkspace } from '../../src/server/workspace-context.js';
import { validateResearchDraft, validResearchMetric } from '../../src/shared/research.js';

test('research records persist separately, fence stale edits, replay uncertain writes, retain history, and enforce project/member isolation', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-research-'));
  const keys = [
    'DATABASE_PATH',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REFRESH_TOKEN',
    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_PRIVATE_KEY',
    'GOOGLE_SERVICE_ACCOUNT_KEY',
    'VERCEL',
  ];
  const old = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    keys.forEach(key => delete process.env[key]);
    process.env.DATABASE_PATH = path.join(directory, 'workspace.json');
    resetWorkspaceStore();
    resetStorageProvider();
    const profiles = ['owner', 'editor', 'viewer', 'outsider', 'removed'].map(id => ({
      id,
      email: id + '@example.test',
      role: id === 'owner' ? 'admin' : id === 'viewer' ? 'viewer' : 'editor',
    }));
    const [owner, editor, viewer, outsider, removed] = profiles;
    const storage = getStorageProvider();
    await storage.init();
    await storage.saveDatabase({
      ...createEmptyDatabase(),
      _aggregateVersion: 1,
      me: 'owner',
      members: profiles.map(profile => ({
        ...profile,
        role: profile.id === 'owner' ? 'Owner' : profile.id === 'viewer' ? 'Guest' : 'Member',
        status: profile.id === 'removed' ? 'removed' : 'active',
      })),
      projects: [{ id: '3dgs', name: '3DGS', lead: 'owner', access: 'private', members: ['owner', 'editor', 'viewer'] }],
    });
    const enable = { operationId: randomUUID(), action: 'enable', enabled: true };
    await assert.rejects(researchStore.command('3dgs', enable, editor), { code: 'RESEARCH_FORBIDDEN' });
    await researchStore.command('3dgs', enable, owner);
    const input = {
      operationId: randomUUID(),
      action: 'create',
      id: randomUUID(),
      record: {
        kind: 'experiment',
        title: 'Hypothesis / Гипотеза',
        body: 'Exact text',
        data: { hypothesis: 'One controlled factor', criterion: 'Set before run' },
      },
    };
    const saved = await researchStore.command('3dgs', input, editor);
    assert.equal(saved.record.createdBy, 'editor');
    const after = (await getWorkspaceDatabase({ fields: ['revision'] })).revision;
    assert.equal((await researchStore.command('3dgs', input, editor)).replayed, true);
    assert.equal((await getWorkspaceDatabase({ fields: ['revision'] })).revision, after);
    await assert.rejects(researchStore.command('3dgs', { ...input, record: { ...input.record, title: 'Different payload' } }, editor), {
      code: 'RESEARCH_OPERATION_CONFLICT',
    });
    await assert.rejects(researchStore.read('3dgs', outsider), { code: 'RESEARCH_PROJECT_NOT_FOUND' });
    await assert.rejects(researchStore.read('3dgs', removed), { code: 'WORKSPACE_FORBIDDEN' });
    await assert.rejects(researchStore.command('3dgs', { ...input, operationId: randomUUID(), id: randomUUID() }, viewer), { code: 'WORKSPACE_FORBIDDEN' });
    const edit = { operationId: randomUUID(), action: 'update', id: input.id, expectedRevision: 1, record: { ...input.record, title: 'Revised hypothesis' } };
    await researchStore.command('3dgs', edit, editor);
    await assert.rejects(researchStore.command('3dgs', { ...edit, operationId: randomUUID() }, editor), { code: 'RESEARCH_STALE' });
    assert.equal((await researchStore.history('3dgs', input.id, editor)).items[0].record.body, 'Exact text');
    await assert.rejects(researchStore.command('3dgs', { operationId: randomUUID(), action: 'review', id: input.id, expectedRevision: 2 }, editor), {
      code: 'RESEARCH_REVIEW_FORBIDDEN',
    });
    await researchStore.command('3dgs', { operationId: randomUUID(), action: 'review', id: input.id, expectedRevision: 2 }, owner);
    assert.equal((await researchStore.read('3dgs', viewer, [], { id: input.id })).record.review.status, 'reviewed');
    resetWorkspaceStore();
    resetStorageProvider();
    assert.equal((await researchStore.read('3dgs', editor, [], { id: input.id })).record.title, 'Revised hypothesis');
    const root = JSON.parse(await fs.readFile(process.env.DATABASE_PATH, 'utf8'));
    assert.ok(root._researchProjects['3dgs'].sha256);
    assert.ok(!JSON.stringify(root).includes('Revised hypothesis'), 'Bodies and index remain outside workspace snapshot');
    await inWorkspace(randomUUID(), async () => {
      await assert.rejects(researchStore.read('3dgs', owner), { code: 'WORKSPACE_FORBIDDEN' });
    });
    const ref = root._researchProjects['3dgs'];
    await fs.writeFile(path.join(directory, 'research-objects', ref.sha256 + '.json'), '{}');
    await assert.rejects(researchStore.read('3dgs', owner), { code: 'RESEARCH_INTEGRITY' });
  } finally {
    resetWorkspaceStore();
    resetStorageProvider();
    for (const key of keys) old[key] === undefined ? delete process.env[key] : (process.env[key] = old[key]);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test('research metrics preserve measured zero, reject fake missing values and non-finite measurements', () => {
  const base = { key: 'psnr', unit: 'dB', status: 'measured', value: 0, n: 1 };
  assert.equal(validResearchMetric(base), true);
  assert.equal(validResearchMetric({ ...base, value: NaN }), false);
  assert.equal(validResearchMetric({ ...base, status: 'missing' }), false);
  assert.equal(validResearchMetric({ ...base, status: 'missing', value: null, reason: 'No held-out ground truth' }), true);
  assert.throws(() => validateResearchDraft({ kind: 'run', title: 'x', data: { config: { x: Infinity } } }), { code: 'RESEARCH_INVALID' });
});
