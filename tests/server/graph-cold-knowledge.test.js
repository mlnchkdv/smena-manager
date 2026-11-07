import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createEmptyDatabase, resetWorkspaceStore, queryWorkspaceGraph } from '../../src/server/workspace-store.js';
import { getStorageProvider, resetStorageProvider } from '../../src/server/storage/index.js';

test('Drive-style graph index reads authorized note metadata and limits typed candidates to their source note without body reads', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-graph-knowledge-'));
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
    for (const key of keys) delete process.env[key];
    process.env.DATABASE_PATH = path.join(directory, 'workspace.json');
    process.env.KNOWLEDGE_CATALOG_ENABLED = 'true';
    process.env.KNOWLEDGE_METADATA_SHARDS_ENABLED = 'true';
    resetWorkspaceStore();
    resetStorageProvider();
    const actor = { id: 'owner', email: 'owner@example.test', role: 'admin' },
      source = {
        ...createEmptyDatabase(),
        _aggregateVersion: 1,
        _documentRevisions: { knowledge: { revision: 0 }, bookmarks: { revision: 0 } },
        members: [
          { ...actor, role: 'Owner', name: 'Owner' },
          { id: 'inactive', role: 'Member', status: 'deactivated' },
        ],
        me: 'owner',
        projects: [{ id: 'p', name: 'Project', members: ['owner'] }],
        projOrder: ['p'],
        tasks: [{ id: 't', title: 'Task', project: 'p', status: 'todo', subtasks: [], deps: [], labels: [], attachments: [] }],
        knowledgeFolders: [{ id: 'folder', name: 'Folder', parentId: null }],
        knowledgeNotes: Array.from({ length: 1001 }, (_, i) => ({
          id: 'n' + i,
          title: 'Guide / Руководство ' + i,
          summary: 'Metadata only',
          folderId: 'folder',
          bodyRef: {
            kind: 'knowledge-body-v1',
            sha256: createHash('sha256')
              .update('n' + i)
              .digest('hex'),
            bytes: 64,
          },
        })),
      };
    await getStorageProvider().saveDatabase(source);
    resetStorageProvider();
    resetWorkspaceStore();
    const storage = getStorageProvider();
    let reads = 0,
      bodyReads = 0;
    const readMetadata = storage.readKnowledgeMetadata.bind(storage);
    storage.readKnowledgeMetadata = async (...args) => {
      reads++;
      return readMetadata(...args);
    };
    storage.readKnowledgeBody = async () => {
      bodyReads++;
      throw Error('Graph must not read bodies');
    };
    // Model the real Drive catalog-index capability: the returned core keeps
    // identity rows while knowledge is not materialized by that file path.
    storage.loadDatabaseCatalogIndex = async select => {
      const root = await storage.loadDatabaseCore({ knowledge: false });
      select(root);
      return root;
    };
    const options = { revision: 0, documents: { knowledge: 0, bookmarks: 0 } };
    await assert.rejects(queryWorkspaceGraph({ id: 'inactive', role: 'editor' }, { ...options, kind: 'note' }), { code: 'AUTH_REQUIRED' });
    assert.equal(reads, 0, 'Inactive membership is rejected before private metadata parts');
    const projects = await queryWorkspaceGraph(actor, { ...options, mode: 'candidates', kind: 'project', source: 'task:t', query: 'Project' });
    assert.deepEqual(
      projects.nodes.map(n => n.id),
      ['p'],
    );
    assert.equal(reads, 0, 'Non-note candidates from a non-note source read no knowledge parts');
    const candidates = await queryWorkspaceGraph(actor, { ...options, mode: 'candidates', kind: 'task', source: 'note:n0', query: 'Task' });
    assert.deepEqual(
      candidates.nodes.map(n => n.id),
      ['t'],
    );
    assert.ok(reads <= 1, 'Only the hashed part of the source note is needed');
    reads = 0;
    const graph = await queryWorkspaceGraph(actor, { ...options, kind: 'note', query: 'Руководство 999' });
    assert.deepEqual(
      graph.nodes.map(n => n.id),
      ['n999'],
    );
    assert.equal(graph.nodes[0].title, 'Guide / Руководство 999');
    assert.equal(graph.nodes[0].context, 'Folder');
    assert.ok(reads > 1, 'Graph search spans metadata parts');
    const exported = await queryWorkspaceGraph(actor, { ...options, mode: 'export', kind: 'note' });
    assert.equal(exported.nodes.length, 1001, 'Export includes the complete note metadata catalog');
    const noteCandidates = await queryWorkspaceGraph(actor, {
      ...options,
      mode: 'candidates',
      kind: 'note',
      source: 'task:t',
      query: 'Guide / Руководство 999',
    });
    assert.deepEqual(
      noteCandidates.nodes.map(n => n.id),
      ['n999'],
    );
    assert.equal(bodyReads, 0);
    assert.equal(graph.nodes[0].item.bodyRef, undefined);
  } finally {
    resetWorkspaceStore();
    resetStorageProvider();
    for (const [key, value] of Object.entries(old))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    const absolute = path.resolve(directory),
      root = path.resolve(os.tmpdir()) + path.sep;
    assert.ok(absolute.startsWith(root) && path.basename(absolute).startsWith('smena-graph-knowledge-'));
    await fs.rm(absolute, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});
