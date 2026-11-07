import test from 'node:test';
import assert from 'node:assert/strict';
import { whiteboardCopyDraft, whiteboardCopySourceCurrent, whiteboardCopyMarkdown, whiteboardCopyTaskHtml } from '../../src/shared/whiteboard-extract.js';
import { materialReferences } from '../../src/shared/material-links.js';
import { workspaceGraph } from '../../src/shared/relations.js';
import { mergeClientWorkspace, projectWorkspace } from '../../src/server/workspace-policy.js';
const document = () => ({
  id: 'board',
  name: 'Decision / Решение [safe]|',
  project: 'p',
  whiteboard: {
    version: 1,
    nodes: [
      {
        id: 'a',
        type: 'text',
        title: 'Action / Действие',
        text: 'First line\nSelected text\nLast line',
        x: 0,
        y: 0,
        width: 240,
        height: 180,
        color: 'neutral',
      },
    ],
    edges: [],
  },
});
test('copying a bounded selection preserves its exact text and leaves the original unchanged', () => {
  const board = document(),
    before = structuredClone(board),
    draft = whiteboardCopyDraft(board, 'a', 'Selected text');
  assert.equal(draft.text, 'Selected text');
  assert.equal(draft.title, 'Action / Действие');
  assert.deepEqual(board, before);
  assert.equal(whiteboardCopyDraft(board, 'a', 'foreign selection').text, board.whiteboard.nodes[0].text);
  assert.equal(whiteboardCopyDraft(board, 'missing'), null);
  assert.equal(whiteboardCopySourceCurrent(board, draft.source), true);
  board.whiteboard.nodes[0].x = 20;
  assert.equal(whiteboardCopySourceCurrent(board, draft.source), true);
  board.whiteboard.nodes[0].text += ' changed';
  assert.equal(whiteboardCopySourceCurrent(board, draft.source), false);
  assert.equal(whiteboardCopySourceCurrent({ ...board, id: 'another' }, draft.source), false);
});
test('note backlinks bind by identity and cannot inject aliases; task links escape copied HTML', () => {
  const draft = whiteboardCopyDraft(document(), 'a');
  const body = whiteboardCopyMarkdown(draft);
  assert.deepEqual(
    materialReferences(body).map(ref => ref.key),
    ['whiteboard:board'],
  );
  const task = whiteboardCopyTaskHtml('<img src=x onerror=bad> "text"', { ...draft.source, title: '<script>bad</script>' }, 'space /');
  assert.ok(!task.includes('<img') && !task.includes('<script>'));
  assert.match(task, /href="\/space%20%2F\/whiteboard\/board"/);
  assert.match(task, /&lt;img/);
});
test('a task copy and its source relation save together under canonical permissions', () => {
  const board = document(),
    current = {
      me: 'owner',
      members: [],
      projects: [{ id: 'p', members: ['editor'], perms: { editor: 'Can edit' } }],
      projOrder: ['p'],
      tasks: [],
      files: [],
      knowledgeNotes: [],
      whiteboards: [board],
      relations: [],
      activity: [],
    };
  const incoming = projectWorkspace(current, { id: 'editor', role: 'editor' });
  incoming.tasks.push({
    id: 'new-task',
    project: 'p',
    title: 'Action',
    status: 'todo',
    assignee: 'editor',
    desc: whiteboardCopyTaskHtml('Text', whiteboardCopyDraft(board, 'a').source, 'space'),
  });
  incoming.relations.push({
    id: 'source',
    from: 'task:new-task',
    to: 'whiteboard:board',
    type: 'source',
    createdBy: 'editor',
    createdAt: new Date().toISOString(),
  });
  const result = mergeClientWorkspace(current, incoming, 'editor', 'editor');
  assert.equal(result.tasks.length, 1);
  assert.equal(result.relations.length, 1);
  assert.deepEqual(result.whiteboards[0].whiteboard, board.whiteboard);
  current.projects[0].perms.editor = 'Can view';
  assert.throws(() => mergeClientWorkspace(current, incoming, 'editor', 'editor'), /permission/);
  const note = { id: 'n', title: 'Copy', formatted_markdown: whiteboardCopyMarkdown(whiteboardCopyDraft(board, 'a')) };
  assert.ok(
    workspaceGraph({ ...current, knowledgeNotes: [note] }, { role: 'editor', memberId: 'editor' }).edges.some(
      edge => edge.from === 'note:n' && edge.to === 'whiteboard:board',
    ),
  );
});
