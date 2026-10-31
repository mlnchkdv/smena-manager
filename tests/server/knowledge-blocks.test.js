import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownBlocks, replaceMarkdownBlock, moveMarkdownBlock, editBlockRange } from '../../src/shared/knowledge-blocks.js';
test('block edits preserve raw frontmatter fences and neighboring syntax', () => {
  const text = '---\ntitle: A\n---\n# A\n\n```js\na\n\nb\n```\n\nLast';
  const blocks = markdownBlocks(text);
  assert.equal(blocks.length, 4);
  assert.equal(blocks[0].metadata, true);
  assert.equal(replaceMarkdownBlock(text, 3, 'Changed'), text.replace('Last', 'Changed'));
  assert.equal(moveMarkdownBlock(text, 1, -1), text);
  assert.match(moveMarkdownBlock(text, 3, -1), /Last[\s\S]*```js/);
  assert.throws(() => replaceMarkdownBlock(text, 0, 'bad'));
});

test('editing a block into multiple paragraphs never duplicates following text', () => {
  const base = 'First\n\nLast';
  let range = { base, start: 0, end: 7 };
  const a = editBlockRange(base, range, 'One\n\nTwo\n\n');
  const b = editBlockRange(a.text, a.range, 'One\n\nTwo more\n\n');
  assert.equal(b.text, 'One\n\nTwo more\n\nLast');
  assert.throws(() => editBlockRange(base, a.range, 'bad'));
  assert.equal(markdownBlocks('---\r\ntitle: A\r\n---\r\nBody')[0].metadata, true);
});
