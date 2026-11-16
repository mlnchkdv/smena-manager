import test from 'node:test';
import assert from 'node:assert/strict';
import { createKnowledgeMatcher } from '../../src/shared/knowledge-search.js';
import { validKnowledgeQueries, parseKnowledgeQuery } from '../../src/shared/knowledge-query.js';
import { createKnowledgeIndex } from '../../src/server/knowledge-index.js';
import { queryKnowledgeIndex } from '../../src/server/knowledge-search-query.js';
import { applyPersonalSettings } from '../../src/shared/personal-settings.js';

test('quoted operator values, escaping and calendar dates agree in local and cold metadata search', async () => {
  const note = { id: 'quoted', title: 'Example', tags: ['art direction', 'Команда "A"'], updatedAt: '2026-11-16T10:00:00.000Z' };
  const numeric = { ...note, id: 'numeric', updatedAt: Date.parse(note.updatedAt) };
  const notes = [note, numeric];
  assert.equal(
    createKnowledgeMatcher('tag:"art direction"')({
      ...note,
      get formatted_markdown() {
        throw Error('Metadata filters must not scan a large body');
      },
    }),
    true,
  );
  const database = {
    members: [{ id: 'm', authProfileId: 'owner', role: 'Owner', status: 'active' }],
    knowledgeNotes: notes,
    knowledgeFolders: [],
    projects: [],
  };
  for (const query of ['tag:"art direction"', 'tag:"Команда \\"A\\""', 'updated=2026-11-16', 'updated>=2026-11-16 updated<2026-11-17', 'updated<=2026-11-16']) {
    assert.equal(parseKnowledgeQuery(query).error, undefined, query);
    assert.deepEqual(createKnowledgeIndex(notes, []).search({ query }).ids.sort(), ['numeric', 'quoted'], query);
    assert.deepEqual((await queryKnowledgeIndex(database, { id: 'owner', role: 'admin' }, [], { query })).ids.sort(), ['numeric', 'quoted'], query);
  }
  assert.equal(createKnowledgeMatcher('updated>2026-11-16')(note), false);
  assert.equal(createKnowledgeMatcher('updated!=2026-11-16')(numeric), false);
  assert.equal(createKnowledgeMatcher('updated=2026-11-16')({ ...note, updatedAt: '2026-11-17T00:00:00Z' }), false);
  for (const [query, error] of [
    ['tag:"open', 'unclosed_quote'],
    ['tag:""', 'empty_value'],
    ['updated=2026-02-31', 'invalid_date'],
    ['updated>=tomorrow', 'invalid_date'],
  ]) {
    assert.equal(parseKnowledgeQuery(query).error, error);
    assert.equal(createKnowledgeMatcher(query)(note), false);
    await assert.rejects(queryKnowledgeIndex(database, { id: 'owner', role: 'admin' }, [], { query }), { code: 'KNOWLEDGE_QUERY_INVALID', statusCode: 400 });
  }
});
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
