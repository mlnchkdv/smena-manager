import test from 'node:test';
import assert from 'node:assert/strict';
import { resizedWhiteboardNode as resize, snapWhiteboardResize } from '../../src/shared/whiteboard-resize.js';
import { validWhiteboard } from '../../src/shared/project-whiteboard.js';

const node = { id: 'a', type: 'text', x: -100, y: 40, width: 260, height: 180, title: 'Card', text: '', color: 'neutral' };
test('locked corner resizing preserves proportions and anchors through every boundary', () => {
  for (const direction of ['ne', 'nw', 'se', 'sw'])
    for (const dx of [-99999, -40, 80, 99999]) {
      const n = resize(node, direction, dx, dx / 2, 10, { lockAspect: true });
      assert.ok(validWhiteboard({ version: 1, nodes: [n], edges: [] }));
      assert.ok(Math.abs(n.width / node.width - n.height / node.height) < 0.007);
      assert.equal(direction.includes('w') ? n.x + n.width : n.x, direction.includes('w') ? node.x + node.width : node.x);
      assert.equal(direction.includes('n') ? n.y + n.height : n.y, direction.includes('n') ? node.y + node.height : node.y);
    }
});
test('alignment snaps only within tolerance and does not include the resized node itself', () => {
  const other = { ...node, id: 'b', x: 205, y: 275 };
  const snapped = snapWhiteboardResize(node, 'se', 40, 50, [node, other], 6);
  assert.deepEqual(snapped, {
    dx: 45,
    dy: 55,
    guides: [
      { axis: 'x', value: 205 },
      { axis: 'y', value: 275 },
    ],
  });
  assert.deepEqual(snapWhiteboardResize(node, 'se', 20, 20, [node, other], 6), { dx: 20, dy: 20, guides: [] });
  assert.deepEqual(node, { id: 'a', type: 'text', x: -100, y: 40, width: 260, height: 180, title: 'Card', text: '', color: 'neutral' });
});
test('all eight directions resize only their axes and keep opposite edges fixed', () => {
  for (const direction of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']) {
    const n = resize(node, direction, 40, 20);
    assert.equal(n.x, direction.includes('w') ? -60 : -100);
    assert.equal(n.y, direction.includes('n') ? 60 : 40);
    assert.equal(n.width, direction.includes('w') ? 220 : direction.includes('e') ? 300 : 260);
    assert.equal(n.height, direction.includes('n') ? 160 : direction.includes('s') ? 200 : 180);
    assert.ok(validWhiteboard({ version: 1, nodes: [n], edges: [] }));
  }
});
test('size limits preserve anchors and support non-grid imported dimensions', () => {
  const start = { ...node, width: 267, height: 183 };
  const small = resize(start, 'nw', 9999, 9999);
  assert.deepEqual([small.x + small.width, small.y + small.height], [167, 223]);
  assert.deepEqual([small.width, small.height], [160, 100]);
  const large = resize(start, 'nw', -9999, -9999);
  assert.deepEqual([large.x + large.width, large.y + large.height], [167, 223]);
  assert.deepEqual([large.width, large.height], [2000, 2000]);
});
test('coordinate limits produce valid geometry for frames and retain content', () => {
  for (const x of [-50000, 50000])
    for (const y of [-50000, 50000]) {
      const start = { ...node, type: 'group', x, y };
      for (const delta of [-99999, 99999]) {
        const result = resize(start, 'nw', delta, delta);
        assert.ok(validWhiteboard({ version: 1, nodes: [result], edges: [] }));
        assert.equal(result.x + result.width, x + node.width);
        assert.equal(result.y + result.height, y + node.height);
        assert.equal(result.text, start.text);
      }
    }
});
test('zoom-converted deltas snap consistently and invalid input is a no-op', () => {
  assert.equal(resize(node, 'se', 20 / 0.5, 10 / 0.5).width, 300);
  assert.equal(resize(node, 'se', 2, 3).width, node.width);
  for (const args of [
    ['bad', 20, 30],
    ['se', NaN, 20],
    ['se', 20, Infinity],
  ])
    assert.deepEqual(resize(node, ...args), node);
});
