import assert from 'node:assert/strict';
import test from 'node:test';
import { knowledgeExcerpt } from '../../src/shared/knowledge-search.js';
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
