import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createKnowledgeNote, readKnowledgeNote } from '../../src/server/knowledge-note-store.js';
import { createEmptyDatabase, getWorkspaceDatabase, resetWorkspaceStore } from '../../src/server/workspace-store.js';
import { getStorageProvider, resetStorageProvider } from '../../src/server/storage/index.js';
import { getWorkspaceDocument, replaceWorkspaceDocument } from '../../src/server/workspace-document-store.js';
import { externalKnowledgeBody } from '../../src/shared/knowledge-body.js';

test('legacy browser edits and removes API-created external notes without losing body storage, history or version guards', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-api-legacy-'));
  const oldPath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = path.join(directory, 'workspace.json');
  resetStorageProvider();
  resetWorkspaceStore();
  const owner = { id: 'owner', email: 'owner@example.test', role: 'admin', name: 'Owner' };
  const storage = getStorageProvider();
  try {
    await storage.saveDatabase({ ...createEmptyDatabase(), me: owner.id, members: [{ ...owner, role: 'Owner', status: 'active' }] });
    const created = await createKnowledgeNote({ title: 'API / Заметка', formatted_markdown: 'Привет 🌍' }, owner);
    assert.ok(externalKnowledgeBody((await getWorkspaceDatabase()).knowledgeNotes[0]));
    const legacy = await getWorkspaceDocument('knowledge');
    assert.equal(legacy.knowledgeNotes[0].formatted_markdown, 'Привет 🌍');
    assert.equal(legacy.knowledgeNotes[0].bodyRef, undefined);
    const noChange = await replaceWorkspaceDocument('knowledge', legacy, legacy.revision, { profile: owner });
    assert.equal(noChange.knowledgeNotes[0].formatted_markdown, 'Привет 🌍');
    assert.equal(noChange.knowledgeNotes[0].bodyRef, undefined);
    assert.equal((await readKnowledgeNote(created.note.id, owner)).etag, created.etag);
    const incomplete = structuredClone(noChange);
    delete incomplete.knowledgeNotes[0].formatted_markdown;
    await assert.rejects(replaceWorkspaceDocument('knowledge', incomplete, noChange.revision, { profile: owner }), { code: 'KNOWLEDGE_NOTE_WRITE_REQUIRED' });
    const changed = structuredClone(await getWorkspaceDocument('knowledge'));
    changed.knowledgeNotes[0].formatted_markdown = 'Updated / Сохранено';
    await replaceWorkspaceDocument('knowledge', changed, changed.revision, { profile: owner });
    const current = await readKnowledgeNote(created.note.id, owner);
    assert.equal(current.note.formatted_markdown, 'Updated / Сохранено');
    assert.notEqual(current.etag, created.etag);
    assert.ok(current.note.history.length);
    assert.ok(externalKnowledgeBody((await getWorkspaceDatabase()).knowledgeNotes[0]));
    await assert.rejects(replaceWorkspaceDocument('knowledge', legacy, legacy.revision, { profile: owner }), { code: 'REVISION_CONFLICT' });
    const latest = await getWorkspaceDocument('knowledge');
    await replaceWorkspaceDocument('knowledge', { knowledgeNotes: [], knowledgeFolders: latest.knowledgeFolders }, latest.revision, { profile: owner });
    assert.equal((await getWorkspaceDatabase()).knowledgeNotes.length, 0);
  } finally {
    resetStorageProvider();
    resetWorkspaceStore();
    if (oldPath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = oldPath;
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(directory).startsWith('smena-api-legacy-'));
    await fs.rm(directory, { recursive: true, force: true });
  }
});
