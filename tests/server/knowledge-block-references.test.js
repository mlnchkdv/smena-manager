import test from 'node:test';
import assert from 'node:assert/strict';
import { identifyBlock, resolveKnowledgeBlock } from '../../src/shared/knowledge-block-references.js';
import { renderKnowledgeMarkdown } from '../../src/shared/knowledge-markdown.js';
test('stable block identities survive moves and recursive embeds are bounded', () => {
  const saved = identifyBlock('First\n\nSecond', 0, 'stable');
  assert.equal(identifyBlock(saved.text, 0, 'another').id, 'stable');
  const notes = [{ id: 'n', title: 'Title', formatted_markdown: saved.text }];
  assert.match(resolveKnowledgeBlock(notes, 'n', 'stable').source, /First/);
  assert.equal(resolveKnowledgeBlock(notes, 'n', 'missing'), null);
  const html = renderKnowledgeMarkdown('![[note:n#^stable]]', { resolveBlock: (id, block) => resolveKnowledgeBlock(notes, id, block) });
  assert.match(html, /knowledge-transclusion/);
  assert.doesNotMatch(html, /\^stable/);
  const cycle = renderKnowledgeMarkdown('![[note:n#^stable]]', { resolveBlock: () => ({ title: 'Cycle', source: '![[note:n#^stable]]' }) });
  assert.match(cycle, /recursive/);
  assert.ok(cycle.length < 1000);
});
