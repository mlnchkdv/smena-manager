import test from 'node:test';
import assert from 'node:assert/strict';
import { exportJsonCanvas, parseWhiteboardImport } from '../../src/shared/whiteboard-portable.js';
import { captureWhiteboardHistory, validateWhiteboardRestore, whiteboardHash } from '../../src/server/whiteboard-history.js';
const board = {
  version: 1,
  nodes: [
    { id: 'n', type: 'text', x: 10, y: -100, width: 220, height: 160, color: 'blue', title: 'Заголовок', text: 'Markdown **body**' },
    { id: 'r', type: 'material', x: 400, y: 0, width: 200, height: 100, color: 'neutral', target: 'note:тест-id' },
  ],
  edges: [{ id: 'e', from: 'n', to: 'r', label: 'related', arrow: true, color: 'green' }],
};
test('native whiteboard preserves all fields and JSON Canvas roundtrips references text geometry and connections', () => {
  assert.deepEqual(parseWhiteboardImport(JSON.stringify({ format: 'smena-project-whiteboard', version: 1, project: 'ignored', board })).board, board);
  const canvas = exportJsonCanvas(board),
    imported = parseWhiteboardImport(JSON.stringify(canvas));
  assert.deepEqual(imported.warnings, []);
  assert.equal(imported.board.nodes[0].text, board.nodes[0].text);
  assert.equal(imported.board.nodes[0].title, board.nodes[0].title);
  assert.equal(imported.board.nodes[1].target, 'note:тест-id');
  assert.equal(imported.board.edges[0].to, imported.board.nodes[1].id);
});
test('Canvas import rejects malformed geometry identities and limits and reviews lossy external references', () => {
  const canvas = exportJsonCanvas(board);
  for (const change of [
    c => (c.nodes[0].width = 10),
    c => (c.nodes[0].x = 1.2),
    c => (c.nodes[0].text = 'a'.repeat(7000)),
    c => c.nodes.push(c.nodes[0]),
    c => (c.edges[0].toNode = 'missing'),
  ]) {
    const c = structuredClone(canvas);
    change(c);
    assert.throws(() => parseWhiteboardImport(JSON.stringify(c)), /IMPORT_INVALID/);
  }
  assert.throws(() => parseWhiteboardImport(' '.repeat(1048577)), /IMPORT_INVALID/);
  const external = { nodes: [{ id: 'file', type: 'file', x: 0, y: 0, width: 200, height: 120, file: 'images/a.png', color: '#ABCDEF' }], edges: [] };
  const result = parseWhiteboardImport(JSON.stringify(external));
  assert.equal(result.board.nodes[0].type, 'text');
  assert.equal(result.board.nodes[0].text, 'images/a.png');
  assert.deepEqual(result.warnings.sort(), ['colors', 'files']);
});
test('board import replacement rejects stale hashes and keeps a recovery checkpoint', () => {
  const current = { projects: [{ id: 'p', whiteboard: board }] };
  const project = { id: 'p', whiteboard: { version: 1, nodes: [], edges: [] }, whiteboardReplaceBaseHash: whiteboardHash(board) };
  validateWhiteboardRestore(current, project);
  assert.throws(
    () => validateWhiteboardRestore(current, { ...project, whiteboardReplaceBaseHash: 'a'.repeat(64) }),
    e => e.code === 'WHITEBOARD_REPLACE_STALE',
  );
  const next = { projects: [project] };
  captureWhiteboardHistory(current, next, 'me');
  assert.deepEqual(next._whiteboardHistory[0].board, board);
  assert.equal(next.projects[0].whiteboardReplaceBaseHash, undefined);
});
