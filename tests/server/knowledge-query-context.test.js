import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeQueryTokens, removeKnowledgeQueryToken } from '../../src/shared/knowledge-query-context.js';
test('removing one query condition preserves quoted phrases and remaining comparisons', () => {
  const q = 'type:meeting "Quarterly Review" field:date>=2026-10-31 tag:team';
  assert.equal(knowledgeQueryTokens(q)[2].rule.field, 'field:date');
  assert.equal(removeKnowledgeQueryToken(q, 0), '"Quarterly Review" field:date>=2026-10-31 tag:team');
  assert.equal(removeKnowledgeQueryToken(q, 2), 'type:meeting "Quarterly Review" tag:team');
  assert.equal(removeKnowledgeQueryToken(q, -1), q);
});
