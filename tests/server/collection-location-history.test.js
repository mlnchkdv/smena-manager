import test from 'node:test';
import assert from 'node:assert/strict';
import { CollectionLocationHistory } from '../../src/shared/collection-location-history.js';
const frame = (key, scroll = 0) => ({
  key,
  values: { folder: key, query: 'query ' + key, selection: ['chosen'] },
  scroll: [{ selector: '.content', top: scroll }],
});
test('Back and parent revisits restore the actual prior view, not a fresh default', () => {
  const history = new CollectionLocationHistory();
  assert.equal(history.enter(frame('root', 420), 'child'), null);
  const parent = history.enter(frame('child', 80), 'root');
  assert.equal(parent.scroll[0].top, 420);
  assert.equal(parent.values.query, 'query root');
  parent.values.selection.push('not persisted');
  const back = history.back(frame('root', 430), () => true);
  assert.equal(back.key, 'child');
  assert.equal(back.scroll[0].top, 80);
  assert.deepEqual(history.back(frame('child'), () => true).values.selection, ['chosen']);
});
test('deleted or inaccessible locations are skipped, bounded, and never synthesized in another trail', () => {
  const history = new CollectionLocationHistory(3);
  for (let i = 0; i < 10; i++) history.enter(frame('folder' + i), 'folder' + (i + 1));
  assert.equal(history.locations.size, 3);
  assert.equal(history.history.length, 3);
  const allowed = frame => frame.key === 'folder8';
  assert.equal(history.canBack('folder10', allowed), true);
  assert.equal(history.back(frame('folder10'), allowed).key, 'folder8');
  assert.equal(history.back(frame('folder8'), allowed), null);
  assert.equal(
    new CollectionLocationHistory().canBack('folder8', () => true),
    false,
  );
  assert.equal(history.enter(frame('folder8'), 'folder8'), null);
});
