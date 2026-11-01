import test from 'node:test';
import assert from 'node:assert/strict';
import { graphChoiceContexts, graphListContext } from '../../src/shared/graph-list-context.js';

test('graph list uses bounded meaningful context and omits repeated title/type', () => {
  assert.equal(graphListContext({ kind: 'project', title: 'Same', context: 'Same' }, 'Project'), '');
  assert.equal(
    graphListContext({ kind: 'bookmark', title: 'Docs', context: 'Bookmark', item: { url: 'https://example.com/docs' } }, 'Bookmark'),
    'example.com',
  );
  assert.equal(graphListContext({ kind: 'bookmark', title: 'Docs', context: 'Закладка', item: { url: 'invalid' } }, 'Закладка'), '');
  assert.equal(graphListContext({ kind: 'file', title: 'Spec', context: 'Project A' }, 'File'), 'Project A');
  assert.equal(graphListContext({ kind: 'note', title: 'Spec', context: 'Team / Specs' }, 'Note', 'No folder'), 'Team / Specs');
  assert.equal(graphListContext({ kind: 'note', title: 'Spec' }, 'Заметка', 'Без папки'), 'Без папки');
  assert.equal(graphListContext({ kind: 'bookmark', title: 'example.com', item: { url: 'https://example.com' } }, 'Bookmark'), '');
});

test('connection choices distinguish folders and stable duplicates using only supplied nodes', () => {
  const nodes = [
    { key: 'note:b', kind: 'note', title: 'Spec', context: 'Team / Specs' },
    { key: 'note:a', kind: 'note', title: 'Spec', context: 'Team / Specs' },
    { key: 'note:c', kind: 'note', title: 'Spec' },
    { key: 'file:d', kind: 'file', title: 'Spec', context: 'Project A' },
  ];
  const contexts = graphChoiceContexts(nodes, { note: 'Заметка' }, 'Без папки');
  assert.equal(contexts.get('note:a'), 'Team / Specs · 1/2');
  assert.equal(contexts.get('note:b'), 'Team / Specs · 2/2');
  assert.equal(contexts.get('note:c'), 'Без папки');
  assert.equal(contexts.get('file:d'), 'Project A');
  assert.equal(contexts.size, nodes.length);
  assert.deepEqual([...graphChoiceContexts([...nodes].reverse(), {}, 'Без папки')].sort(), [...contexts].sort());
});
