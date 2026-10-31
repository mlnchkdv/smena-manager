import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { mergeWorkspaceSettings } from '../../src/shared/workspace-settings-draft.js';
import { workspaceSlug } from '../../src/shared/workspace-slug.js';
import { canCreateWorkspace } from '../../src/shared/workspace-permissions.js';
import { isActiveMember } from '../../src/shared/workspace-membership.js';
import { rememberWorkspaceSection, workspaceSectionDestination } from '../../src/shared/workspace-navigation.js';

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
  const storage = new Map();
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
    crypto: { randomUUID },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    openModal: modal => S.ui.modals.push(modal),
    closeModal: () => S.ui.modals.pop(),
    workspaceSyncIsClean: () => true,
    retryWorkspaceSync: async () => {},
    personalPreferenceSyncState: () => ({ pending: false }),
    flushLocalSave() {},
    $: selector => fields[selector],
    isRussian: () => russian,
    t: value => value,
    mergeWorkspaceSettings,
    workspaceSlug,
    canCreateWorkspace,
    isActiveMember,
    rememberWorkspaceSection,
    workspaceSectionDestination,
    workspaceRoleLabel: value => value,
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
  vm.runInNewContext(
    `${source}\nthis.saveSettings = saveWorkspaceSettings; this.feedback = workspaceSettingsFeedback; this.openCreation = openWorkspaceCreation;`,
    context,
  );
  return { context, data, S, fields, notices, listeners, storage, writes: () => writes };
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
  emit({ status: 'saved', scope: 'workspace', sentData: { ws: { ...f.data.ws, description: 'Independent queued update' } } });
  assert.equal(f.context.feedback().state, 'saved');
  f.context.saveSettings();
  assert.equal(f.writes(), 1, 'unchanged submit does not write again');
});

test('reviewing a conflicting draft preserves independent fields and detects another later edit', () => {
  const f = fixture();
  f.data.ws.name = 'Remote name';
  f.data.ws.description = 'Independent remote description';
  f.context.saveSettings();
  assert.equal(f.writes(), 0);
  f.context.A.keepWorkspaceSettingsDraft();
  f.data.ws.name = 'An even newer name';
  f.context.saveSettings();
  assert.equal(f.writes(), 0);
  f.context.A.keepWorkspaceSettingsDraft();
  f.context.saveSettings();
  assert.equal(f.writes(), 1);
  assert.equal(f.data.ws.name, 'My team');
  assert.equal(f.data.ws.description, 'Independent remote description');
});

test('cancel discards an unsubmitted creation draft while closing preserves an explicit recovery', () => {
  const f = fixture();
  f.S.ui.workspaceSettingsDirty = false;
  f.context.openCreation();
  f.context.IN.workspaceDraft({ dataset: { k: 'name' }, value: 'Draft' });
  f.context.closeModal();
  f.context.openCreation();
  assert.equal(f.S.ui.modals.at(-1).restored, true);
  assert.equal(f.S.ui.modals.at(-1).name, 'Draft');
  f.context.A.cancelWorkspaceCreation();
  assert.equal(f.storage.size, 0);
  f.context.openCreation();
  assert.equal(f.S.ui.modals.at(-1).name, '');
});

test('members can open creation but retain read-only settings in their source workspace', () => {
  for (const role of ['admin', 'editor', 'viewer']) {
    const f = fixture();
    f.S.ui.currentUser.role = role;
    f.S.ui.workspaceSettingsDirty = false;
    f.context.openCreation();
    assert.equal(f.S.ui.modals.length, role === 'viewer' ? 0 : 1);
    f.S.ui.workspaceSettingsDirty = true;
    f.context.saveSettings();
    assert.equal(f.writes(), role === 'admin' ? 1 : 0);
  }
});

test('uncertain creation keeps original payload and operation identity for recovery', async () => {
  const f = fixture();
  f.S.ui.workspaceSettingsDirty = false;
  f.context.openCreation();
  f.fields['#new-ws-name'] = { value: 'Team' };
  f.fields['#new-ws-description'] = { value: 'Original' };
  const calls = [];
  f.context.workspaceDirectoryRequest = async options => {
    calls.push(JSON.parse(options.body));
    throw new Error('Network timeout');
  };
  await f.context.A.submitWorkspace();
  assert.equal(f.S.ui.modals.at(-1).checking, false);
  const operationId = f.S.ui.modals.at(-1).operationId;
  f.context.A.restartWorkspaceCreation();
  f.context.IN.workspaceDraft({ dataset: { k: 'name' }, value: 'Changed' });
  assert.equal(f.S.ui.modals.at(-1).name, 'Team');
  f.context.A.cancelWorkspaceCreation();
  f.context.openCreation();
  f.fields['#new-ws-name'].value = 'Changed DOM';
  await f.context.A.submitWorkspace();
  assert.equal(f.S.ui.modals.at(-1).checking, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].operationId, operationId);
  assert.equal(calls[1].name, 'Team');
  assert.equal(calls[1].description, 'Original');
  assert.equal(f.S.ui.atomicOperation, false);
});

test('settings navigation stays consistent until the user explicitly discards or saves', async () => {
  const f = fixture();
  const destinations = [];
  f.context.go = (...args) => destinations.push(args);
  assert.equal(f.S.ui.beforeWorkspaceSettingsLeave('settings', { sec: 'language' }), false);
  assert.equal(f.S.ui.modals.at(-1).type, 'workspaceLeave');
  f.context.closeModal();
  assert.equal(f.S.ui.workspaceSettingsDirty, true);
  assert.equal(destinations.length, 0);
  f.S.ui.beforeWorkspaceSettingsLeave('settings', { sec: 'language' });
  f.context.A.discardWorkspaceSettingsLeave();
  assert.equal(f.S.ui.workspaceSettingsDirty, false);
  assert.equal(destinations[0][1].sec, 'language');

  const pending = fixture();
  let continued = false;
  pending.context.go = () => (continued = true);
  pending.context.retryWorkspaceSync = async () => {
    throw new Error('Offline');
  };
  pending.S.ui.beforeWorkspaceSettingsLeave('home', {});
  await pending.context.A.saveWorkspaceSettingsLeave();
  assert.equal(continued, false);
  assert.equal(pending.writes(), 1);
  assert.match(pending.S.ui.modals.at(-1).error, /retained locally/);
  pending.context.retryWorkspaceSync = async () => {};
  await pending.context.A.saveWorkspaceSettingsLeave();
  assert.equal(continued, true);
  assert.equal(pending.writes(), 1);
});
