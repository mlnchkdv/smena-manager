import test from 'node:test';
import assert from 'node:assert/strict';
import { renderKnowledgeMarkdown } from '../../src/shared/knowledge-markdown.js';

test('internal links stay local and duplicated Unicode headings have separate destinations', () => {
  const html = renderKnowledgeMarkdown(
    '[Go](#%D0%BD%D0%B0%D1%81%D1%82%D1%80%D0%BE%D0%B9%D0%BA%D0%B0)\n## Настройка\n## Настройка\n```md\n# Not a heading\n```\n[External](https://example.test)',
  );
  assert.match(html, /href="#[^"]+" data-a="knowledgeAnchor" data-anchor="настройка"/);
  assert.match(html, /data-knowledge-heading="настройка"/);
  assert.match(html, /data-knowledge-heading="настройка-1"/);
  assert.doesNotMatch(html, /data-knowledge-heading="not-a-heading"/);
  assert.doesNotMatch(html, /href="#[^"]+" target=/);
  assert.match(html, /href="https:\/\/example.test" target="_blank"/);
});
