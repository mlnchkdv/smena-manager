import test from 'node:test';
import assert from 'node:assert/strict';
import { renderKnowledgeMarkdown, knowledgeReadingSource } from '../../src/shared/knowledge-markdown.js';
test('portable Markdown renders lists, headings and fenced code safely', () => {
  const html = renderKnowledgeMarkdown('# Title\n- Item\n1. Next\n```html\n<script>alert(1)</script>\n```\n[bad](javascript:alert)\n[ok](https://example.com)');
  assert.match(html, /<h2>Title<\/h2>/);
  assert.match(html, /<ul><li>Item/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /rel="noopener noreferrer"/);
});
test('reading view removes only a matching first heading without modifying stored Markdown', () => {
  const note = { title: 'Заметка', formatted_markdown: '# Заметка\r\n\nТекст\n# Другая часть' };
  assert.equal(knowledgeReadingSource(note), '\nТекст\n# Другая часть');
  assert.match(note.formatted_markdown, /^# Заметка/);
  assert.equal(knowledgeReadingSource({ ...note, title: 'Другое название' }), note.formatted_markdown);
  assert.equal(knowledgeReadingSource({ title: 'Note', formatted_markdown: '# Note ###\nText' }), 'Text');
});
