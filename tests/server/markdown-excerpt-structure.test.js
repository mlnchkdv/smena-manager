import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownText, firstMarkdownParagraph } from '../../src/shared/markdown-text.js';
import { knowledgeExcerpt } from '../../src/shared/knowledge-search.js';

test('summaries skip structural separators, headings and closed code blocks', () => {
  const source = '---\n\n## Заголовок\n\n```js\nconst a = 1;\n```\n\nПервый абзац с user_id и NAV-CHECK.';
  assert.equal(firstMarkdownParagraph(source), 'Первый абзац с user_id и NAV-CHECK.');
  assert.equal(markdownText('| Name | Value |\n| --- | :---: |\n| CPU | 10 |'), 'Name · Value CPU · 10');
});
test('TXT excerpts remain literal and derived Markdown never rewrites source', () => {
  const note = { formatted_markdown: '---\n\n| A | B |', sourceFormat: 'text' };
  assert.match(knowledgeExcerpt(note, ''), /---/);
  assert.equal(note.formatted_markdown, '---\n\n| A | B |');
});
