import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeAsset, assetPath } from '../../src/shared/knowledge-assets.js';
import { renderKnowledgeMarkdown } from '../../src/shared/knowledge-markdown.js';
test('relative media retain source paths and never embed remote or executable images', () => {
  assert.deepEqual(knowledgeAsset('smena-file:f#page=3'), { id: 'f', page: 3 });
  assert.equal(knowledgeAsset('./image.png', { 'image.png': 'f' }).id, 'f');
  assert.equal(assetPath('../private'), null);
  assert.equal(assetPath('https://remote/image'), null);
  const html = renderKnowledgeMarkdown('![Image](smena-file:f)', { asset: () => ({ id: 'f' }) });
  assert.match(html, /loadKnowledgeImage/);
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(renderKnowledgeMarkdown('![Image](https://remote/image)'), /<img/);
});
