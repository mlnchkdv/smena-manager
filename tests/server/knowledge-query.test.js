import test from 'node:test';
import assert from 'node:assert/strict';
import { createKnowledgeMatcher } from '../../src/shared/knowledge-search.js';
import { validKnowledgeQueries } from '../../src/shared/knowledge-query.js';
import { applyPersonalSettings } from '../../src/shared/personal-settings.js';
test('typed query rules combine with phrases and keep personal collections scoped', () => {
  const note = {
    title: 'Review guide',
    formatted_markdown: 'Keep exact phrase intact',
    typeId: 'instruction',
    tags: ['Team'],
    properties: { review: '2026-11-01', score: 5, owner: 'm' },
  };
  assert.equal(createKnowledgeMatcher('type:instruction tag:team field:score>=5 field:review<2026-12-01 has:owner "exact phrase"')(note), true);
  assert.equal(createKnowledgeMatcher('type:meeting')(note), false);
  assert.equal(createKnowledgeMatcher('field:score>5')(note), false);
  assert.equal(
    validKnowledgeQueries([
      { id: 'x', name: 'Review', query: 'has:owner' },
      { id: 'x', name: 'Duplicate', query: '' },
    ]),
    false,
  );
  const d = { members: [{ id: 'me' }, { id: 'other' }], _userPrefs: { other: { theme: 'dark' } } };
  const value = JSON.stringify([{ id: 'x', name: 'Mine', query: 'has:owner' }]);
  applyPersonalSettings(d, 'me', { preferences: { knowledgeQueries: value } });
  assert.equal(d._userPrefs.me.knowledgeQueries, value);
  assert.equal(d._userPrefs.other.knowledgeQueries, undefined);
  assert.throws(() => applyPersonalSettings(d, 'me', { preferences: { knowledgeQueries: '{}' } }), /Invalid/);
});
