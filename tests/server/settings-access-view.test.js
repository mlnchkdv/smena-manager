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
