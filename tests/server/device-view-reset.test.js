import test from 'node:test';
import assert from 'node:assert/strict';
import { resetDeviceViews } from '../../src/shared/device-view-reset.js';
import { knowledgeViewKeys, layoutPreferenceKeys, readScopedLayout } from '../../src/shared/layout-preference-storage.js';
import { fileViewKey } from '../../src/shared/file-view.js';
function storage(entries = []) {
  const data = new Map(entries),
    reads = [];
  return {
    data,
    reads,
    get length() {
      return data.size;
    },
    key: index => [...data.keys()][index],
    getItem: key => {
      reads.push(key);
      return data.get(key) ?? null;
    },
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  };
}
test('knowledge view reset preserves searches, recent items and unknown metadata in both key generations', () => {
  const keys = knowledgeViewKeys('owner', 'space'),
    value = { paneWidth: 410, columns: ['title', 'owner'], cardDensity: 'compact', views: [{ id: 'q', query: 'team' }], recent: ['n'], future: { kept: true } };
  const own = layoutPreferenceKeys('owner', 'space', 'knowledge-table-wide'),
    other = knowledgeViewKeys('other', 'space')[0];
  const source = storage([
    [keys[0], JSON.stringify(value)],
    [keys[1], JSON.stringify(value)],
    [own[0], 'true'],
    [own[1], 'true'],
    [other, 'private opaque'],
    ['smena.offline.protected', 'opaque recovery data'],
  ]);
  assert.equal(resetDeviceViews(source, 'owner', 'space', 'knowledge').changed, 4);
  for (const key of keys) assert.deepEqual(JSON.parse(source.data.get(key)), { views: value.views, recent: ['n'], future: { kept: true } });
  assert.deepEqual(readScopedLayout(source, own), { stored: false });
  assert.equal(source.data.get(other), 'private opaque');
  assert.equal(source.data.get('smena.offline.protected'), 'opaque recovery data');
  assert.ok(!source.reads.includes(other));
  assert.ok(!source.reads.includes('smena.offline.protected'));
});
test('file and other resets stay in this identity and preserve named filters', () => {
  const key = fileViewKey('owner', 'space'),
    own = layoutPreferenceKeys('owner', 'space', 'graph-clusters')[0],
    foreign = layoutPreferenceKeys('owner', 'other-space', 'graph-clusters')[0];
  const source = storage([
    [key, '{"view":"list"}'],
    [key + ':filters', '[{"id":"saved"}]'],
    [own, 'false'],
    [foreign, 'false'],
    ['smena.layout.v2:invalid', 'kept'],
  ]);
  resetDeviceViews(source, 'owner', 'space', 'files');
  assert.equal(source.data.has(key), false);
  assert.equal(source.data.get(key + ':filters'), '[{"id":"saved"}]');
  resetDeviceViews(source, 'owner', 'space', 'other');
  assert.equal(source.data.has(own), false);
  assert.equal(source.data.get(foreign), 'false');
  assert.throws(() => resetDeviceViews(source, '', 'space', 'files'));
  assert.throws(() => resetDeviceViews(source, 'owner', 'space', 'unknown'));
});
test('a write failure rolls back already changed layouts and unreadable note JSON causes no writes', () => {
  const keys = knowledgeViewKeys('owner', 'space'),
    source = storage([
      [keys[0], '{"columns":["title"],"views":[{"id":"saved"}]}'],
      [keys[1], '{"columns":["title"]}'],
    ]);
  const original = new Map(source.data);
  let writes = 0;
  source.setItem = (key, value) => {
    if (++writes === 2) throw Error('Quota');
    source.data.set(key, value);
  };
  assert.throws(
    () => resetDeviceViews(source, 'owner', 'space', 'knowledge'),
    error => error.rollbackFailed === false,
  );
  assert.deepEqual(source.data, original);
  source.data.set(keys[0], '{invalid');
  const corrupt = new Map(source.data);
  assert.throws(() => resetDeviceViews(source, 'owner', 'space', 'knowledge'));
  assert.deepEqual(source.data, corrupt);
});
test('rollback does not overwrite a value another tab replaced after the reset began', () => {
  const keys = knowledgeViewKeys('owner', 'space'),
    source = storage([
      [keys[0], '{"paneWidth":410}'],
      [keys[1], '{"paneWidth":300}'],
    ]);
  let writes = 0;
  source.setItem = (key, value) => {
    if (++writes === 2) {
      source.data.set(keys[0], '{"paneWidth":250}');
      throw Error('Interruption');
    }
    source.data.set(key, value);
  };
  assert.throws(
    () => resetDeviceViews(source, 'owner', 'space', 'knowledge'),
    error => error.rollbackFailed === true,
  );
  assert.equal(source.data.get(keys[0]), '{"paneWidth":250}');
});

test('a named search added while preparing a reset is retained instead of being replaced by the earlier JSON', () => {
  const keys = knowledgeViewKeys('owner', 'space'), source = storage([[keys[0], '{"paneWidth":410,"views":[]}']]);
  let reads = 0;
  source.getItem = key => {
    if (key === keys[0] && ++reads === 2) source.data.set(key, '{"paneWidth":410,"views":[{"id":"late-search"}]}');
    return source.data.get(key) ?? null;
  };
  assert.throws(() => resetDeviceViews(source, 'owner', 'space', 'knowledge'));
  assert.deepEqual(JSON.parse(source.data.get(keys[0])).views, [{ id: 'late-search' }]);
});
