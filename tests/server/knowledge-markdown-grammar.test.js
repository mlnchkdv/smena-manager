import test from 'node:test';
import assert from 'node:assert/strict';
import { renderKnowledgeMarkdown, knowledgeReadingSource } from '../../src/shared/knowledge-markdown.js';

test('paragraphs, nested lists, emphasis and numbered starts follow the same Markdown grammar', () => {
  const html = renderKnowledgeMarkdown('First line\nsecond line\n\n*Italic* **Bold** ~~Removed~~\n\n- Parent\n  - Child\n\n3. Third\n4. Fourth');
  assert.match(html, /<p>First line\nsecond line<\/p>/);
  assert.match(html, /<em>Italic<\/em> <strong>Bold<\/strong> <del>Removed<\/del>/);
  assert.match(html, /<ul><li>Parent<ul><li>Child<\/li><\/ul><\/li><\/ul>/);
  assert.match(html, /<ol start="3"><li>Third<\/li><li>Fourth<\/li><\/ol>/);
});
test('images remain explicit references and raw HTML never issues requests or executes', () => {
  const html = renderKnowledgeMarkdown(
    '![Chart](https://example.test/tracker.png)\n\n![Unsafe](javascript:alert)\n\n<img src="https://example.test/auto.png" onerror="alert(1)">\n\n[Unsafe](javascript:alert)',
  );
  assert.doesNotMatch(html, /<(?:img|script|iframe)\b/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /href="https:\/\/example.test\/tracker.png"/);
  assert.match(html, /&lt;img/);
});
test('TXT stays literal in reading and original sources stay unchanged', () => {
  const source = '# Plain\n*not formatting*\n![Image](https://example.test/a.png)';
  const note = { title: 'Plain', sourceFormat: 'text', formatted_markdown: source };
  assert.equal(knowledgeReadingSource(note), source);
  assert.match(renderKnowledgeMarkdown(source, { plainText: true }), /^<pre class="knowledge-plain-text"># Plain/);
  assert.equal(note.formatted_markdown, source);
});
