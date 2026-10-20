import test from 'node:test';
import assert from 'node:assert/strict';
import { createKnowledgeIndex } from '../../src/server/knowledge-index.js';
test('indexed RU/EN search verifies phrases and paginates without content transfer', () => {
  const notes = Array.from({ length: 1600 }, (_, i) => ({
    id: `n${i}`,
    title: `Заметка ${i}`,
    formatted_markdown: 'Team work process',
    folderId: i % 2 ? 'a' : null,
    tags: ['команда'],
  }));
  const index = createKnowledgeIndex(notes);
  const page = index.search({ query: 'команда "work process"', folder: 'a', offset: 780 });
  assert.equal(page.total, 800);
  assert.equal(page.ids.length, 20);
  assert.equal(page.hasMore, false);
  assert.equal('formatted_markdown' in page, false);
  assert.equal(index.search({ query: 'work "process team"' }).total, 0);
  assert.equal(index.search({ query: 'ЗАметка' }).total, 1600);
});
