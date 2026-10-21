import assert from 'node:assert/strict';
import test from 'node:test';
import { knowledgeExcerpt, createKnowledgeMatcher } from '../../src/shared/knowledge-search.js';
import { knowledgeView } from '../../src/shared/knowledge-view.js';
test('search excerpts reveal matching body text even when a summary is present', () => {
  const note = { summary: 'Short description', formatted_markdown: `# Guide\n\n${'Context '.repeat(80)}ключевая фраза далее` };
  assert.equal(knowledgeExcerpt(note, ''), 'Short description');
  assert.match(knowledgeExcerpt(note, '"ключевая фраза"'), /ключевая фраза/);
  assert.match(knowledgeExcerpt(note, 'guide'), /Guide/);
  assert.match(knowledgeExcerpt(note, 'description'), /Short description/);
});
test('excerpts remain plain text and bounded for long Markdown sources', () => {
  const result = knowledgeExcerpt({ formatted_markdown: '# Heading\n\n**content** '.repeat(300) }, 'content', 80);
  assert.ok(result.length <= 82);
  assert.ok(!result.includes('*'));
  assert.equal(knowledgeExcerpt({}, 'none'), '');
});

test('blank searches on large collections never scan note bodies', () => {
  const notes = Array.from({ length: 3000 }, (_, i) => ({
    id: String(i),
    title: `Note ${i}`,
    get formatted_markdown() {
      throw new Error('Unnecessary full-text scan');
    },
  }));
  assert.equal(knowledgeView(notes, { query: '   ', limit: 60 }).visible.length, 60);
  assert.equal(createKnowledgeMatcher('')(notes[0]), true);
});

test('folder and tag filters exclude unrelated full text before searching', () => {
  const irrelevant = {
    id: 'other',
    folderId: 'other',
    tags: ['other'],
    get formatted_markdown() {
      throw new Error('Unrelated note body');
    },
  };
  const relevant = { id: 'match', folderId: 'target', tags: ['team'], formatted_markdown: 'Ключевая фраза Full text' };
  assert.equal(knowledgeView([irrelevant, relevant], { folder: 'target', query: 'full "ключевая фраза"' }).total, 1);
  assert.equal(knowledgeView([irrelevant, relevant], { tag: 'team', query: 'FULL ключевая' }).total, 1);
  const matcher = createKnowledgeMatcher('"Full text" ключевая');
  assert.equal(matcher(relevant), true);
  assert.equal(matcher({ formatted_markdown: 'Full other text ключевая' }), false);
});
