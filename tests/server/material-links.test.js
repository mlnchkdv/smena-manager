import test from 'node:test';
import assert from 'node:assert/strict';
import { insertMaterialLink, materialReferences } from '../../src/shared/material-links.js';
import { renderKnowledgeMarkdown } from '../../src/shared/knowledge-markdown.js';
import { extractWikiLinks } from '../../src/shared/knowledge-links.js';
test('material references preserve identities and do not execute injected labels', () => {
  const result = insertMaterialLink('before [[ after', 7, 9, 'project:p1', 'Project "<script>');
  assert.equal(materialReferences(result.text)[0].key, 'project:p1');
  assert.deepEqual(extractWikiLinks(result.text), []);
  assert.match(renderKnowledgeMarkdown(result.text), /data-key="project:p1"/);
  assert.doesNotMatch(renderKnowledgeMarkdown(result.text), /<script>/);
  assert.throws(() => insertMaterialLink('', 0, 0, 'javascript:alert(1)', 'bad'));
});
