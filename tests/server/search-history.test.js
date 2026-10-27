import assert from 'node:assert/strict';
import test from 'node:test';
import { searchHistoryKey, normalizeSearchHistory, readSearchHistory, writeSearchHistory } from '../../src/shared/search-history.js';
import { projectWorkspace, mergeClientWorkspace } from '../../src/server/workspace-policy.js';

test('search history isolates accounts and workspaces, survives rereads and clears only its owner', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const a = searchHistoryKey('a', 'team'),
    b = searchHistoryKey('b', 'team'),
    other = searchHistoryKey('a', 'other');
  writeSearchHistory(storage, a, ['private query']);
  assert.deepEqual(readSearchHistory(storage, a), ['private query']);
  assert.deepEqual(readSearchHistory(storage, b), []);
  assert.deepEqual(readSearchHistory(storage, other), []);
  writeSearchHistory(storage, b, ['another query']);
  writeSearchHistory(storage, a, []);
  assert.deepEqual(readSearchHistory(storage, a), []);
  assert.deepEqual(readSearchHistory(storage, b), ['another query']);
  assert.equal(searchHistoryKey(null, 'team'), null);
  assert.deepEqual(readSearchHistory(storage, null), []);
  assert.deepEqual(readSearchHistory(null, a), []);
});

test('search history is bounded and tolerates invalid browser data', () => {
  assert.deepEqual(normalizeSearchHistory([' a ', 'a', null, 42, '', 'b', 'c', 'd', 'e', 'f']), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(normalizeSearchHistory(['x'.repeat(1000)])[0].length, 200);
  assert.deepEqual(readSearchHistory({ getItem: () => '{' }, 'key'), []);
  assert.equal(writeSearchHistory(null, 'key', ['query']), false);
});

test('legacy shared queries are not exposed to either account and cannot be erased by a projected save', () => {
  const data = { members: [{ id: 'a' }, { id: 'b' }], projects: [], recentSearches: ['legacy unattributed query'] };
  for (const [id, role] of [
    ['a', 'admin'],
    ['b', 'editor'],
  ]) {
    const visible = projectWorkspace(data, { id, role });
    assert.deepEqual(visible.recentSearches, []);
    const merged = mergeClientWorkspace(data, { ...visible, recentSearches: ['spoofed shared query'] }, role, id);
    assert.deepEqual(merged.recentSearches, data.recentSearches);
    assert.deepEqual(projectWorkspace(merged, { id, role }).recentSearches, []);
  }
});
