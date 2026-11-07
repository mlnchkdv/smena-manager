import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createEmptyDatabase, getWorkspaceDatabase, resetWorkspaceStore } from '../../src/server/workspace-store.js';
import { getStorageProvider, resetStorageProvider } from '../../src/server/storage/index.js';
import { stageKnowledgeBodyWindow } from '../../src/server/knowledge-body-store.js';
import { stageKnowledgeSearch } from '../../src/server/knowledge-search-store.js';
import { readKnowledgeGovernance, writeKnowledgeGovernance } from '../../src/server/knowledge-governance-store.js';
import { readKnowledgeNote, patchKnowledgeNote } from '../../src/server/knowledge-note-store.js';
import { readKnowledgeCatalog } from '../../src/server/knowledge-catalog.js';
import { replaceKnowledgeCatalog } from '../../src/server/knowledge-catalog-write.js';

test('real sharded review writes survive restart, preserve body/history pointers, fence roles/hash/CAS and reject client-forged approval', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-knowledge-review-'));
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
    email: id + '@example.test',
    role: id === 'owner' ? 'admin' : id === 'viewer' ? 'viewer' : 'editor',
  }));
  const [owner, editor, viewer, removed] = profiles;
  try {
    for (const key of keys) delete process.env[key];
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
      members: profiles.map(profile => ({
        ...profile,
        role: profile.id === 'owner' ? 'Owner' : profile.id === 'viewer' ? 'Guest' : 'Member',
        status: profile.id === 'removed' ? 'removed' : 'active',
      })),
      me: 'owner',
      knowledgeNotes: [
        { id: 'a', title: 'Review / Проверка', createdBy: 'owner', formatted_markdown: 'Original source / Исходный текст' },
        { id: 'b', title: 'Untouched', formatted_markdown: 'Other private body' },
      ],
    };
    const staged = await stageKnowledgeBodyWindow(source, storage, ['a', 'b']);
    await stageKnowledgeSearch(staged, {}, storage, { reset: true });
    await storage.saveDatabase(staged);
    const bodyA = staged.knowledgeNotes[0].bodyRef.sha256,
      bodyB = staged.knowledgeNotes[1].bodyRef.sha256,
      reads = [];
    const readBody = storage.readKnowledgeBody.bind(storage);
    storage.readKnowledgeBody = async hash => {
      reads.push(hash);
      return readBody(hash);
    };
    const original = await readKnowledgeGovernance('a', owner),
      command = {
        action: 'configure',
        operationId: 'configure-owner-0001',
        reviewHash: original.reviewHash,
        reviewRevision: 0,
        ownerId: 'owner',
        reviewDue: '2030-01-01',
      };
    const configured = await writeKnowledgeGovernance('a', command, owner);
    assert.equal(configured.governance.revision, 1);
    const coreRevision = (await getWorkspaceDatabase({ fields: ['revision'] })).revision;
    const replay = await writeKnowledgeGovernance('a', command, owner);
    assert.deepEqual(replay.governance, configured.governance);
    assert.equal((await getWorkspaceDatabase({ fields: ['revision'] })).revision, coreRevision, 'Lost acknowledgement replay does not write a new revision');
    const requested = await writeKnowledgeGovernance(
      'a',
      { action: 'request', operationId: 'request-editor-0002', reviewHash: original.reviewHash, reviewRevision: 1, reviewers: ['editor'] },
      owner,
    );
    assert.equal(requested.status.status, 'pending');
    const beforeDenial = reads.length;
    for (const actor of [viewer, removed])
      await assert.rejects(writeKnowledgeGovernance('a', { ...command, operationId: 'forbidden-' + actor.id, reviewRevision: 2 }, actor), {
        code: 'WORKSPACE_FORBIDDEN',
      });
    assert.equal(reads.length, beforeDenial, 'Revoked/viewer write access is checked before the body');
    assert.equal((await readKnowledgeGovernance('a', viewer)).canWrite, false);
    const approved = await writeKnowledgeGovernance(
      'a',
      {
        action: 'decide',
        operationId: 'approve-editor-0003',
        reviewHash: original.reviewHash,
        reviewRevision: 2,
        outcome: 'approved',
        comment: 'Reviewed / Проверено',
      },
      editor,
    );
    assert.equal(approved.status.status, 'approved');
    let root = await getWorkspaceDatabase();
    assert.equal(root.knowledgeNotes[0].bodyRef.sha256, bodyA);
    assert.deepEqual(root.knowledgeNotes[0].history, undefined);
    const before = await readKnowledgeNote('a', owner);
    const changed = await patchKnowledgeNote('a', { formatted_markdown: 'Changed source' }, before.noteHash, owner);
    assert.equal((await readKnowledgeGovernance('a', owner)).status.status, 'stale');
    await assert.rejects(
      writeKnowledgeGovernance(
        'a',
        { action: 'decide', operationId: 'stale-decision-0004', reviewHash: approved.reviewHash, reviewRevision: 3, outcome: 'approved', comment: '' },
        editor,
      ),
      { code: 'KNOWLEDGE_VERSION_STALE' },
    );
    await patchKnowledgeNote('a', { formatted_markdown: source.knowledgeNotes[0].formatted_markdown }, changed.noteHash, owner);
    assert.equal(
      (await readKnowledgeGovernance('a', owner)).status.status,
      'approved',
      'Restoring the exact approved snapshot is recognized without deleting decisions',
    );
    const catalog = await readKnowledgeCatalog(owner);
    assert.equal(catalog.knowledgeNotes[0].governance, undefined, 'Cold catalog omits the on-demand review journal');
    catalog.knowledgeNotes[0].governance = { ...approved.governance, ownerId: 'editor' };
    catalog.knowledgeNotes[0].sourceFormat = 'text';
    await replaceKnowledgeCatalog(catalog, catalog.revision, owner);
    assert.equal((await readKnowledgeGovernance('a', owner)).governance.ownerId, 'owner', 'Collection PUT cannot forge governance');
    assert.equal((await readKnowledgeGovernance('a', owner)).status.status, 'stale', 'Changing reading format invalidates approval even for identical bytes');
    const restoredFormat = await readKnowledgeCatalog(owner);
    restoredFormat.knowledgeNotes[0].sourceFormat = 'markdown';
    await replaceKnowledgeCatalog(restoredFormat, restoredFormat.revision, owner);
    assert.equal((await readKnowledgeGovernance('a', owner)).status.status, 'approved');
    const readOnly = await readKnowledgeGovernance('a', owner);
    const save = storage.saveDatabase.bind(storage);
    storage.saveDatabase = async () => {
      throw Object.assign(new Error('Simulated storage failure'), { code: 'EIO' });
    };
    await assert.rejects(
      writeKnowledgeGovernance('a', { ...command, operationId: 'failed-configure-0005', reviewRevision: readOnly.governance.revision }, owner),
      { code: 'EIO' },
    );
    storage.saveDatabase = save;
    assert.equal((await readKnowledgeGovernance('a', owner)).governance.revision, readOnly.governance.revision);
    assert.equal(reads.includes(bodyB), false, 'The other note body is never read by review operations');
    resetWorkspaceStore();
    resetStorageProvider();
    storage = getStorageProvider();
    const restarted = await readKnowledgeGovernance('a', owner);
    assert.equal(restarted.status.status, 'approved');
    assert.equal(restarted.governance.current.decisions[0].by, 'editor');
    assert.equal(restarted.governance.events.length, 3);
  } finally {
    resetWorkspaceStore();
    resetStorageProvider();
    for (const [key, value] of Object.entries(old))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    const absolute = path.resolve(directory);
    assert.ok(absolute.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(absolute).startsWith('smena-knowledge-review-'));
    await fs.rm(absolute, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});
