/* ---------------- AUTH ---------------- */
import { esc } from '../core/utils.js';
import { LOGO, ic } from '../core/icons.js';
import { D, S } from '../core/store.js';
import { effectiveDark } from '../core/theme.js';
import { TEMPLATES } from '../overlays/modals.js';
import { render } from '../shell/render.js';
let legacyRender;
let legacyPromise;
import { templateText, t } from '../core/i18n.js';
import { PRODUCT_NAME, productHost } from '../shared/product.js';

export function authShell(inner, topRight = '') {
  return `<div class="auth"><div class="auth-top"><span class="brand">${LOGO(22)}</span><div class="row">${topRight}<button class="ibtn" data-a="toggleDark" data-tip="Toggle theme" aria-label="Toggle theme">${ic(effectiveDark() ? 'sun' : 'moon', 16)}</button></div></div>
    <div class="auth-c">${inner}</div>
    <div class="auth-foot" style="padding:18px;font-size:12px"><span class="faint">© 2026 ${PRODUCT_NAME} · <a href="/about.html">About</a> · <a href="/terms.html">Terms</a> · <a href="/privacy.html">Privacy</a></span></div></div>`;
}
export const ferr = k => (S.ui.errors[k] ? `<span class="err" id="${k}-err">${ic('circle-alert', 12)}${S.ui.errors[k]}</span>` : '');
export const icls = k => (S.ui.errors[k] ? 'is-error' : '');
export function renderAuth() {
  if (S.ui.auth === 'workspace-recovery') return authShell(S.ui.workspaceRecoveryHtml || '');
  const s = S.ui.auth;
  const e = S.ui.errors;
  if (s === 'onboarding') return renderOnboarding();
  if (s === 'restoring')
    return authShell(
      `<div class="auth-card auth-card-loading" role="status" aria-live="polite">
        <div style="display:flex;justify-content:center">${LOGO(30)}</div>
        <h1>${t('Restoring your session…')}</h1>
        <p class="sub">${t('Checking your secure workspace connection.')}</p>
        <div class="panel" style="padding:14px;display:flex;align-items:center;justify-content:center;gap:10px">
          <span class="sk" style="width:8px;height:8px;border-radius:50%;animation-duration:1.1s"></span>
          <span class="muted">${t('Connecting…')}</span>
        </div>
      </div>`,
    );
  if (s === 'login')
    return authShell(
      `<form class="auth-card${S.ui.fx.auth ? ' fx-auth' : ''}" data-submit="doLogin" novalidate>
    <div style="display:flex;justify-content:center">${LOGO(30)}</div><h1>Team access</h1><p class="sub">Sign in to ${esc(D().ws.name)}</p>
    <input class="sr" name="username" autocomplete="username" value="${esc(D().ws.url)}" tabindex="-1" aria-hidden="true">
    ${S.ui.authIssue ? `<div class="alert danger" role="alert">${ic('circle-alert', 15)}<span>${esc(S.ui.authIssue)}</span></div>` : ''}
    ${S.ui.authConfig?.configurationIssues?.length ? `<div class="alert info" role="status">${ic('info', 15)}<span>Deployment setup required: ${esc(S.ui.authConfig.configurationIssues.join(', '))}</span></div>` : ''}
    ${e.login ? `<div class="alert danger" role="alert">${ic('circle-alert', 15)}<span>${e.login}</span></div>` : ''}
    ${S.ui.authConfig?.googleAuthEnabled ? `<div class="google-signin-wrap${S.ui.authBusy ? ' is-busy' : ''}" aria-label="Sign in with Google" aria-busy="${S.ui.authBusy}"><div id="google-signin"></div></div>${S.ui.authConfig?.accessIdEnabled ? '<div class="or">or use Access ID</div>' : ''}` : ''}
    ${
      S.ui.authConfig?.accessIdEnabled !== false
        ? `<div class="field"><label class="label" for="l-access">Access ID</label>
      <div class="inwrap"><input class="input input-lg ${icls('access')}" id="l-access" type="${S.ui.showPw ? 'text' : 'password'}" autocomplete="current-password" style="padding-right:38px" aria-invalid="${!!e.access}" aria-describedby="access-hint access-err" autofocus><button type="button" class="ibtn ibtn-sm" style="position:absolute;right:5px" data-a="toggleShowPw" aria-label="${S.ui.showPw ? 'Hide' : 'Show'} Access ID">${ic(S.ui.showPw ? 'eye-off' : 'eye', 15)}</button></div>${ferr('access')}<span class="hint" id="access-hint">Your administrator provides this key.</span></div>
    <button class="btn btn-primary btn-lg btn-block${S.ui.authBusy ? ' is-loading' : ''}" data-a="doLogin" id="login-btn" ${S.ui.authBusy ? 'disabled' : ''}>${S.ui.authBusy ? 'Connecting…' : 'Sign in'}</button>`
        : ''
    }
    </form>`,
    );
  if (legacyRender) return legacyRender();
  legacyPromise ||= import('./auth-secondary.js')
    .then(module => {
      legacyRender = module.renderSecondaryAuth;
      render();
    })
    .catch(() => {
      legacyRender = () => authShell('<div class="auth-card"><a href="/">Reload / Перезагрузить</a></div>');
      render();
    });
  return authShell(`<div class="auth-card" role="status">${t('Loading…')}</div>`);
}

