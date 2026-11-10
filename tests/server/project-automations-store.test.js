import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createEmptyDatabase, getWorkspaceDatabase, resetWorkspaceStore } from '../../src/server/workspace-store.js';
import { getStorageProvider, resetStorageProvider } from '../../src/server/storage/index.js';
import { stageKnowledgeBodyWindow } from '../../src/server/knowledge-body-store.js';
import { stageKnowledgeSearch } from '../../src/server/knowledge-search-store.js';
import { readProjectAutomations, writeProjectAutomations, previewProjectAutomations } from '../../src/server/project-automations-store.js';
import { readProjectWorkflow, writeProjectWorkflow } from '../../src/server/project-workflow-store.js';
import { defaultProjectWorkflow } from '../../src/shared/project-workflow.js';

test('local rule settings survive restart, reject invalid activation/stale writes, and preview canonical transitions without publishing tasks', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-project-automations-'));
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
    'SESSION_SECRET',
    'ACCESS_IDS_JSON',
  ];
  const old = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const profiles = ['owner', 'full', 'editor', 'viewer', 'removed'].map(id => ({
    id,
    email: id + '@example.test',
    accessId: 'isolated-automation-' + id,
    role: id === 'owner' ? 'admin' : id === 'viewer' ? 'viewer' : 'editor',
  }));
  const [owner, full, editor, viewer, removed] = profiles;
  try {
    keys.forEach(key => delete process.env[key]);
    Object.assign(process.env, {
      DATABASE_PATH: path.join(directory, 'workspace.json'),
      KNOWLEDGE_CATALOG_ENABLED: 'true',
      KNOWLEDGE_METADATA_SHARDS_ENABLED: 'true',
      SESSION_SECRET: 'isolated-automation-api-test-session-secret',
      ACCESS_IDS_JSON: JSON.stringify(profiles),
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
        { id: 'p', name: 'Project / Проект', lead: 'full', members: ['full', 'editor', 'viewer'], perms: { editor: 'Can edit', viewer: 'Can view' } },
        { id: 'secret', access: 'private', lead: 'owner', members: ['owner'] },
      ],
      tasks: [
        { id: 'a', project: 'p', title: 'First', status: 'todo', priority: 'low', assignee: 'full', desc: '<p>Ready</p>', deps: [], subtasks: [] },
        { id: 'b', project: 'p', title: 'Second', status: 'progress', priority: 'medium', assignee: 'editor', deps: [], subtasks: [] },
        { id: 'hidden', project: 'secret', title: 'Private title', status: 'todo', assignee: 'owner', deps: [], subtasks: [] },
      ],
      knowledgeNotes: [{ id: 'n', title: 'Exact', formatted_markdown: '# Never read' }],
    };
    const staged = await stageKnowledgeBodyWindow(source, storage, ['n']);
    await stageKnowledgeSearch(staged, {}, storage, { reset: true });
    await storage.saveDatabase(staged);
    let bodyReads = 0;
    const read = storage.readKnowledgeBody.bind(storage);
    storage.readKnowledgeBody = async (...args) => {
      bodyReads++;
      return read(...args);
    };
    const initial = await readProjectAutomations('p', full, profiles);
    assert.equal(initial.canConfigure, true);
    assert.equal(initial.executionAvailable, true);
    assert.equal((await readProjectAutomations('p', editor, profiles)).canConfigure, false);
    assert.equal((await readProjectAutomations('p', viewer, profiles)).canPreview, false);
    await assert.rejects(readProjectAutomations('secret', editor, profiles), { code: 'PROJECT_NOT_FOUND' });
    await assert.rejects(readProjectAutomations('p', removed, profiles), { code: 'WORKSPACE_FORBIDDEN' });
    const program = {
      version: 1,
      rules: [
        {
          id: 'r',
          name: 'On progress / При начале',
          enabled: false,
          trigger: { from: ['todo'], to: 'progress' },
          actions: [{ field: 'priority', value: 'high' }],
        },
      ],
    };
    for (const profile of [editor, viewer])
      await assert.rejects(writeProjectAutomations('p', { program, programHash: initial.programHash }, profile, profiles), { statusCode: 403 });
    const configured = await writeProjectAutomations('p', { program, programHash: initial.programHash }, full, profiles);
    assert.equal(configured.revision, 1);
    assert.equal(configured.updatedBy, 'full');
    const before = await getWorkspaceDatabase({ fields: ['revision', 'tasks', 'notifs'] });
    assert.equal((await writeProjectAutomations('p', { program, programHash: initial.programHash }, full, profiles)).revision, 1);
    assert.equal((await getWorkspaceDatabase({ fields: ['revision'] })).revision, before.revision);
    const changed = structuredClone(program);
    changed.rules[0].name += ' changed';
    await assert.rejects(writeProjectAutomations('p', { program: changed, programHash: initial.programHash }, full, profiles), { code: 'AUTOMATION_STALE' });
    const active = structuredClone(program);
    active.rules[0].enabled = true;
    active.rules[0].actions.push({ field: 'assignee', value: 'unavailable' });
    await assert.rejects(writeProjectAutomations('p', { program: active, programHash: configured.programHash }, full, profiles), {
      code: 'AUTOMATION_ASSIGNEE_UNAVAILABLE',
    });
    const preview = await previewProjectAutomations('p', { program, transitions: [{ taskId: 'a', to: 'progress' }] }, editor, profiles);
    assert.equal(preview.blocked, false);
    assert.equal(preview.canExecute, false);
    assert.equal(preview.appliedOperations, 0);
    assert.equal(preview.changes[0].fields[0].to, 'high');
    await assert.rejects(previewProjectAutomations('p', { program, transitions: [{ taskId: 'a', to: 'progress' }] }, viewer, profiles), { statusCode: 403 });
    await assert.rejects(previewProjectAutomations('p', { program, transitions: [{ taskId: 'hidden', to: 'progress' }] }, full, profiles), {
      code: 'AUTOMATION_TASK_NOT_FOUND',
    });
    await assert.rejects(previewProjectAutomations('p', { program, actorId: 'owner', transitions: [{ taskId: 'a', to: 'progress' }] }, full, profiles), {
      code: 'AUTOMATION_PREVIEW_INVALID',
    });
    assert.deepEqual(
      await getWorkspaceDatabase({ fields: ['revision', 'tasks', 'notifs'] }),
      before,
      'Preview must not save tasks, revisions or notifications',
    );
    let model = await readProjectWorkflow('p', full, profiles),
      flow = defaultProjectWorkflow();
    flow.wip.progress = 1;
    await writeProjectWorkflow('p', { workflow: flow, workflowHash: model.workflowHash }, full, profiles);
    await assert.rejects(previewProjectAutomations('p', { program, transitions: [{ taskId: 'a', to: 'progress' }] }, full, profiles), { code: 'WORKFLOW_WIP' });
    model = await readProjectWorkflow('p', full, profiles);
    flow.wip.progress = 2;
    flow.ready.done.assignee = true;
    await writeProjectWorkflow('p', { workflow: flow, workflowHash: model.workflowHash }, full, profiles);
    const clear = structuredClone(program);
    clear.rules[0].trigger.to = 'done';
    clear.rules[0].actions = [{ field: 'assignee', value: null }];
    const rejected = await previewProjectAutomations('p', { program: clear, transitions: [{ taskId: 'a', to: 'done' }] }, full, profiles);
    assert.equal(rejected.blocked, true);
    assert.deepEqual(rejected.changes, []);
    assert.equal(rejected.issues[0].cause, 'WORKFLOW_READY');
    const save = storage.saveDatabase.bind(storage);
    storage.saveDatabase = async () => {
      throw Object.assign(new Error('Synthetic disk failure'), { code: 'EIO' });
    };
    await assert.rejects(writeProjectAutomations('p', { program: changed, programHash: configured.programHash }, full, profiles), { code: 'EIO' });
    storage.saveDatabase = save;
    assert.equal((await readProjectAutomations('p', full, profiles)).revision, 1);
    assert.equal(bodyReads, 0);
    resetWorkspaceStore();
    resetStorageProvider();
    storage = getStorageProvider();
    const restarted = await readProjectAutomations('p', full, profiles);
    assert.deepEqual(restarted.program, program);
    assert.equal(restarted.updatedBy, 'full');
    assert.equal((await getWorkspaceDatabase({ fields: ['knowledgeNotes'] })).knowledgeNotes[0].bodyRef.sha256, staged.knowledgeNotes[0].bodyRef.sha256);
    assert.equal((await readProjectAutomations('p', owner, profiles)).canConfigure, true);
    // Exercise the real HTTP middleware, route wiring and session-derived actor.
    const { app } = await import('../../src/server/app.js');
    const { createSession } = await import('../../src/server/auth.js');
    const { registerAuthSession } = await import('../../src/server/auth-session-store.js');
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
      const origin = `http://127.0.0.1:${server.address().port}`;
      const call = async (actor, method = 'GET', body, suffix = '', id = 'p', lang = 'ru') => {
        const headers = { 'Content-Type': 'application/json', 'Accept-Language': lang };
        if (actor) {
          const sessionId = `automation-api-${actor.id}`,
            issuedAt = Date.now(),
            expiresAt = issuedAt + 3600000;
          await registerAuthSession({ id: sessionId, userId: actor.id, createdAt: issuedAt, lastSeenAt: issuedAt, expiresAt });
          headers.Authorization = `Bearer ${createSession(actor, { sessionId, issuedAt, expiresAt })}`;
        }
        const response = await fetch(`${origin}/api/projects/${id}/automations${suffix}`, {
          method,
          headers,
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return { status: response.status, body: await response.json() };
      };
      assert.equal((await call(null)).status, 401);
      assert.equal((await call(editor, 'GET', undefined, '', 'secret')).status, 404);
      for (const lang of ['ru', 'en']) {
        for (const actor of [full, editor, viewer]) {
          const response = await call(actor, 'GET', undefined, '', 'p', lang);
          assert.equal(response.status, 200);
          assert.equal(response.body.canConfigure, actor.id === full.id);
          assert.equal(response.body.canPreview, actor.id !== viewer.id);
          assert.equal(response.body.executionAvailable, true);
        }
        const beforePreview = await getWorkspaceDatabase({ fields: ['revision', 'tasks', 'notifs'] });
        const preview = await call(editor, 'POST', { program, transitions: [{ taskId: 'a', to: 'progress' }] }, '/preview', 'p', lang);
        assert.equal(preview.status, 200);
        assert.equal(preview.body.appliedOperations, 0);
        assert.equal(preview.body.changes[0].fields[0].to, 'high');
        assert.deepEqual(await getWorkspaceDatabase({ fields: ['revision', 'tasks', 'notifs'] }), beforePreview);
      }
      const initialHttp = (await call(full)).body;
      const changedHttp = structuredClone(program);
      changedHttp.rules[0].name = 'Saved through HTTP / HTTP сохранение';
      const payload = { program: changedHttp, programHash: initialHttp.programHash };
      for (const actor of [editor, viewer]) assert.equal((await call(actor, 'POST', payload)).status, 403);
      const savedHttp = await call(full, 'POST', payload);
      assert.equal(savedHttp.status, 200);
      assert.equal(savedHttp.body.updatedBy, 'full');
      assert.deepEqual((await call(full)).body.program, changedHttp);
      const rev = (await getWorkspaceDatabase({ fields: ['revision'] })).revision;
      assert.equal((await call(full, 'POST', payload)).status, 200);
      assert.equal((await getWorkspaceDatabase({ fields: ['revision'] })).revision, rev);
      const stale = await call(full, 'POST', { program, programHash: initialHttp.programHash });
      assert.equal(stale.status, 409);
      assert.equal(stale.body.code, 'AUTOMATION_STALE');
      assert.equal((await call(full, 'POST', { program: active, programHash: savedHttp.body.programHash })).body.code, 'AUTOMATION_ASSIGNEE_UNAVAILABLE');
      assert.equal((await call(viewer, 'POST', { program, transitions: [{ taskId: 'a', to: 'progress' }] }, '/preview')).status, 403);
      assert.equal((await call(full, 'POST', { program, actorId: 'owner', transitions: [{ taskId: 'a', to: 'progress' }] }, '/preview')).status, 400);
      assert.equal((await call(full, 'POST', { program, transitions: [{ taskId: 'hidden', to: 'progress' }] }, '/preview')).status, 404);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  } finally {
    resetWorkspaceStore();
    resetStorageProvider();
    for (const key of keys) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('smena-project-automations-'));
    await fs.rm(resolved, { recursive: true, force: true });
  }
});
