import test from 'node:test';
import assert from 'node:assert/strict';
import { searchSettings } from '../../src/shared/settings-search.js';
test('settings search supports RU/EN aliases and only searches authorized navigation', () => {
  const nav = [
    [
      'General',
      [
        ['datetime', 'Date & time'],
        ['data-transfer', 'Data transfer'],
      ],
    ],
    ['Personal', [['security', 'Account security']]],
  ];
  assert.deepEqual(
    searchSettings(nav, 'часовой пояс').map(r => r.key),
    ['datetime'],
  );
  assert.deepEqual(
    searchSettings(nav, 'backup').map(r => r.key),
    ['data-transfer'],
  );
  assert.deepEqual(
    searchSettings(nav, 'сессии').map(r => r.key),
    ['security'],
  );
  assert.equal(searchSettings([nav[1]], 'backup').length, 0);
  assert.equal(searchSettings(nav, 'unknown').length, 0);
  assert.equal(searchSettings(nav, '').length, 0);
});
