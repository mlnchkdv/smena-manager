import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSidebar, sidebarPreferences, validSidebar } from '../../src/shared/sidebar-preferences.js';
import { applyPersonalSettings } from '../../src/shared/personal-settings.js';
test('sidebar preferences preserve personal order without accepting injected routes or hiding settings', () => {
  const value = defaultSidebar();
  value.order.reverse();
  value.hidden = ['graph'];
  value.counts = false;
  assert.equal(validSidebar(value), true);
  assert.deepEqual(sidebarPreferences(JSON.stringify(value)), value);
  assert.equal(validSidebar({ ...value, hidden: ['settings'] }), false);
  assert.equal(validSidebar({ ...value, order: [...value.order, 'javascript:alert(1)'] }), false);
  assert.deepEqual(sidebarPreferences('broken'), defaultSidebar());
  const old = sidebarPreferences(JSON.stringify({ ...value, order: ['knowledge'], hidden: ['graph', 'unknown'] }));
  assert.equal(old.order[0], 'knowledge');
  assert.equal(validSidebar(old), true);
  assert.deepEqual(old.hidden, ['graph']);
});
test('sidebar preferences belong only to the requesting member', () => {
  const data = { members: [{ id: 'one' }, { id: 'two' }] };
  const one = defaultSidebar();
  one.hidden = ['files', 'graph'];
  applyPersonalSettings(data, 'one', { preferences: { sidebar: JSON.stringify(one) } });
  applyPersonalSettings(data, 'two', { preferences: { sidebar: JSON.stringify(defaultSidebar()) } });
  assert.deepEqual(JSON.parse(data._userPrefs.one.sidebar).hidden, ['files', 'graph']);
  assert.deepEqual(JSON.parse(data._userPrefs.two.sidebar).hidden, []);
  assert.throws(() => applyPersonalSettings(data, 'one', { preferences: { sidebar: JSON.stringify({ ...one, hidden: ['settings'] }) } }), /Invalid/);
});
