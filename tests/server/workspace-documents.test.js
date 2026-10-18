import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeWorkspaceDocuments, workspaceCoreData, workspaceDocumentData } from '../../src/shared/workspace-documents.js';
import { workspaceFitsTransport, workspaceTransportBytes } from '../../src/shared/workspace-size.js';
import { listWindow } from '../../src/shared/list-window.js';

test('representative 1k and 10k workspaces expose transport limits independently of bounded rendering', t => {
  for (const count of [1000, 10000]) {
    const data = { tasks: [], comments: [] };
    for (let index = 0; index < count; index += 1) {
      data.tasks.push({
        id: `task-${index}`,
        project: 'project',
        title: `Задача команды ${index}`,
        key: `PRJ-${index + 1}`,
        status: 'todo',
        priority: 'none',
        assignee: null,
        due: null,
        start: null,
        labels: [],
        deps: [],
        subtasks: [],
        attachments: [],
        desc: 'Рабочее описание задачи команды. '.repeat(4),
        created: 1792280000000,
        updated: 1792280000000,
        order: index,
      });
      data.comments.push({
        id: `comment-${index}`,
        task: `task-${index}`,
        text: 'Обсуждение текущего рабочего вопроса. '.repeat(3),
        by: 'member',
        at: 1792280000000,
      });
    }
    const started = performance.now();
    const bytes = workspaceTransportBytes(data, 1);
    const elapsed = performance.now() - started;
    t.diagnostic(`${count} tasks + comments: ${bytes} transport bytes; serialization ${elapsed.toFixed(1)} ms`);
    assert.equal(workspaceFitsTransport(data, 1), count === 1000);
    assert.equal(listWindow(data.tasks).items.length, 100);
  }
});

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
