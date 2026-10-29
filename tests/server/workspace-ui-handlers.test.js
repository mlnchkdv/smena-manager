import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { mergeWorkspaceSettings } from '../../src/shared/workspace-settings-draft.js';
import { workspaceSlug } from '../../src/shared/workspace-slug.js';

// Execute the actual UI handlers with an isolated store and DOM boundary.
// This catches regressions between a correct merge helper and the save action.
function fixture({ russian = false, active = 'default' } = {}) {
  const base = { id: 'workspace', name: 'Team', description: '', url: 'team', c: '#111111' };
  const data = { ws: { ...base }, workspaces: [{ ...base }] };
  const S = {
    ui: { currentUser: { role: 'admin' }, workspaceSettingsBase: { ...base }, workspaceSettingsDraft: { ...base }, workspaceSettingsDirty: true, modals: [] },
  };
  const fields = { '#ws-name': { value: 'My team' }, '#ws-url': { value: 'team' }, '#ws-description': { value: '' } };
  const notices = [];
  const listeners = {};
  let writes = 0;
  const context = {
    S,
    D: () => data,
    A: {},
    IN: {},
    workspaceModalRenderers: {},
    window: {
      addEventListener(name, callback) {
        listeners[name] = callback;
      },
    },
    $: selector => fields[selector],
    isRussian: () => russian,
    t: value => value,
    mergeWorkspaceSettings,
    workspaceSlug,
    getActiveWorkspace: () => active,
    toast: message => notices.push(message),
    mutate: apply => {
      writes++;
      apply();
      return true;
    },
    go() {},
    render() {},
  };
  const source = readFileSync(new URL('../../src/ui/workspaces.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/^export /gm, '');
  vm.runInNewContext(`${source}\nthis.saveSettings = saveWorkspaceSettings; this.feedback = workspaceSettingsFeedback;`, context);
  return { context, data, S, fields, notices, listeners, writes: () => writes };
}

for (const russian of [false, true]) {
  test(`settings save preserves independent remote edits (${russian ? 'ru' : 'en'})`, () => {
    const f = fixture({ russian });
    f.data.ws.description = 'Remote description';
    f.data.ws.c = '#abcdef';
    f.context.saveSettings();
    assert.equal(f.writes(), 1);
    assert.equal(f.data.ws.name, 'My team');
    assert.equal(f.data.ws.description, 'Remote description');
    assert.equal(f.data.ws.c, '#abcdef');
    assert.equal(f.data.workspaces[0].c, '#abcdef');
    assert.equal(f.S.ui.workspaceSettingsDirty, false);
    assert.equal(f.S.ui.workspaceSettingsDraft, null);
  });

  test(`settings conflict retains local input without writing (${russian ? 'ru' : 'en'})`, () => {
    const f = fixture({ russian });
    f.data.ws.name = 'Other administrator';
    f.context.saveSettings();
    assert.equal(f.writes(), 0);
    assert.equal(f.data.ws.name, 'Other administrator');
    assert.equal(f.fields['#ws-name'].value, 'My team');
    assert.equal(f.S.ui.workspaceSettingsDirty, true);
    assert.match(f.notices[0], russian ? /другой сессии/ : /another session/);
  });
}

test('settings save keeps immutable addresses and validates the merged address', () => {
  const f = fixture({ active: 'another-workspace' });
  f.fields['#ws-url'].value = 'changed';
  f.context.saveSettings();
  assert.equal(f.data.ws.url, 'team');

  const duplicate = fixture();
  duplicate.data.ws.url = 'remote-address';
  duplicate.S.ui.availableWorkspaces = [{ id: 'other', url: 'remote-address' }];
  duplicate.context.saveSettings();
  assert.equal(duplicate.writes(), 0);
  assert.match(duplicate.notices[0], /already in use/);
});

test('form feedback waits for its own server confirmation and retains retry state', () => {
  const f = fixture();
  assert.equal(f.context.feedback().state, 'dirty');
  f.context.saveSettings();
  assert.equal(f.context.feedback().state, 'syncing');
  const emit = detail => f.listeners['smena:sync-status']({ detail });
  emit({ status: 'saved', scope: 'workspace', sentData: { ws: { ...f.data.ws, name: 'Older save' } } });
  assert.equal(f.context.feedback().state, 'syncing');
  emit({ status: 'offline', scope: 'workspace' });
  assert.equal(f.context.feedback().state, 'offline');
  emit({ status: 'saved', scope: 'workspace', sentData: { ws: { ...f.data.ws } } });
  assert.equal(f.context.feedback().state, 'saved');
  f.context.saveSettings();
  assert.equal(f.writes(), 1, 'unchanged submit does not write again');
});
