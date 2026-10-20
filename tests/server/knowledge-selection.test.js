import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleKnowledgePageSelection } from '../../src/shared/knowledge-selection.js';

test('selecting a new page preserves earlier pages and deselecting affects only the current page', () => {
  const first = Array.from({ length: 60 }, (_, i) => `n-${i}`);
  const second = Array.from({ length: 60 }, (_, i) => `n-${i + 60}`);
  const selected = toggleKnowledgePageSelection(first, second);
  assert.equal(selected.length, 120);
  assert.deepEqual(toggleKnowledgePageSelection(selected, second), first);
  assert.deepEqual(
    first,
    Array.from({ length: 60 }, (_, i) => `n-${i}`),
  );
});
test('partial selection fills a page without duplicate IDs and an empty page leaves selection intact', () => {
  assert.deepEqual(toggleKnowledgePageSelection(['a', 'a', 'hidden'], ['a', 'b', 'b']), ['a', 'hidden', 'b']);
  assert.deepEqual(toggleKnowledgePageSelection(['a', 'hidden'], []), ['a', 'hidden']);
});
