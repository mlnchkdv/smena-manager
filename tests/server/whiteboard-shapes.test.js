import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_SHAPES, LEGACY_BOARD_SHAPES, validWhiteboard } from '../../src/shared/project-whiteboard.js';
import { whiteboardShapeSvg } from '../../src/shared/whiteboard-diagram.js';
import { copyWhiteboardSelection, pasteWhiteboardSelection } from '../../src/shared/whiteboard-selection.js';
import { parseWhiteboardImport } from '../../src/shared/whiteboard-portable.js';
const node = shape => ({ id: shape, type: 'shape', shape, x: 0, y: 0, width: 260, height: 180, color: 'blue', title: 'Diagram', text: 'Context' });
test('expanded shapes require v5; native copy and import retain every supported shape', () => {
  for (const shape of BOARD_SHAPES) {
    const board = { version: 5, nodes: [node(shape)], edges: [] };
    assert.equal(validWhiteboard(board), true, shape);
    assert.equal(validWhiteboard({ ...board, version: 4 }), LEGACY_BOARD_SHAPES.includes(shape));
    const pasted = pasteWhiteboardSelection({ version: 1, nodes: [], edges: [] }, copyWhiteboardSelection(board, [shape]), () => 'pasted');
    assert.equal(pasted.board.nodes[0].shape, shape);
    assert.equal(pasted.board.version, 5);
    assert.deepEqual(parseWhiteboardImport(JSON.stringify({ format: 'smena-project-whiteboard', version: 1, board })).board, board);
    const svg = whiteboardShapeSvg({ ...node(shape), x: 100, y: -50 });
    assert.match(svg, /^<(rect|ellipse|polygon|path) /);
    assert.doesNotMatch(svg, /NaN|Infinity|undefined|<script|javascript:/);
  }
  assert.equal(validWhiteboard({ version: 5, nodes: [node('unknown')], edges: [] }), false);
});
