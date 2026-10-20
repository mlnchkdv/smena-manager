import test from 'node:test';
import assert from 'node:assert/strict';
import { renderKnowledgeMarkdown } from '../../src/shared/knowledge-markdown.js';
test('portable Markdown renders lists, headings and fenced code safely', () => {
  const html = renderKnowledgeMarkdown('# Title\n- Item\n1. Next\n```html\n<script>alert(1)</script>\n```\n[bad](javascript:alert)\n[ok](https://example.com)');
  assert.match(html, /<h2>Title<\/h2>/);
  assert.match(html, /<ul><li>Item/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /rel="noopener noreferrer"/);
});
