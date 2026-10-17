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
      });
    throw new Error(`Unexpected test request: ${path}`);
  };
  try {
    const queued = queueWorkspaceSync(S.data);
    await new Promise(resolve => setImmediate(resolve));
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
