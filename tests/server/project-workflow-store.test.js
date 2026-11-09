import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createEmptyDatabase, getWorkspaceDatabase, resetWorkspaceStore, mutateWorkspaceDatabase } from '../../src/server/workspace-store.js';
import { getStorageProvider, resetStorageProvider } from '../../src/server/storage/index.js';
import { stageKnowledgeBodyWindow } from '../../src/server/knowledge-body-store.js';
import { stageKnowledgeSearch } from '../../src/server/knowledge-search-store.js';
import { defaultProjectWorkflow } from '../../src/shared/project-workflow.js';
import { readProjectWorkflow, writeProjectWorkflow } from '../../src/server/project-workflow-store.js';

test('real local process configuration survives restart, enforces canonical roles and task batches, and preserves source/metadata on failure', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-project-workflow-'));
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
  const profiles = ['owner', 'editor', 'other', 'viewer', 'removed'].map(id => ({
    id,
    email: `${id}@example.test`,
    role: id === 'owner' ? 'admin' : id === 'viewer' ? 'viewer' : 'editor',
  }));
  const [, editor, other, viewer, removed] = profiles;
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
        { id: 'p', name: 'Project / Проект', lead: 'editor', members: ['editor', 'other'] },
        { id: 'private', name: 'Private secret', lead: 'owner', access: 'private', members: ['owner'] },
      ],
      tasks: [
        { id: 'a', project: 'p', title: 'First', status: 'todo', assignee: 'editor', deps: [], subtasks: [] },
        { id: 'b', project: 'p', title: 'Second', status: 'progress', assignee: 'editor', deps: [], subtasks: [] },
      ],
      knowledgeNotes: [{ id: 'n', title: 'Untouched', formatted_markdown: '# Exact note' }],
    };
    const staged = await stageKnowledgeBodyWindow(source, storage, ['n']);
    await stageKnowledgeSearch(staged, {}, storage, { reset: true });
    await storage.saveDatabase(staged);
    let reads = 0;
    const read = storage.readKnowledgeBody.bind(storage);
    storage.readKnowledgeBody = async (...args) => {
      reads++;
      return read(...args);
    };
    const initial = await readProjectWorkflow('p', editor),
      flow = defaultProjectWorkflow();
    assert.equal(initial.canConfigure, true);
    assert.equal((await readProjectWorkflow('p', other)).canConfigure, false);
    await assert.rejects(readProjectWorkflow('private', editor), { code: 'PROJECT_NOT_FOUND' });
    await assert.rejects(readProjectWorkflow('p', removed), { code: 'WORKSPACE_FORBIDDEN' });
    flow.transitions.todo = ['progress'];
    flow.wip.progress = 1;
    flow.ready.done.description = true;
    flow.cycles = [{ id: 'c1', name: 'First cycle', start: '2026-11-09', end: '2026-11-15', archived: false }];
    flow.activeCycleId = 'c1';
    const command = { workflow: flow, workflowHash: initial.workflowHash };
    await assert.rejects(writeProjectWorkflow('p', command, other), { code: 'WORKFLOW_FORBIDDEN' });
    await assert.rejects(writeProjectWorkflow('p', command, viewer), { code: 'WORKSPACE_FORBIDDEN' });
    const configured = await writeProjectWorkflow('p', command, editor);
    assert.equal(configured.revision, 1);
    assert.equal(configured.updatedBy, 'editor');
    const revision = (await getWorkspaceDatabase({ fields: ['revision'] })).revision;
    assert.equal((await writeProjectWorkflow('p', command, editor)).revision, 1);
    assert.equal((await getWorkspaceDatabase({ fields: ['revision'] })).revision, revision);
    async function change(mutator) {
      const version = (await getWorkspaceDatabase({ fields: ['revision'] })).revision;
      return mutateWorkspaceDatabase(
        data => {
          mutator(data);
          return data;
        },
        version,
        { role: 'editor', actorMemberId: 'editor' },
      );
    }
    await assert.rejects(
      change(data => {
        data.tasks[0].status = 'done';
      }),
      { code: 'WORKFLOW_TRANSITION' },
    );
    await assert.rejects(
      change(data => {
        data.tasks[0].status = 'progress';
      }),
      { code: 'WORKFLOW_WIP' },
    );
    await assert.rejects(
      change(data => {
        data.tasks[0].status = 'progress';
        data.tasks[1].status = 'done';
      }),
      { code: 'WORKFLOW_READY' },
    );
    assert.equal((await getWorkspaceDatabase({ fields: ['revision'] })).revision, revision);
    await change(data => {
      data.tasks[0].status = 'progress';
      data.tasks[0].cycleId = 'c1';
      data.tasks[1].status = 'done';
      data.tasks[1].desc = '<p>Ready</p>';
    });
    const used = await readProjectWorkflow('p', editor);
    assert.equal(used.counts.progress, 1);
    assert.equal(used.counts.done, 1);
    assert.equal(used.cycles[0].tasks, 1);
    const removedCycle = structuredClone(flow);
    removedCycle.cycles = [];
    removedCycle.activeCycleId = '';
    await assert.rejects(writeProjectWorkflow('p', { workflow: removedCycle, workflowHash: used.workflowHash }, editor), {
      code: 'WORKFLOW_CYCLE_UNAVAILABLE',
    });
    const next = structuredClone(flow);
    next.wip.progress = 2;
    const saved = storage.saveDatabase.bind(storage);
    storage.saveDatabase = async () => {
      throw Object.assign(new Error('Simulated failure'), { code: 'EIO' });
    };
    await assert.rejects(writeProjectWorkflow('p', { workflow: next, workflowHash: used.workflowHash }, editor), { code: 'EIO' });
    storage.saveDatabase = saved;
    assert.equal((await readProjectWorkflow('p', editor)).revision, 1);
    assert.equal(reads, 0, 'Process operations do not load knowledge bodies');
    resetWorkspaceStore();
    resetStorageProvider();
    storage = getStorageProvider();
    const restarted = await readProjectWorkflow('p', editor);
    assert.equal(restarted.workflow.wip.progress, 1);
    assert.equal(restarted.updatedBy, 'editor');
    assert.equal((await readProjectWorkflow('p', viewer)).canConfigure, false);
    const canonical = await getWorkspaceDatabase({ fields: ['knowledgeNotes'] });
    assert.equal(canonical.knowledgeNotes[0].bodyRef.sha256, staged.knowledgeNotes[0].bodyRef.sha256);
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
