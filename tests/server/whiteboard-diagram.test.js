import test from 'node:test';
import assert from 'node:assert/strict';
import { validWhiteboard } from '../../src/shared/project-whiteboard.js';
import { exportJsonCanvas, jsonCanvasExportLosses, parseWhiteboardImport } from '../../src/shared/whiteboard-portable.js';
import { copyWhiteboardSelection, pasteWhiteboardSelection } from '../../src/shared/whiteboard-selection.js';
import { reconnectWhiteboardEdge } from '../../src/shared/whiteboard-connect.js';
import { patchWhiteboardContext } from '../../src/shared/whiteboard-context.js';
import { mergeClientWorkspace, projectWorkspace } from '../../src/server/workspace-policy.js';
import { whiteboardEdgeText } from '../../src/shared/whiteboard-edge.js';
const card = (id, x) => ({ id, type: 'shape', shape: 'diamond', x, y: 0, width: 240, height: 180, color: 'blue', title: id, text: 'Decision / Решение' });
const source = () => ({
  version: 3,
  nodes: [card('a', 0), card('b', 400), card('c', 800)],
  edges: [{ id: 'e', from: 'a', to: 'b', arrow: true, fromEnd: 'dot', toEnd: 'arrow', style: 'dashed', color: 'green', label: 'Next / Далее' }],
});

test('v3 bounds diagram fields, keeps legacy versions and preserves shape/media fragments', () => {
  const board = source();
  assert.equal(validWhiteboard(board), true);
  for (const change of [
    b => (b.version = 2),
    b => (b.nodes[0].shape = 'url(javascript:bad)'),
    b => (b.edges[0].style = 'custom'),
    b => (b.edges[0].fromEnd = 'script'),
    b => (b.edges[0].arrow = false),
  ]) {
    const bad = structuredClone(board);
    change(bad);
    assert.equal(validWhiteboard(bad), false);
  }
  board.nodes.push({ id: 'media', type: 'material', target: 'file:pdf', media: { page: 7 }, x: 0, y: 300, width: 200, height: 120, color: 'neutral' });
  const fragment = copyWhiteboardSelection(
    board,
    board.nodes.map(n => n.id),
  );
  let sequence = 0;
  const pasted = pasteWhiteboardSelection({ version: 1, nodes: [], edges: [] }, fragment, () => 'copy-' + ++sequence);
  assert.equal(pasted.board.version, 3);
  assert.equal(pasted.board.nodes[3].media.page, 7);
  assert.equal(pasted.board.nodes[0].shape, 'diamond');
  assert.equal(pasted.board.edges[0].style, 'dashed');
  assert.deepEqual(parseWhiteboardImport(JSON.stringify({ format: 'smena-project-whiteboard', version: 1, board })).board, board);
});

test('portable diagrams require explicit loss review and preserve both supported arrow directions', () => {
  const board = source();
  assert.deepEqual(jsonCanvasExportLosses(board), ['shapes', 'lineStyles', 'dotEndings']);
  assert.throws(() => exportJsonCanvas(board), /LOSS_REVIEW_REQUIRED/);
  board.edges[0].fromEnd = 'arrow';
  const canvas = exportJsonCanvas(board, { allowLossy: true });
  assert.equal(canvas.nodes[0].type, 'text');
  assert.match(canvas.nodes[0].text, /Decision/);
  const imported = parseWhiteboardImport(JSON.stringify(canvas));
  assert.equal(imported.board.version, 3);
  assert.equal(imported.board.edges[0].fromEnd, 'arrow');
  assert.equal(imported.board.edges[0].toEnd, 'arrow');
  assert.deepEqual(imported.warnings, []);
  assert.match(whiteboardEdgeText(board, board.edges[0]), /a ↔ b.*Start: arrow.*End: arrow/);
});

test('endpoint reconnection keeps independent edits and rejects stale endpoints, loops and duplicate pairs', () => {
  const board = source();
  board.edges[0].label = 'Edited while dragging';
  assert.deepEqual(reconnectWhiteboardEdge(board, { id: 'e', side: 'to', base: 'b', target: 'c' }), { changed: true });
  assert.equal(board.edges[0].label, 'Edited while dragging');
  assert.equal(board.edges[0].fromEnd, 'dot');
  assert.deepEqual(reconnectWhiteboardEdge(board, { id: 'e', side: 'to', base: 'b', target: 'c' }), { changed: false });
  assert.equal(reconnectWhiteboardEdge(board, { id: 'e', side: 'to', base: 'b', target: 'b' }).error, 'changed');
  assert.equal(reconnectWhiteboardEdge(board, { id: 'e', side: 'from', base: 'a', target: 'c' }).error, 'self');
  board.edges.push({ ...board.edges[0], id: 'other', from: 'b' });
  assert.equal(reconnectWhiteboardEdge(board, { id: 'e', side: 'from', base: 'a', target: 'b' }).error, 'duplicate');
  assert.equal(reconnectWhiteboardEdge(board, { id: 'e', side: 'to', base: 'c', target: 'missing' }).error, 'missing');
  assert.equal(validWhiteboard(board), true);
  patchWhiteboardContext(board, { kind: 'edge', id: 'e', field: 'arrow', base: true, value: false });
  assert.equal(board.edges[0].toEnd, 'none');
  assert.equal(validWhiteboard(board), true);
});

test('new visual elements retain canonical project permissions and never create semantic relations', () => {
  const data = {
    me: 'owner',
    projects: [{ id: 'p', members: ['editor'], perms: { editor: 'Can edit' }, whiteboard: { version: 1, nodes: [], edges: [] } }],
    tasks: [],
    files: [],
    knowledgeNotes: [],
    projOrder: ['p'],
    activity: [],
    relations: [],
  };
  const client = projectWorkspace(data, { id: 'editor', role: 'editor' });
  client.projects[0].whiteboard = source();
  const result = mergeClientWorkspace(data, client, 'editor', 'editor');
  assert.deepEqual(result.projects[0].whiteboard, source());
  assert.deepEqual(result.relations, []);
  data.projects[0].perms.editor = 'Can view';
  assert.throws(() => mergeClientWorkspace(data, client, 'editor', 'editor'), /permission/);
});
