import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutPreferenceKeys, knowledgeViewKeys, readScopedLayout } from '../../src/shared/layout-preference-storage.js';
const storage = entries => {
  const data = new Map(entries);
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};
test('scoped view keys distinguish identities which collided in the legacy delimiter format', () => {
  const a = layoutPreferenceKeys('a:b', 'c', 'graph-clusters'),
    b = layoutPreferenceKeys('a', 'b:c', 'graph-clusters');
  assert.notEqual(a[0], b[0]);
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
  const source = storage([
    [a[0], 'false'],
    ['smena.layout.v1:a:b:c:graph-clusters', 'true'],
  ]);
  assert.deepEqual(readScopedLayout(source, b), { stored: false });
  assert.deepEqual(readScopedLayout(source, a), { stored: true, value: false });
  assert.notEqual(knowledgeViewKeys('a:b', 'c')[0], knowledgeViewKeys('a', 'b:c')[0]);
  assert.deepEqual(layoutPreferenceKeys(null, 'workspace', 'view'), []);
  assert.deepEqual(knowledgeViewKeys('member', ''), []);
});
test('safe legacy migration preserves named views, explicit false and every unknown field; a blocked store still reads', () => {
  const keys = knowledgeViewKeys('member', 'space'),
    value = { views: [{ name: 'Personal search', query: 'team' }], columns: ['title'], futureField: { keep: true } };
  const source = storage([[keys[1], JSON.stringify(value)]]);
  assert.deepEqual(readScopedLayout(source, keys), { stored: true, value });
  assert.equal(source.data.get(keys[0]), JSON.stringify(value));
  const layout = layoutPreferenceKeys('member', 'space', 'graph-clusters');
  source.data.set(layout[1], 'false');
  assert.deepEqual(readScopedLayout(source, layout), { stored: true, value: false });
  source.setItem = () => {
    throw Error('Storage blocked');
  };
  source.data.delete(layout[0]);
  assert.deepEqual(readScopedLayout(source, layout), { stored: true, value: false });
  source.data.set(keys[0], '{malformed');
  assert.throws(() => readScopedLayout(source, keys));
  assert.equal(source.data.get(keys[1]), JSON.stringify(value));
});
