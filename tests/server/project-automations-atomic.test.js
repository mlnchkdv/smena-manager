import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createEmptyDatabase,
  getWorkspaceDatabase,
  mutateWorkspaceDatabase,
  replaceWorkspaceDatabase,
  resetWorkspaceStore,
} from '../../src/server/workspace-store.js';
import { getStorageProvider, resetStorageProvider } from '../../src/server/storage/index.js';
import { mergeClientWorkspace, projectWorkspace } from '../../src/server/workspace-policy.js';
import { readProjectAutomations, writeProjectAutomations } from '../../src/server/project-automations-store.js';
import { defaultProjectWorkflow } from '../../src/shared/project-workflow.js';
import { stageKnowledgeBodyWindow } from '../../src/server/knowledge-body-store.js';
import { stageKnowledgeSearch } from '../../src/server/knowledge-search-store.js';

test('real canonical CAS commits rule assignments, notification events and receipts together, survives restart and rejects stale/revoked retries', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-automation-atomic-'));
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
    const flow = { ...defaultProjectWorkflow(), cycles: [{ id: 'c', name: 'Done', start: '2026-11-01', end: '2026-11-30', archived: false }] };
    const seed = {
      ...createEmptyDatabase(),
      _aggregateVersion: 1,
      _documentRevisions: { knowledge: { revision: 0 }, bookmarks: { revision: 0 } },
      me: 'owner',
      notifPrefs: { editor: { email_assign: true } },
      members: [
        { id: 'owner', name: 'Owner', role: 'Owner' },
        { id: 'editor', name: 'Editor', role: 'Member', email: 'editor@example.test' },
        { id: 'viewer', name: 'Viewer', role: 'Guest' },
      ],
      projects: [
        { id: 'p', key: 'P', name: 'Public', lead: 'owner', members: ['owner', 'editor', 'viewer'], perms: { viewer: 'Can view' }, workflow: flow },
        { id: 'private', key: 'PRIVATE', access: 'private', members: ['owner'], lead: 'owner' },
      ],
      tasks: ['a', 'b', 'c'].map((id, index) => ({
        id,
        key: 'P-' + (index + 1),
        project: 'p',
        title: id,
        status: 'todo',
        priority: 'low',
        assignee: null,
        cycleId: '',
        deps: [],
        subtasks: [],
      })),
      knowledgeNotes: [{ id: 'n', title: 'Source', formatted_markdown: '# Body remains unchanged' }],
    };
    const staged = await stageKnowledgeBodyWindow(seed, storage, ['n']);
    await stageKnowledgeSearch(staged, {}, storage, { reset: true });
    await storage.saveDatabase(staged);
    let bodyReads = 0;
    const body = storage.readKnowledgeBody.bind(storage);
    storage.readKnowledgeBody = async (...args) => {
      bodyReads++;
      return body(...args);
    };
    const owner = { id: 'owner', role: 'admin' },
      editor = { id: 'editor', role: 'editor' },
      viewer = { id: 'viewer', role: 'viewer' };
    const program = {
      version: 1,
      rules: [
        {
          id: 'r',
          name: 'When starting',
          enabled: true,
          trigger: { from: ['todo', 'created'], to: 'progress' },
          actions: [
            { field: 'priority', value: 'high' },
            { field: 'assignee', value: 'editor' },
            { field: 'cycleId', value: 'c' },
          ],
        },
      ],
    };
    let model = await readProjectAutomations('p', owner);
    const source = await getWorkspaceDatabase({ fields: ['tasks', 'notifs'] });
    await writeProjectAutomations('p', { program, programHash: model.programHash }, owner);
    model = await readProjectAutomations('p', owner);
    assert.equal(model.executionAvailable, true);
    assert.deepEqual(model.history, []);
    assert.deepEqual(await getWorkspaceDatabase({ fields: ['tasks', 'notifs'] }), source, 'Enabling must not run existing tasks');
    const perform = async (id, revision, actor = owner) =>
      mutateWorkspaceDatabase(
        data => mergeClientWorkspace(data, { tasks: data.tasks.map(task => (task.id === id ? { ...task, status: 'progress' } : task)) }, actor.role, actor.id),
        revision,
        { role: actor.role, actorMemberId: actor.id },
      );
    const before = await getWorkspaceDatabase();
    const committed = await perform('a', before.revision);
    const a = committed.tasks.find(task => task.id === 'a'),
      history = committed.projects[0].automationHistory;
    assert.equal(a.priority, 'high');
    assert.equal(a.assignee, 'editor');
    assert.equal(a.cycleId, 'c');
    assert.equal(history.length, 1);
    assert.equal(history[0].assignments, 3);
    assert.equal(history[0].revision, committed.revision);
    assert.equal(history[0].sourceRevision, before.revision);
    assert.ok(committed.notifs.length > before.notifs.length);
    assert.ok(committed._notificationOutbox.length > 0);
    assert.equal(bodyReads, 0);
    const raw = JSON.parse(await fs.readFile(process.env.DATABASE_PATH, 'utf8'));
    assert.equal(raw.tasks.find(task => task.id === 'a').priority, 'high');
    assert.equal(raw.projects[0].automationHistory[0].id, history[0].id);
    await assert.rejects(perform('a', before.revision), { code: 'REVISION_CONFLICT' });
    assert.equal((await getWorkspaceDatabase()).revision, committed.revision);
    const noop = await perform('a', committed.revision);
    assert.equal(noop.projects[0].automationHistory.length, 1);
    assert.equal(noop.notifs.length, committed.notifs.length);
    assert.equal(noop._notificationOutbox.length, committed._notificationOutbox.length);
    // A normal snapshot cannot erase or invent receipts, including in trash.
    const forged = mergeClientWorkspace(
      noop,
      { projects: noop.projects.map(project => (project.id === 'p' ? { ...project, automationHistory: [] } : project)) },
      'admin',
      'owner',
    );
    assert.deepEqual(forged.projects[0].automationHistory, history);
    const privateCopy = { ...noop.projects[1], automationHistory: history };
    const projected = projectWorkspace({ ...noop, projects: [noop.projects[0], privateCopy] }, editor);
    assert.equal(
      projected.projects.some(project => project.id === 'private'),
      false,
    );
    await assert.rejects(perform('b', noop.revision, viewer), { statusCode: 403 });
    // One provider failure publishes neither the task nor an apparent success.
    const save = storage.saveDatabase.bind(storage);
    storage.saveDatabase = async () => {
      throw Object.assign(new Error('Synthetic disk failure'), { code: 'EIO' });
    };
    await assert.rejects(perform('b', noop.revision), { code: 'EIO' });
    storage.saveDatabase = save;
    assert.equal((await getWorkspaceDatabase()).tasks.find(task => task.id === 'b').status, 'todo');
    assert.equal((await getWorkspaceDatabase()).projects[0].automationHistory.length, 1);
    assert.equal(JSON.parse(await fs.readFile(process.env.DATABASE_PATH, 'utf8')).revision, noop.revision);
    // A competing rule disable wins its CAS; the rejected candidate's
    // assignments/receipt must not leak into the retry under the new program.
    const beforeDisable = await getWorkspaceDatabase();
    let disabledRace = false;
    storage.saveDatabase = async (...args) => {
      if (!disabledRace) {
        disabledRace = true;
        const external = structuredClone(beforeDisable);
        external.revision++;
        external.projects[0].automations.rules[0].enabled = false;
        external.projects[0].automationsRevision++;
        external.projects[0].automationsUpdatedAt = new Date().toISOString();
        await save(external);
        throw { code: 412 };
      }
      return save(...args);
    };
    await assert.rejects(perform('b', beforeDisable.revision), { code: 'REVISION_CONFLICT' });
    storage.saveDatabase = save;
    const latestDisabled = await getWorkspaceDatabase();
    assert.equal(latestDisabled.tasks.find(task => task.id === 'b').status, 'todo');
    const underDisabled = await perform('b', latestDisabled.revision);
    assert.equal(underDisabled.tasks.find(task => task.id === 'b').priority, 'low');
    assert.equal(underDisabled.projects[0].automationHistory.length, 1);
    model = await readProjectAutomations('p', owner);
    await writeProjectAutomations('p', { program, programHash: model.programHash }, owner);
    const resetting = await getWorkspaceDatabase();
    await mutateWorkspaceDatabase(
      data => ({ ...data, tasks: data.tasks.map(task => (task.id === 'b' ? { ...task, status: 'todo' } : task)) }),
      resetting.revision,
      { role: 'admin', actorMemberId: 'owner' },
    );

    resetWorkspaceStore();
    resetStorageProvider();
    storage = getStorageProvider();
    let reloaded = await getWorkspaceDatabase();
    assert.equal(reloaded.projects[0].automationHistory[0].id, history[0].id);
    assert.equal(reloaded.tasks.find(task => task.id === 'a').assignee, 'editor');
    assert.equal(reloaded.knowledgeNotes[0].bodyRef.sha256, staged.knowledgeNotes[0].bodyRef.sha256);
    // Simulate a competing canonical writer, then reject the stale admin role.
    const original = storage.saveDatabase.bind(storage);
    let raced = false;
    storage.saveDatabase = async (...args) => {
      if (!raced) {
        raced = true;
        const external = structuredClone(reloaded);
        external.revision++;
        external.members[0].role = 'Guest';
        external.members[1].role = 'Owner';
        await original(external);
        throw { code: 412 };
      }
      return original(...args);
    };
    await assert.rejects(perform('b', reloaded.revision), { code: 'REVISION_CONFLICT' });
    storage.saveDatabase = original;
    reloaded = await getWorkspaceDatabase();
    assert.equal(reloaded.tasks.find(task => task.id === 'b').status, 'todo');
    assert.equal(reloaded.projects[0].automationHistory.length, 1);
    await assert.rejects(perform('b', reloaded.revision), { code: 'AUTOMATION_FORBIDDEN' });
    // Trusted backup replacement restores state without firing task rules.
    const restore = { ...structuredClone(before), tasks: before.tasks.map(task => (task.id === 'b' ? { ...task, status: 'progress' } : task)) };
    const restored = await replaceWorkspaceDatabase(restore, reloaded.revision, { role: 'admin', replaceDocuments: true, actorMemberId: 'owner' });
    assert.equal(restored.tasks.find(task => task.id === 'b').priority, 'low');
    assert.equal(restored.projects[0].automationHistory, undefined);
    model = await readProjectAutomations('p', owner);
    program.rules[0].enabled = false;
    await writeProjectAutomations('p', { program, programHash: model.programHash }, owner);
    const disabled = await getWorkspaceDatabase();
    const plain = await perform('c', disabled.revision);
    assert.equal(plain.tasks.find(task => task.id === 'c').priority, 'low');
    assert.equal(plain.projects[0].automationHistory, undefined);
  } finally {
    resetWorkspaceStore();
    resetStorageProvider();
    for (const key of keys) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('smena-automation-atomic-'));
    await fs.rm(resolved, { recursive: true, force: true });
  }
});