/* ---------------- ONBOARDING ---------------- */
export function renderOnboarding() {
  const st = S.ui.onb;
  const o = S.ui.onbData;
  const N = 6;
  const nav = (next = 'Continue', skip = false) =>
    `<div class="row" style="margin-top:6px">${st > 0 && st < 5 ? `<button class="btn btn-ghost" data-a="onbBack">${ic('arrow-left', 14)}Back</button>` : ''}<span class="sp"></span>${skip ? `<button class="btn btn-ghost" data-a="onbNext" data-skip="1">Skip for now</button>` : ''}<button class="btn btn-primary btn-lg" data-a="onbNext" id="onb-next">${next}${ic('arrow-right', 15)}</button></div>`;
  const opt = (k, v, icon, n, s) =>
    `<button class="opt ${o[k] === v ? 'on' : ''}" role="radio" aria-checked="${o[k] === v}" data-a="onbSet" data-k="${k}" data-v="${v}">${ic(icon, 18)}<b>${n}</b>${s ? `<span>${s}</span>` : ''}</button>`;
  let body;
  if (st === 0)
    body = `<h1>What are you working on?</h1><p class="sub">We'll tailor templates and views to fit. You can change this later.</p><div class="opts" role="radiogroup">${[
      ['product', 'target', 'Product', 'Roadmaps & launches'],
      ['design', 'palette', 'Design', 'Reviews & handoff'],
      ['marketing', 'megaphone', 'Marketing', 'Campaigns & content'],
      ['engineering', 'code', 'Engineering', 'Sprints & releases'],
      ['personal', 'user', 'Personal', 'Goals & side projects'],
      ['other', 'sparkles', 'Other', 'Something else'],
    ]
      .map(x => opt('use', ...x))
      .join('')}</div>${nav()}`;
  if (st === 1) {
    const e = S.ui.errors.ws;
    body = `<h1>Create your workspace</h1><p class="sub">A workspace is where your team's projects live.</p>
    <div class="field"><label class="label" for="o-ws">Workspace name</label><input class="input input-lg ${e ? 'is-error' : ''}" id="o-ws" data-in="onbWs" value="${esc(o.ws)}" placeholder="e.g. Smena Manager" autofocus>${e ? `<span class="err">${ic('circle-alert', 12)}${e}</span>` : ''}</div>
    <div class="field"><label class="label" for="o-url">Workspace URL</label><div class="row workspace-url" style="gap:0"><span class="input input-lg workspace-url-prefix">${productHost()}/</span><input class="input input-lg" id="o-url" value="${esc(o.url || '')}" data-in="onbUrl" placeholder="smena-manager"></div>${o.url ? `<span class="hint" style="color:var(--green);display:flex;gap:4px;align-items:center">${ic('check', 12)}${productHost()}/${esc(o.url)} is available</span>` : ''}</div>${nav()}`;
  }
  if (st === 2)
    body = `<h1>How does your team work?</h1><p class="sub">We'll set your default project view.</p><div class="opts" role="radiogroup" style="grid-template-columns:repeat(2,minmax(0,1fr))">${[
      ['kanban', 'square-kanban', 'Boards', 'Move cards through stages'],
      ['list', 'list-checks', 'Lists', 'Checklists and priorities'],
      ['timeline', 'chart-gantt', 'Timelines', 'Plan with dates & dependencies'],
      ['table', 'table-2', 'Tables', 'Spreadsheet-style tracking'],
    ]
      .map(x => opt('team', ...x))
      .join('')}</div>
    <div class="field"><span class="label">Team size</span><div class="seg" style="width:fit-content">${['Just me', '2-10', '11-50', '51-200', '200+'].map(s => `<button class="${o.size === s ? 'on' : ''}" data-a="onbSet" data-k="size" data-v="${s}">${s}</button>`).join('')}</div></div>${nav()}`;
  if (st === 3)
    body = `<h1>Create your first project</h1><p class="sub">Start from a template or a blank project.</p><div class="field"><label class="label" for="o-proj">Project name</label><input class="input input-lg" id="o-proj" data-in="onbProj" value="${esc(o.projTouched ? o.proj : templateText(o.proj))}" autofocus></div><div class="tmpls" role="radiogroup">${TEMPLATES.filter(
      t => t.id !== 'blank',
    )
      .map(t => opt('tmpl', t.id, t.icon, templateText(t.name), t.tasks.length + ' starter tasks'))
      .join('')}</div>${nav()}`;
  if (st === 4)
    body = `<h1>Add your team</h1><p class="sub">Enter team members' Google accounts. Access is added immediately, and you can send them the site link manually.</p><div class="col" style="gap:8px">${[0, 1, 2].map(i => `<input class="input input-lg" id="o-inv-${i}" placeholder="teammate@company.com" type="email" value="${esc((o.invites || '').split(',')[i] || '')}" data-in="onbInv" data-i="${i}" aria-label="Team member email ${i + 1}">`).join('')}</div>${nav('Add access', true)}`;
  if (st === 5) {
    const n = (o.invites || '').split(',').filter(x => x.includes('@')).length;
    body = `<div style="display:flex;justify-content:center"><span class="ftype ready-badge" style="--c:var(--green);width:48px;height:48px;border-radius:12px">${ic('circle-check', 22)}</span></div><h1>Your workspace is ready</h1><p class="sub">Here's what we set up for you.</p>
    <div class="panel">${[
      ['building-2', `Workspace “${esc(o.ws || 'My Workspace')}”`, productHost() + '/' + esc(o.url || 'workspace')],
      [
        TEMPLATES.find(t => t.id === o.tmpl)?.icon || 'folder',
        `Project “${esc(o.projTouched ? o.proj : templateText(o.proj))}”`,
        `${TEMPLATES.find(t => t.id === o.tmpl)?.tasks.length || 0} starter tasks · ${{ kanban: 'Board', list: 'List', timeline: 'Timeline', table: 'Table' }[o.team]} view`,
      ],
      [
        'user-plus',
        n ? `${n} invite${n > 1 ? 's' : ''} sent` : 'No invites yet',
        n ? "They'll appear in Members once they join" : 'Invite people any time from the sidebar',
      ],
    ]
      .map(
        ([i, t, s]) =>
          `<div class="row ready-row" style="padding:12px 14px;border-top:1px solid var(--divider);gap:12px"><span class="ftype" style="--c:var(--accent)">${ic(i, 14)}</span><div class="grow"><div style="font-weight:500">${t}</div><div class="faint" style="font-size:12px">${s}</div></div><span class="ok" style="color:var(--green);display:inline-flex">${ic('check', 15)}</span></div>`,
      )
      .join('')}</div>
    <button class="btn btn-primary btn-lg btn-block" data-a="onbFinish">Open workspace${ic('arrow-right', 15)}</button>`;
  }
  return authShell(
    `<div class="auth-card onb${S.ui.fx.step ? ' fx-step' : ''}" style="max-width:${st === 5 ? 440 : 560}px">
    <div class="steps" aria-label="Step ${st + 1} of ${N}">${Array.from({ length: N }, (_, i) => `<i class="${i <= st ? 'on' : ''} ${i === st ? 'cur' : ''}"></i>`).join('')}</div>
    <div class="faint" style="text-align:center;font-size:12px">Step ${st + 1} of ${N}</div>
    ${body}</div>`,
    `<button class="btn btn-ghost btn-sm" data-a="onbExit">Exit setup</button>`,
  );
}
