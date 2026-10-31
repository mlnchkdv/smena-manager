import test from 'node:test';
import assert from 'node:assert/strict';
import { renameKnowledgeTag } from '../../src/shared/knowledge-tags.js';
import { bindWikiReferences } from '../../src/shared/knowledge-links.js';
import { createKnowledgeMatcher } from '../../src/shared/knowledge-search.js';
test('tag merges retain search aliases and note aliases bind stable links', () => {
  const original = [{ id: 'a', title: 'Process', aliases: ['Old name'], tags: ['old', 'new'] }];
  const next = renameKnowledgeTag(original, 'old', 'new');
  assert.deepEqual(next[0].tags, ['new']);
  assert.deepEqual(original[0].tags, ['old', 'new']);
  assert.equal(createKnowledgeMatcher('tag:old')(next[0]), true);
  const notes = bindWikiReferences([...next, { id: 'b', formatted_markdown: '[[Old name]]' }]);
  assert.equal(notes[1].wikiRefs[0].target, 'a');
});
