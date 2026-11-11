import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareKnowledgeMarkdown } from '../../src/shared/knowledge-markdown-preparation.js';
import { renderKnowledgeMarkdown } from '../../src/shared/knowledge-markdown.js';

test('ordinary Markdown stays tokenized; excessive token complexity returns a typed bounded result', () => {
  assert.ok(Array.isArray(prepareKnowledgeMarkdown('# Heading\n\n**Text**').tokens));
  const source = Array.from({ length: 100 }, () => '**bold** and `code`. '.repeat(800)).join('\n\n') + '\nEND_OF_SOURCE';
  assert.deepEqual(prepareKnowledgeMarkdown(source), { error: 'complexity' });
  assert.equal(source.endsWith('END_OF_SOURCE'), true);
  assert.deepEqual(prepareKnowledgeMarkdown('x'.repeat(2 * 1024 * 1024 + 1)), { error: 'source-limit' });
});
test('plain fallback preserves far text and never executes embedded HTML or Markdown resources', () => {
  const source = '<script>alert(1)</script>\n\n![Image](https://example.test/tracker.png)\n' + 'Readable text '.repeat(100000) + '\nEND_OF_SOURCE';
  const html = renderKnowledgeMarkdown(source, { plainText: true });
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<(?:script|img|iframe)\b/);
  assert.ok(html.endsWith('END_OF_SOURCE</pre>'));
  assert.equal(
    source.length,
    html
      .replace(/^<pre[^>]*>/, '')
      .replace(/<\/pre>$/, '')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>').length,
  );
});
