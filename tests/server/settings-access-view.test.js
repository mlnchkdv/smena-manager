import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { canCreateWorkspace } from '../../src/shared/workspace-permissions.js';

function render(role, sec) {
  const source = readFileSync(new URL('../../src/pages/settings.js', import.meta.url), 'utf8');
  const context = {
    S: { ui: { currentUser: { role }, params: { sec } } },
    D: () => ({ ws: { name: 'Current team' } }),
    canCreateWorkspace,
    workspaceRoleLabel: value => value,
    tr: value => value,
    esc: value => value,
    ic: () => '',
    settingsBody: key => `body:${key}`,
  };
  vm.runInNewContext(
    source.slice(source.indexOf('export const SET_NAV'), source.indexOf('export function srow')).replace(/^export /gm, '') +
      source.slice(source.indexOf('export function pageSettings'), source.indexOf('export function settingsBody')).replace('export ', ''),
    context,
  );
  return context.pageSettings();
}

test('member and guest deep links explain current-workspace restrictions without rendering its controls', () => {
  for (const role of ['editor', 'viewer'])
    for (const sec of ['workspace', 'members', 'permissions', 'data-transfer']) {
      const html = render(role, sec);
      assert.match(html, /Administrator access required/);
      assert.match(html, /Current team/);
      assert.match(html, /data-pop="ws"/);
      assert.match(html, new RegExp(`value="${sec}" selected disabled`));
      assert.doesNotMatch(html, /body:/);
      assert.equal(html.includes('data-a="newWorkspace"'), role === 'editor');
    }
});
test('admin keeps shared settings; personal settings and invalid-route fallback remain available', () => {
  assert.match(render('admin', 'workspace'), /body:workspace/);
  assert.match(render('editor', 'appearance'), /body:appearance/);
  assert.match(render('viewer', 'unknown'), /body:appearance/);
});

test('permission reference reflects source restrictions and has no unsupported billing or deletion promise', () => {
  const source = readFileSync(new URL('../../src/pages/members.js', import.meta.url), 'utf8');
  const S = { ui: { activeWorkspace: 'default' } };
  const data = { ws: { permissions: { createProjects: false } } };
  const context = { S, D: () => data, ROLES: ['Owner', 'Admin', 'Member', 'Guest'], ic: () => '' };
  vm.runInNewContext(source.slice(source.indexOf('export function permsTable'), source.indexOf('export function teamsGrid')).replace('export ', ''), context);
  const cells = (html, label) =>
    html
      .split('<tr>')
      .find(row => row.includes(`>${label}</th>`))
      .match(/aria-label="(Allowed|Not allowed)"/g);
  let html = context.permsTable();
  assert.doesNotMatch(html, /Billing|Delete workspace/);
  assert.equal(cells(html, 'Comment on tasks').at(-1), 'aria-label="Not allowed"');
  assert.equal(cells(html, 'Create projects')[2], 'aria-label="Not allowed"');
  assert.equal(cells(html, 'Archive this workspace').filter(cell => cell === 'aria-label="Allowed"').length, 0);
  assert.equal(cells(html, 'Clear workspace content').filter(cell => cell === 'aria-label="Allowed"').length, 2);
  S.ui.activeWorkspace = 'owned';
  data.ws.permissions.createProjects = true;
  html = context.permsTable();
  assert.equal(cells(html, 'Create projects')[2], 'aria-label="Allowed"');
  assert.equal(cells(html, 'Archive this workspace').filter(cell => cell === 'aria-label="Allowed"').length, 2);
});
