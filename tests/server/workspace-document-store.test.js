import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { resetStorageProvider } from '../../src/server/storage/index.js';
import {
  getWorkspaceDocument,
  replaceWorkspaceDocument,
  resetWorkspaceDocumentStore,
  WorkspaceDocumentConflictError,
} from '../../src/server/workspace-document-store.js';

const originalDatabasePath = process.env.DATABASE_PATH;
const directory = path.join(process.cwd(), '.data', 'tests', `documents-${process.pid}`);

test.beforeEach(async () => {
  await fs.promises.rm(directory, { recursive: true, force: true });
  process.env.DATABASE_PATH = path.join(directory, 'workspace.json');
  delete process.env.VERCEL;
  delete process.env.REDIS_URL;
  resetStorageProvider();
  resetWorkspaceDocumentStore();
});

test.after(async () => {
  await fs.promises.rm(directory, { recursive: true, force: true });
  if (originalDatabasePath === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = originalDatabasePath;
});

test('legacy knowledge and bookmarks migrate into independent documents', async () => {
  const knowledge = await getWorkspaceDocument('knowledge', {
    knowledgeNotes: [{ id: 'note-1', title: 'Регламент' }],
    knowledgeFolders: [{ id: 'folder-1', name: 'Процессы' }],
  });
  const bookmarks = await getWorkspaceDocument('bookmarks', {
    links: [{ id: 'link-1', title: 'Справочник' }],
    linkFolders: [],
  });

  assert.equal(knowledge.revision, 0);
  assert.equal(bookmarks.revision, 0);
  assert.equal(knowledge.knowledgeNotes[0].id, 'note-1');
  assert.equal(bookmarks.links[0].id, 'link-1');
  assert.equal(await fs.promises.stat(path.join(directory, 'smena-manager-knowledge.json')).then(() => true), true);
  assert.equal(await fs.promises.stat(path.join(directory, 'smena-manager-bookmarks.json')).then(() => true), true);
});

test('document revisions persist independently and reject stale writes', async () => {
  const initial = await getWorkspaceDocument('knowledge');
  const saved = await replaceWorkspaceDocument('knowledge', { knowledgeNotes: [{ id: 'note-1', title: 'Онбординг' }], knowledgeFolders: [] }, initial.revision);
  assert.equal(saved.revision, 1);

  await assert.rejects(
    replaceWorkspaceDocument('knowledge', { knowledgeNotes: [], knowledgeFolders: [] }, initial.revision),
    error => error instanceof WorkspaceDocumentConflictError && error.currentRevision === 1,
  );

  resetStorageProvider();
  resetWorkspaceDocumentStore();
  const restored = await getWorkspaceDocument('knowledge');
  assert.equal(restored.revision, 1);
  assert.equal(restored.knowledgeNotes[0].title, 'Онбординг');
});
