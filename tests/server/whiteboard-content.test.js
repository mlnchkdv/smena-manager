import test from 'node:test';
import assert from 'node:assert/strict';
import { whiteboardPastedContent, whiteboardMaterialPositions } from '../../src/shared/whiteboard-content.js';
import { validWhiteboard } from '../../src/shared/project-whiteboard.js';

test('clipboard content distinguishes selections, URLs and literal text', () => {
  const board = { version: 1, nodes: [], edges: [] };
  assert.deepEqual(whiteboardPastedContent(JSON.stringify({ format: 'smena-whiteboard-selection', version: 1, board })), { kind: 'selection', board });
  assert.deepEqual(whiteboardPastedContent(' https://example.com/path?q=1 '), { kind: 'website', url: 'https://example.com/path?q=1' });
  assert.deepEqual(whiteboardPastedContent('<img src=x onerror=alert(1)>'), { kind: 'text', text: '<img src=x onerror=alert(1)>' });
  for (const value of ['javascript:alert(1)', 'https://user:password@example.com', 'Hello https://example.com'])
    assert.equal(whiteboardPastedContent(value).kind, 'text');
});

test('clipboard content is bounded and refuses unsupported selection versions', () => {
  for (const value of [null, '', '  ', 'x'.repeat(6001), '{"format":"smena-whiteboard-selection","version":2}'])
    assert.equal(whiteboardPastedContent(value), null);
  assert.equal(whiteboardPastedContent('x'.repeat(6000)).text.length, 6000);
});

test('batch placement preserves spacing at either coordinate boundary', () => {
  for (const point of [
    { x: 49999, y: 49999 },
    { x: -60000, y: -60000 },
    { x: 140.5, y: 330.4 },
  ]) {
    for (const count of [1, 2, 3, 4, 12, 200]) {
      const positions = whiteboardMaterialPositions(point, count);
      assert.equal(new Set(positions.map(p => JSON.stringify(p))).size, count);
      assert.equal(
        validWhiteboard({
          version: 1,
          edges: [],
          nodes: positions.map((p, i) => ({ id: 'n' + i, type: 'text', title: '', text: '', color: 'neutral', width: 360, height: 460, ...p })),
        }),
        true,
      );
      if (count > 1) assert.equal(positions[1].x - positions[0].x, 400);
      if (count > 3) assert.equal(positions[3].y - positions[0].y, 500);
    }
  }
  for (const [point, count] of [
    [null, 1],
    [{ x: NaN, y: 1 }, 1],
    [{ x: 1, y: 1 }, 201],
  ])
    assert.deepEqual(whiteboardMaterialPositions(point, count), []);
});
