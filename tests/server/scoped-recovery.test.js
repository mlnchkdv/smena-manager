import assert from 'node:assert/strict';
import test from 'node:test';

test('recovering a core conflict preserves an active knowledge write and its local content', async () => {
  globalThis.document ||= { querySelectorAll: () => [] };
  globalThis.navigator ||= { platform: 'test', userAgent: 'test' };
  const { S } = await import('../../src/core/store.js');
  const { setSessionToken } = await import('../../src/core/api.js');
  const { recoverWorkspaceConflict } = await import('../../src/core/bootstrap.js');
  const { configureWorkspaceSync, disableWorkspaceSync, queueWorkspaceSync, workspaceSyncConflict, workspaceSyncState } =
    await import('../../src/core/workspace-sync.js');
  const { workspaceCoreData } = await import('../../src/shared/workspace-documents.js');
  const originalFetch = globalThis.fetch;
  const base = structuredClone(S.data);
  S.ui.currentUser = { id: 'test-owner', role: 'admin' };
  S.ui.workspaceRevision = 1;
  S.ui.workspaceBaseline = structuredClone(base);
  S.ui.documentRevisions = { knowledge: 0, bookmarks: 0 };
  configureWorkspaceSync(1, 'admin', base);
  S.data = structuredClone(base);
  S.data.tasks[0].title = 'Local task edit';
  S.data.knowledgeNotes = [{ id: 'draft', title: 'Unsaved knowledge', formatted_markdown: 'Keep this' }];
  const remote = workspaceCoreData(structuredClone(base));
  remote.tasks[1].title = 'Remote independent edit';
  let coreWrites = 0;
  let releaseKnowledge;
  let knowledgeStarted;
  const started = new Promise(resolve => {
    knowledgeStarted = resolve;
  });
  const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  setSessionToken('synthetic-token');
  globalThis.fetch = async (path, options = {}) => {
    if (path === '/api/workspace' && options.method === 'PUT') {
      coreWrites += 1;
      if (coreWrites === 1) return response({ error: 'Conflict', code: 'REVISION_CONFLICT', currentRevision: 2 }, 409);
      return response({ data: { ...JSON.parse(options.body).data, revision: 3 } });
    }
    if (path === '/api/workspace') return response({ data: { ...remote, revision: 2 } });
    if (path === '/api/workspace-documents/knowledge')
      return new Promise(resolve => {
        releaseKnowledge = () => resolve(response({ data: { ...JSON.parse(options.body).data, revision: 1 } }));
        knowledgeStarted();
      });
    throw new Error(`Unexpected test request: ${path}`);
  };
  try {
    const queued = queueWorkspaceSync(S.data);
    await started;
    assert.equal(workspaceSyncConflict().scope, 'workspace');
    assert.equal(workspaceSyncState().documents.knowledge.hasActive, true);
    const recovered = await recoverWorkspaceConflict();
    assert.equal(recovered.status, 'merged');
    assert.equal(S.data.tasks[0].title, 'Local task edit');
    assert.equal(S.data.tasks[1].title, 'Remote independent edit');
    assert.equal(S.data.knowledgeNotes[0].title, 'Unsaved knowledge');
    assert.equal(workspaceSyncState().documents.knowledge.hasActive, true);
    releaseKnowledge();
    await queued;
  } finally {
    releaseKnowledge?.();
    disableWorkspaceSync();
    setSessionToken('');
    globalThis.fetch = originalFetch;
  }
});

test('accepting one server scope preserves other local documents and retains the original offline recovery copy', async () => {
  globalThis.document ||= { querySelectorAll: () => [] };
  globalThis.navigator ||= { platform: 'test', userAgent: 'test' };
  const { S } = await import('../../src/core/store.js');
  const { setSessionToken } = await import('../../src/core/api.js');
  const { acceptServerConflictVersion } = await import('../../src/core/bootstrap.js');
  const { configureWorkspaceSync, disableWorkspaceSync } = await import('../../src/core/workspace-sync.js');
  const { workspaceCoreData } = await import('../../src/shared/workspace-documents.js');
  const originalFetch = globalThis.fetch;
  const originalStorage = globalThis.localStorage;
  const stored = new Map();
  globalThis.localStorage = { setItem: (key, value) => stored.set(key, value), getItem: key => stored.get(key), removeItem: key => stored.delete(key) };
  S.ui.currentUser = { id: 'test-owner', role: 'admin' };
  const base = structuredClone(S.data);
  configureWorkspaceSync(1, 'admin', base);
  const localDraft = workspaceCoreData(structuredClone(base));
  localDraft.tasks[0].title = 'Original offline copy';
  S.ui.syncRecovery = { owner: 'test-owner', scope: 'workspace', data: localDraft, conflicts: ['tasks.title'] };
  S.data.knowledgeNotes = [{ id: 'keep', title: 'Local document' }];
  const remote = workspaceCoreData(base);
  remote.tasks[0].title = 'Chosen server version';
  globalThis.fetch = async () => new Response(JSON.stringify({ data: { ...remote, revision: 9 } }), { headers: { 'Content-Type': 'application/json' } });
  setSessionToken('synthetic-token');
  try {
    await acceptServerConflictVersion({ createJournal: () => ({ read: async () => null }) });
    assert.equal(S.data.tasks[0].title, 'Chosen server version');
    assert.equal(S.data.knowledgeNotes[0].title, 'Local document');
    const recovery = JSON.parse(stored.get('smena.recovery.conflict.v1:test-owner:workspace'));
    assert.equal(recovery.data.tasks[0].title, 'Original offline copy');
  } finally {
    disableWorkspaceSync();
    setSessionToken('');
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalStorage;
  }
});

test('unchanged polling checks the current account and roles in one request and ignores a late previous-account response', async () => {
  globalThis.document ||= { querySelectorAll: () => [] };
  globalThis.navigator ||= { platform: 'test', userAgent: 'test' };
  const { S } = await import('../../src/core/store.js');
  const { setSessionToken } = await import('../../src/core/api.js');
  const { refreshWorkspaceFromServer } = await import('../../src/core/bootstrap.js');
  const { configureWorkspaceSync, disableWorkspaceSync } = await import('../../src/core/workspace-sync.js');
  const originalFetch = globalThis.fetch;
  S.ui.currentUser = { id: 'test-owner', role: 'admin' };
  S.ui.workspaceRevision = 9;
  S.ui.documentRevisions = { knowledge: 0, bookmarks: 0 };
  configureWorkspaceSync(9, 'admin', S.data);
  setSessionToken('synthetic-token');
  let calls = 0;
  const response = () =>
    new Response(
      JSON.stringify({ revision: 9, documents: { knowledge: { revision: 0 }, bookmarks: { revision: 0 } }, user: { id: 'test-owner', role: 'viewer' } }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  globalThis.fetch = async path => {
    calls += 1;
    assert.equal(path, '/api/workspace/revision');
    return response();
  };
  try {
    assert.equal((await refreshWorkspaceFromServer()).status, 'current');
    assert.equal(calls, 1);
    assert.equal(S.ui.currentUser.role, 'viewer');
    let release;
    globalThis.fetch = () =>
      new Promise(resolve => {
        release = () => resolve(response());
      });
    const pending = refreshWorkspaceFromServer();
    S.ui.currentUser = { id: 'another-owner', role: 'editor' };
    release();
    assert.equal((await pending).status, 'session_changed');
    assert.equal(S.ui.currentUser.id, 'another-owner');
  } finally {
    disableWorkspaceSync();
    setSessionToken('');
    globalThis.fetch = originalFetch;
  }
});
