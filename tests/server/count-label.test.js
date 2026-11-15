import assert from 'node:assert/strict';
import test from 'node:test';
import { countLabel } from '../../src/shared/count-label.js';

test('graph counts use singular, few and plural forms with normalized numbers', () => {
  for (const [kind, forms] of Object.entries({
    node: ['узел', 'узла', 'узлов'],
    group: ['группа', 'группы', 'групп'],
    line: ['линия', 'линии', 'линий'],
    material: ['материал', 'материала', 'материалов'],
  })) {
    for (const [n, index] of [
      [0, 2],
      [1, 0],
      [2, 1],
      [5, 2],
      [11, 2],
      [21, 0],
      [22, 1],
    ])
      assert.equal(countLabel(n, kind, 'ru-RU'), `${n} ${forms[index]}`);
    assert.equal(countLabel(1, kind), `1 ${kind}`);
    assert.equal(countLabel(2, kind), `2 ${kind}s`);
  }
  assert.equal(countLabel(-2, 'node'), '0 nodes');
});
