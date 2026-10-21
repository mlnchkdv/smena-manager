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

test('Markdown tables preserve alignment, escaped pipes, inline code and safe cell formatting', () => {
  const html = renderKnowledgeMarkdown(
    '| Раздел | Qty | Details |\n| :--- | ---: | :---: |\n| **Команда** | 2 | `a|b` and c\\|d |\n| <img src=x onerror=alert(1)> | 3 | [unsafe](javascript:alert) |\n\n# Next',
  );
  assert.match(html, /<table><thead><tr><th scope="col" class="knowledge-table-left">Раздел/);
  assert.match(html, /class="knowledge-table-right">Qty/);
  assert.match(html, /class="knowledge-table-center">Details/);
  assert.match(html, /<strong>Команда<\/strong>/);
  assert.match(html, /<code>a\|b<\/code> and c\|d/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img|href="javascript:/);
  assert.match(html, /<\/table><\/div><h2>Next<\/h2>/);
});

test('tables support optional edge pipes and incomplete rows without consuming fenced code', () => {
  const html = renderKnowledgeMarkdown('Name | Value\n--- | ---\nShort |\nA | B | Ignored\n```text\nX | Y\n--- | ---\n```');
  assert.match(html, /knowledge-table-left">Short<\/td><td class="knowledge-table-left"><\/td>/);
  assert.doesNotMatch(html, /Ignored/);
  assert.match(html, /<pre><code>X \| Y\n--- \| ---<\/code><\/pre>/);
  assert.equal((html.match(/<table>/g) || []).length, 1);
  assert.doesNotMatch(renderKnowledgeMarkdown('A | B\n-- | ---\nC | D'), /<table>/);
});
