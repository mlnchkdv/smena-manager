import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeWorkspaceDocuments, workspaceCoreData, workspaceDocumentData } from '../../src/shared/workspace-documents.js';

test('workspace documents separate large knowledge and bookmark collections from core data', () => {
  const source = {
    members: [{ id: 'member-1' }],
    tasks: [{ id: 'task-1' }],
    knowledgeNotes: [{ id: 'note-1' }],
    knowledgeFolders: [],
    links: [{ id: 'link-1' }],
    linkFolders: [],
  };
  assert.deepEqual(workspaceCoreData(source), { members: source.members, tasks: source.tasks });
  assert.deepEqual(workspaceDocumentData('knowledge', source), {
    knowledgeNotes: source.knowledgeNotes,
    knowledgeFolders: [],
  });
  assert.deepEqual(
    mergeWorkspaceDocuments(workspaceCoreData(source), {
      knowledge: workspaceDocumentData('knowledge', source),
      bookmarks: workspaceDocumentData('bookmarks', source),
    }),
    source,
  );
});
