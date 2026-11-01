import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeSourceHeadings } from '../../src/shared/knowledge-source-headings.js';

test('source navigation preserves exact CRLF Unicode offsets and ignores code/metadata', () => {
  const source = '---\r\ntitle: Meta\r\n---\r\n# Один 😀\r\n\r\n```md\r\n# Not a heading\r\n```\r\n\r\nSecond\r\n------\r\n\r\n# Один 😀\r\n';
  const headings = knowledgeSourceHeadings({ sourceFormat: 'markdown', formatted_markdown: source });
  assert.equal(headings.length, 3);
  assert.equal(headings[0].start, source.indexOf('# Один'));
  assert.equal(source.slice(headings[1].start, headings[1].end).trim(), 'Second\r\n------');
  assert.equal(headings[2].start, source.lastIndexOf('# Один'));
  assert.equal(headings[2].ordinal, 1);
  assert.deepEqual(knowledgeSourceHeadings({ sourceFormat: 'text', formatted_markdown: source }), []);
});

test('large source navigation stays bounded without rewriting its input', () => {
  const note = { formatted_markdown: Array.from({ length: 1000 }, (_, i) => `# Section ${i}\n\n`).join('') };
  const original = note.formatted_markdown;
  assert.equal(knowledgeSourceHeadings(note).length, 300);
  assert.equal(note.formatted_markdown, original);
});
