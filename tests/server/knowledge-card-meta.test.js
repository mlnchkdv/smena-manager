import test from 'node:test';
import assert from 'node:assert/strict';
import { cardMetaPreferences, validCardMeta } from '../../src/shared/knowledge-card-meta.js';
import { applyPersonalSettings } from '../../src/shared/personal-settings.js';
test('card metadata preferences validate selected fields and remain personal', () => {
  const value = { version: 1, showType: false, fields: { meeting: ['date', 'project'] } };
  assert.equal(validCardMeta(value), true);
  for (const fields of [['date', 'date'], ['a', 'b', 'c', 'd'], ['<script>']]) assert.equal(validCardMeta({ ...value, fields: { meeting: fields } }), false);
  assert.equal(cardMetaPreferences('broken').showType, true);
  const db = { members: [{ id: 'a' }, { id: 'b' }] };
  applyPersonalSettings(db, 'a', { preferences: { knowledgeCardMeta: JSON.stringify(value) } });
  assert.deepEqual(JSON.parse(db._userPrefs.a.knowledgeCardMeta), value);
  assert.equal(db._userPrefs.b, undefined);
  assert.throws(() => applyPersonalSettings(db, 'a', { preferences: { knowledgeCardMeta: '{}' } }), /Invalid/);
});
