import test from 'node:test';
import assert from 'node:assert/strict';
import { graphListContext } from '../../src/shared/graph-list-context.js';

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
