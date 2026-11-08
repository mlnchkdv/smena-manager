import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createEmptyDatabase, getWorkspaceDatabase, resetWorkspaceStore, mutateWorkspaceDatabase } from '../../src/server/workspace-store.js';
import { getStorageProvider, resetStorageProvider } from '../../src/server/storage/index.js';
import { stageKnowledgeBodyWindow } from '../../src/server/knowledge-body-store.js';
import { stageKnowledgeSearch } from '../../src/server/knowledge-search-store.js';
import { readKnowledgeIntake, readKnowledgeIntakeQueue, writeKnowledgeIntake } from '../../src/server/knowledge-intake-store.js';
import { readKnowledgeCatalog } from '../../src/server/knowledge-catalog.js';
import { replaceKnowledgeCatalog } from '../../src/server/knowledge-catalog-write.js';
import { matchesKnowledgeRules } from '../../src/shared/knowledge-query.js';

test('canonical sharded intake persists outcomes, fences roles/targets, retries exactly and never loads bodies', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-intake-'));
  const keys = [
    'DATABASE_PATH',
    'KNOWLEDGE_CATALOG_ENABLED',
    'KNOWLEDGE_METADATA_SHARDS_ENABLED',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REFRESH_TOKEN',
    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_PRIVATE_KEY',
    'GOOGLE_SERVICE_ACCOUNT_KEY',
    'VERCEL',
  ];
  const old = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const profiles = ['owner', 'editor', 'viewer', 'removed'].map(id => ({
    id,
    email: `${id}@example.test`,
    role: id === 'owner' ? 'admin' : id === 'viewer' ? 'viewer' : 'editor',
  }));
  const [owner, editor, viewer, removed] = profiles;
  try {
    keys.forEach(key => delete process.env[key]);
    Object.assign(process.env, {
      DATABASE_PATH: path.join(directory, 'workspace.json'),
      KNOWLEDGE_CATALOG_ENABLED: 'true',
      KNOWLEDGE_METADATA_SHARDS_ENABLED: 'true',
    });
    resetWorkspaceStore();
    resetStorageProvider();
    let storage = getStorageProvider();
    const source = {
      ...createEmptyDatabase(),
      _aggregateVersion: 1,
      _documentRevisions: { knowledge: { revision: 0 }, bookmarks: { revision: 0 } },
      me: 'owner',
      members: profiles.map(profile => ({
        ...profile,
        role: profile.id === 'owner' ? 'Owner' : profile.id === 'viewer' ? 'Guest' : 'Member',
        status: profile.id === 'removed' ? 'removed' : 'active',
      })),
      projects: [
        { id: 'public', name: 'Public', status: 'In progress', members: ['editor'] },
        { id: 'private', name: 'Private secret', private: true, lead: 'owner', members: [] },
      ],
      knowledgeNotes: [
        { id: 'a', title: 'Capture / Сбор', captureStatus: 'unprocessed', formatted_markdown: '# Exact source', tags: ['test'] },
        { id: 'b', title: 'Other', formatted_markdown: 'No intake yet' },
      ],
    };
    const staged = await stageKnowledgeBodyWindow(source, storage, ['a', 'b']);
    await stageKnowledgeSearch(staged, {}, storage, { reset: true });
    await storage.saveDatabase(staged);
    let bodyReads = 0;
    const readBody = storage.readKnowledgeBody.bind(storage);
    storage.readKnowledgeBody = async (...args) => {
      bodyReads++;
      return readBody(...args);
    };
    assert.equal((await readKnowledgeIntakeQueue({}, owner)).total, 1);
    assert.equal((await readKnowledgeIntakeQueue({ query: 'Сбор' }, viewer)).rows[0].id, 'a');
    await assert.rejects(readKnowledgeIntakeQueue({}, removed), { code: 'WORKSPACE_FORBIDDEN' });
    await assert.rejects(writeKnowledgeIntake('a', {}, viewer), { code: 'WORKSPACE_FORBIDDEN' });
    const assigned = await writeKnowledgeIntake('a', { action: 'assign', ownerId: 'editor', operationId: 'intake-assign-0001', intakeRevision: 0 }, owner);
    assert.equal(assigned.intake.ownerId, 'editor');
    const input = { action: 'resolve', outcome: 'project', projectId: 'public', reason: 'Handoff', operationId: 'intake-resolve-0002', intakeRevision: 1 };
    await assert.rejects(writeKnowledgeIntake('a', { ...input, projectId: 'private' }, editor), { code: 'INTAKE_FORBIDDEN' });
    const resolved = await writeKnowledgeIntake('a', input, editor);
    assert.equal(resolved.intake.state, 'closed');
    const revision = (await getWorkspaceDatabase({ fields: ['revision'] })).revision;
    assert.equal((await writeKnowledgeIntake('a', input, editor)).intake.revision, 2);
    assert.equal((await getWorkspaceDatabase({ fields: ['revision'] })).revision, revision, 'Lost-response replay has no write');
    await assert.rejects(writeKnowledgeIntake('a', { ...input, reason: 'Forgery' }, editor), { code: 'INTAKE_STALE' });
    assert.equal((await readKnowledgeIntakeQueue({}, owner)).total, 0);
    assert.equal((await readKnowledgeIntakeQueue({ state: 'closed', owner: 'me' }, editor)).total, 1);
    const catalog = await readKnowledgeCatalog(owner),
      row = catalog.knowledgeNotes.find(note => note.id === 'a');
    assert.equal(row.intake, undefined, 'Cold catalog omits the journal and target IDs');
    assert.deepEqual(Object.keys(row.intakeSummary).sort(), ['at', 'ownerId', 'state']);
    assert.equal(matchesKnowledgeRules(row, [{ field: 'capture', value: 'unprocessed' }]), false);
    row.intake = null;
    row.title = 'Renamed / Переименовано';
    await replaceKnowledgeCatalog(catalog, catalog.revision, owner);
    assert.equal((await readKnowledgeIntake('a', owner)).intake.revision, 2, 'Ordinary note edits cannot erase intake');
    assert.equal(bodyReads, 1, 'Only the explicit title edit loads its selected body; intake never loads bodies');
    // Canonical project access is rechecked independently of prior handoff.
    const baseline = await getWorkspaceDatabase({ fields: ['revision'] });
    await mutateWorkspaceDatabase(
      data => {
        data.projects.find(project => project.id === 'public').private = true;
        data.projects.find(project => project.id === 'public').members = [];
        return data;
      },
      baseline.revision,
      { role: 'admin' },
    );
    const hidden = await readKnowledgeIntake('a', editor);
    assert.equal(hidden.intake.result.projectId, undefined);
    assert.equal(hidden.intake.result.targetUnavailable, true);
    assert.equal(JSON.stringify(hidden).includes('Private secret'), false);
    assert.equal((await readKnowledgeIntake('a', owner)).intake.result.projectId, 'public');
    resetWorkspaceStore();
    resetStorageProvider();
    storage = getStorageProvider();
    assert.equal((await readKnowledgeIntake('a', editor)).intake.result.targetUnavailable, true);
    const canonical = await getWorkspaceDatabase({ fields: ['knowledgeNotes'] });
    assert.equal(canonical.knowledgeNotes.find(note => note.id === 'a').bodyRef.sha256, staged.knowledgeNotes[0].bodyRef.sha256);
  } finally {
    resetWorkspaceStore();
    resetStorageProvider();
    for (const key of keys) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
    await fs.rm(directory, { recursive: true, force: true });
  }
});
