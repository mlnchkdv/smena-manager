// Read-only checks for an already authenticated Playwright CLI page.
import { memberForProfile } from '../src/shared/member-identity.js';
import { workspaceMemberRole } from '../src/shared/workspace-access.js';
import { canEditProject, canCommentProject } from '../src/shared/project-access.js';

const demand = {
  'X-Smena-File-Catalog': 'demand',
  'X-Smena-Knowledge': 'demand',
  'X-Smena-Whiteboards': 'demand',
};

export async function waitForContent(page, { timeout = 45000, quiet = 700 } = {}) {
  const active = new Set();
  let last = Date.now(),
    state = 'navigation';
  const start = request => {
    if (/\/api\/(files\/catalog|knowledge|graph|whiteboards|workspace)/.test(request.url())) {
      active.add(request);
      last = Date.now();
    }
  };
  const end = request => {
    if (active.delete(request)) last = Date.now();
  };
  page.on('request', start);
  page.on('requestfinished', end);
  page.on('requestfailed', end);
  try {
    const until = Date.now() + timeout;
    let stable = 0;
    while (Date.now() < until) {
      state = await page.evaluate(() => {
        if (document.querySelector('form[data-submit="doLogin"]')) return 'signed-out';
        if (!document.querySelector('#main-content')) return 'restoring-or-navigation';
        if (document.querySelector('.file-page-pending[role="alert"],.graph-pending[aria-busy="false"]')) return 'load-error';
        if (document.querySelector('.file-page-pending,.graph-pending,[aria-busy="true"]')) return 'loading';
        const files = document.querySelector('.files-page');
        if (files && !files.querySelector('.workspace-file-card,.workspace-file-table,.empty-state')) return 'loading';
        return 'ready';
      });
      if (state === 'signed-out') return { ready: false, state };
      if (state === 'load-error') return { ready: false, state };
      stable = state === 'ready' && !active.size && Date.now() - last >= quiet ? stable + 1 : 0;
      if (stable >= 3) return { ready: true, state };
      await page.waitForTimeout(150);
    }
    return { ready: false, state, timedOut: true };
  } finally {
    page.off('request', start);
    page.off('requestfinished', end);
    page.off('requestfailed', end);
  }
}

export async function inspectGeometry(page) {
  return page.evaluate(() => {
    const failures = [];
    const visible = e => !!e?.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
    const overflow = e => Math.max(0, e.scrollWidth - e.clientWidth);
    if (overflow(document.documentElement) > 1) failures.push({ kind: 'root-overflow' });
    const dialog = [...document.querySelectorAll('.modal,.drawer')].filter(visible).at(-1);
    const containers = dialog ? [dialog, ...dialog.querySelectorAll('.modal-b,.drawer-b')] : [];
    for (const [index, e] of containers.entries()) {
      if (visible(e) && overflow(e) > 1) failures.push({ kind: 'nested-overflow', index, pixels: overflow(e) });
    }
    if (dialog) {
      const box = dialog.getBoundingClientRect();
      if (box.top < -1 || box.bottom > innerHeight + 1) failures.push({ kind: 'dialog-outside-viewport' });
    }
    // A page-wide zero overflow can hide a dialog button clipped by its own body.
    const actions = [...(dialog?.querySelectorAll('.modal-f button,.drawer-h > button') || [])].filter(visible);
    for (const [index, e] of actions.entries()) {
      const box = e.getBoundingClientRect();
      const container = e.closest('.modal,.drawer');
      const cb = container?.getBoundingClientRect();
      if (box.left < Math.max(0, cb?.left || 0) - 1 || box.right > Math.min(innerWidth, cb?.right || innerWidth) + 1)
        failures.push({ kind: 'action-clipped', index });
      // Only test points inside the visible viewport; vertical scrolling is legitimate.
      const x = (box.left + box.right) / 2,
        y = (box.top + box.bottom) / 2;
      if (x >= 0 && x < innerWidth && y >= 0 && y < innerHeight && !e.disabled) {
        const top = document.elementFromPoint(x, y);
        if (top && !e.contains(top) && !top.contains(e)) failures.push({ kind: 'action-obstructed', index });
      }
    }
    return { passed: !failures.length, failures, actionCount: actions.length };
  });
}

export async function inspectTaskCapabilities(page) {
  const taskId = await page
    .locator('.drawer #d-title')
    .first()
    .getAttribute('data-id')
    .catch(() => null);
  if (!taskId) return { skipped: 'no-task-drawer' };
  const origin = new URL(page.url()).origin;
  const [auth, workspace] = await Promise.all([
    page.request.get(origin + '/api/auth/me', { timeout: 20000 }),
    page.request.get(origin + '/api/workspace', { headers: demand, timeout: 20000 }),
  ]);
  if (!auth.ok() || !workspace.ok()) return { passed: false, state: 'auth-or-workspace-unavailable' };
  const profile = (await auth.json()).user,
    data = (await workspace.json()).data;
  const member = memberForProfile(data, profile);
  if (!member || ['deactivated', 'removed'].includes(member.status)) return { passed: false, state: 'canonical-member-unavailable' };
  const task = data.tasks.find(t => t.id === taskId),
    project = data.projects.find(p => p.id === task?.project);
  // data.me is shared storage context, not proof of the authenticated identity.
  const role = workspaceMemberRole(member);
  const expected = { edit: canEditProject(project, member.id, role), comment: canCommentProject(project, member.id, role) };
  const actual = await page.locator('.drawer:has(#d-title)').evaluate(e => ({
    edit: !e.querySelector('#d-title').readOnly,
    description: e.querySelector('#d-desc')?.getAttribute('contenteditable') === 'true',
    properties: [...e.querySelectorAll('.task-properties button')].some(b => !b.disabled),
    comment: !!e.querySelector('#d-cmt'),
    upload: [...e.querySelectorAll('label:has(input[type=file])')].some(e => !!e.getClientRects().length),
  }));
  const failures = Object.keys(actual).filter(key => actual[key] !== (key === 'comment' ? expected.comment : expected.edit));
  return { passed: !failures.length, expected, actual, failures };
}

export async function acceptBrowserPage(page) {
  const ready = await waitForContent(page);
  if (!ready.ready) return { passed: false, readiness: ready };
  const geometry = await inspectGeometry(page);
  const capabilities = await inspectTaskCapabilities(page);
  return { passed: geometry.passed && capabilities.passed !== false, readiness: ready, geometry, capabilities };
}
