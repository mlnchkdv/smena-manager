import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyWhiteboard, validWhiteboard, movedWhiteboardNodes, removeWhiteboardNode } from '../../src/shared/project-whiteboard.js';
import { mergeWorkspaceData } from '../../src/shared/workspace-merge.js';
import { mergeClientWorkspace, projectWorkspace } from '../../src/server/workspace-policy.js';
import { workspaceGraph } from '../../src/shared/relations.js';
const card = (id, extra = {}) => ({ id, type: 'text', title: id, text: 'Body', x: 0, y: 0, width: 240, height: 160, color: 'neutral', ...extra });
test('whiteboard validation bounds geometry, content, identities and connections', () => {
  const board = { ...emptyWhiteboard(), nodes: [card('a'), card('b')] };
  assert.equal(validWhiteboard(board), true);
  board.edges.push({ id: 'edge', from: 'a', to: 'b', label: 'Next', arrow: true, color: 'blue' });
  assert.equal(validWhiteboard(board), true);
  for (const invalid of [
    { ...board, nodes: [card('a', { x: Infinity })] },
    { ...board, nodes: [card('a', { width: -1 })] },
    { ...board, nodes: [card('a', { text: 'a'.repeat(6001) })] },
    { ...board, nodes: [card('a'), card('a')] },
    { ...board, edges: [{ ...board.edges[0], to: 'missing' }] },
    { ...board, nodes: [{ ...card('a'), type: 'material', target: 'note:x' }] },
  ])
    assert.equal(validWhiteboard(invalid), false);
  const group = card('g', { type: 'group', x: -20, y: -20, width: 600, height: 400 });
  assert.deepEqual(
    movedWhiteboardNodes({ nodes: [group, card('a'), card('outside', { x: 1000 })] }, 'g').map(n => n.id),
    ['g', 'a'],
  );
  removeWhiteboardNode(board, 'b');
  assert.equal(board.edges.length, 0);
  assert.equal(validWhiteboard(board), true);
});
test('separate whiteboard edits merge by card without overwriting another user', () => {
  const base = { projects: [{ id: 'p', whiteboard: { ...emptyWhiteboard(), nodes: [card('a'), card('b')] } }] };
  const local = structuredClone(base),
    remote = structuredClone(base);
  local.projects[0].whiteboard.nodes[0].text = 'Local';
  remote.projects[0].whiteboard.nodes[1].x = 200;
  const merged = mergeWorkspaceData(base, local, remote);
  assert.deepEqual(merged.conflicts, []);
  assert.equal(merged.data.projects[0].whiteboard.nodes[0].text, 'Local');
  assert.equal(merged.data.projects[0].whiteboard.nodes[1].x, 200);
  remote.projects[0].whiteboard.nodes[0].text = 'Remote';
  assert.ok(mergeWorkspaceData(base, local, remote).conflicts.length);
});
test('whiteboards inherit project access and new material references require read access', () => {
  const data = {
    me: 'owner',
    projects: [
      { id: 'p', members: ['editor'], perms: { editor: 'Can edit' }, whiteboard: emptyWhiteboard() },
      { id: 'private', private: true, members: ['owner'], whiteboard: { ...emptyWhiteboard(), nodes: [card('secret')] } },
    ],
    tasks: [{ id: 'secret', project: 'private' }],
    files: [],
    knowledgeNotes: [{ id: 'n', title: 'Note' }],
    projOrder: ['p', 'private'],
    activity: [],
  };
  const visible = projectWorkspace(data, { id: 'editor', role: 'editor' });
  assert.equal(visible.projects.length, 1);
  visible.projects[0].whiteboard.nodes.push(card('a'));
  assert.equal(mergeClientWorkspace(data, visible, 'editor', 'editor').projects[1].whiteboard.nodes.length, 1);
  for (const level of ['Can view', 'Can comment']) {
    data.projects[0].perms.editor = level;
    assert.throws(() => mergeClientWorkspace(data, visible, 'editor', 'editor'), /permission/);
  }
  data.projects[0].perms.editor = 'Can edit';
  const node = { id: 'ref', type: 'material', x: 0, y: 0, width: 240, height: 160, color: 'neutral', target: 'task:secret' };
  visible.projects[0].whiteboard.nodes = [node];
  assert.throws(() => mergeClientWorkspace(data, visible, 'editor', 'editor'), /permission/);
  node.target = 'note:n';
  const saved = mergeClientWorkspace(data, visible, 'editor', 'editor');
  assert.ok(workspaceGraph(saved, { role: 'editor', memberId: 'editor' }).edges.some(e => e.id === 'whiteboard:p:ref'));
  data.files = [
    { id: 'private-file', project: 'private', name: 'Private.pdf' },
    { id: 'visible-file', project: 'p', name: 'Visible.pdf' },
  ];
  const mediaClient = projectWorkspace(data, { id: 'editor', role: 'editor' });
  mediaClient.projects[0].whiteboard = { version: 2, nodes: [{ ...node, target: 'file:private-file', media: { page: 2 } }], edges: [] };
  assert.throws(() => mergeClientWorkspace(data, mediaClient, 'editor', 'editor'), /permission/);
  mediaClient.projects[0].whiteboard.nodes[0].target = 'file:visible-file';
  const mediaSaved = mergeClientWorkspace(data, mediaClient, 'editor', 'editor');
  assert.deepEqual(mediaSaved.projects.find(project => project.id === 'p').whiteboard, mediaClient.projects[0].whiteboard);
  assert.deepEqual(mediaSaved.projects.find(project => project.id === 'p').whiteboard.nodes[0].media, { page: 2 });
});
