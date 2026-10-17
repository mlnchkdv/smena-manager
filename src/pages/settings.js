/* =====================================================================
   SETTINGS · AUTH · ONBOARDING · DESIGN SYSTEM · SYSTEM STATES
   ===================================================================== */
import { dOff, esc, fmtDate } from '../core/utils.js';
import { ic, wsLogo } from '../core/icons.js';
import { D, S, me, myNotificationPreferences } from '../core/store.js';
import { av, fsize, pIcon } from '../ui/helpers.js';
import { permsTable, teamsGrid } from './members.js';
import { page404 } from './errors.js';
import { SHORTCUTS } from '../overlays/modals.js';
import { LANGUAGES, locale, t as tr } from '../core/i18n.js';
import { PRODUCT_NAME, productHost } from '../shared/product.js';
import { browserNotificationState } from '../core/browser-notifications.js';

export const SET_NAV = [
  [
    'General',
    [
      ['workspace', 'Workspace', 'building-2'],
      ['appearance', 'Appearance', 'palette'],
      ['language', 'Language', 'languages'],
      ['datetime', 'Date & time', 'clock'],
      ['data-transfer', 'Data transfer', 'database-backup'],
    ],
  ],
  [
    'Workspace',
    [
      ['members', 'Members', 'users'],
      ['teams', 'Teams', 'users-round'],
      ['projects', 'Projects', 'folder-kanban'],
      ['permissions', 'Permissions', 'shield'],
    ],
  ],
  [
    'Notifications',
    [
      ['notif-mentions', 'Mentions', 'at-sign'],
      ['notif-assign', 'Task assignments', 'user-check'],
      ['notif-push', 'Browser notifications', 'monitor-smartphone'],
    ],
  ],
  [
    'Personal',
    [
      ['profile', 'Profile', 'user'],
      ['security', 'Account security', 'shield-check'],
      ['preferences', 'Preferences', 'sliders-horizontal'],
      ['shortcuts', 'Keyboard shortcuts', 'keyboard'],
    ],
  ],
];
const ADMIN_SETTINGS = new Set(['workspace', 'data-transfer', 'members', 'teams', 'permissions']);
export function srow(t, d, ctl) {
  return `<div class="srow"><div><div class="t">${t}</div>${d ? `<div class="d">${d}</div>` : ''}</div><div class="row">${ctl}</div></div>`;
}
export const tog = (k, on, src = 'pref') =>
  `<input type="checkbox" class="toggle" data-in="${src}Toggle" data-k="${k}" ${on ? 'checked' : ''} aria-label="${k}">`;
export const sel = (k, opts, v) =>
  `<select class="select" style="width:auto;min-width:180px" data-in="prefSel" data-k="${k}" aria-label="${k}">${opts
    .map(o => {
      const [val, n] = Array.isArray(o) ? o : [o, o];
      return `<option value="${val}" ${String(v) === String(val) ? 'selected' : ''}>${n}</option>`;
    })
    .join('')}</select>`;

function settingsTimestamp(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function backupDisplayLabel(value) {
  const label = String(value || 'Backup');
  const automaticPrefix = 'Automatic backup ';
  return label.startsWith(automaticPrefix) ? `${tr('Automatic backup')} ${label.slice(automaticPrefix.length)}` : label;
}

function deliveryStatusPanel() {
  if (S.ui.currentUser?.role !== 'admin') return '';
  const status = S.ui.notificationDeliveryStatus;
  if (!status) {
    return `<div class="sblock notification-delivery-card"><div class="row between"><div><h2>Delivery diagnostics</h2><p class="muted">Check server-side email and Web Push delivery.</p></div><button class="btn btn-secondary btn-sm" data-a="refreshNotificationDelivery">${ic('refresh-cw', 13)}Check status</button></div></div>`;
  }
  const emailReady = status.channels?.email?.configured && status.channels?.email?.authorized;
  const pushReady = status.channels?.push?.configured;
  const lastCron = status.delivery?.lastCron;
  const lastRun = status.delivery?.lastRun;
  const state = (ready, label) => `<span class="badge ${ready ? 'green' : 'amber'}"><span class="dot"></span>${label}</span>`;
  return `<div class="sblock notification-delivery-card">
    <div class="row between notification-delivery-head"><div><h2>Delivery diagnostics</h2><p class="muted">Server-side channel health and recent delivery results.</p></div><button class="btn btn-secondary btn-sm" data-a="refreshNotificationDelivery" ${S.ui.notificationDeliveryLoading ? 'disabled' : ''}>${ic('refresh-cw', 13)}${S.ui.notificationDeliveryLoading ? 'Checking…' : 'Refresh'}</button></div>
    <div class="notification-delivery-grid">
      <div><span class="label">Email</span>${state(emailReady, emailReady ? 'Connected' : 'Needs attention')}<p class="hint">Gmail API</p></div>
      <div><span class="label">Web Push</span>${state(pushReady, pushReady ? 'Configured' : 'Needs attention')}<p class="hint">${Number(status.channels?.push?.subscriptions || 0)} active devices</p></div>
      <div><span class="label">Last automatic run</span><b>${settingsTimestamp(lastCron?.at)}</b><p class="hint">${lastCron?.status === 'degraded' ? 'Completed with delivery errors' : lastCron ? 'Completed successfully' : 'No run recorded yet'}</p></div>
      <div><span class="label">Latest delivery</span><b>${settingsTimestamp(lastRun?.at)}</b><p class="hint">${Number(lastRun?.push?.delivered || 0)} push · ${Number(lastRun?.email?.delivered || 0)} email · ${Number(lastRun?.push?.failed || 0) + Number(lastRun?.email?.failed || 0)} failed</p></div>
    </div>
  </div>`;
}

function authSessionsPanel() {
  const sessions = S.ui.authSessions;
  const content = S.ui.authSessionsLoading
    ? `<div class="auth-sessions-state" role="status" aria-busy="true">${ic('loader', 16)}<span>Loading sessions…</span></div>`
    : S.ui.authSessionsError
      ? `<div class="alert warn auth-sessions-error" role="alert">${ic('triangle-alert', 16)}<span class="grow">${esc(S.ui.authSessionsError)}</span><button class="btn btn-secondary btn-sm" data-a="loadAuthSessions">Try again</button></div>`
      : Array.isArray(sessions) && sessions.length
        ? `<div class="auth-session-list">${sessions
            .map(
              session => `<div class="auth-session-row" data-current="${session.current ? 'true' : 'false'}">
                <span class="ftype auth-session-icon">${ic(session.mobile ? 'smartphone' : 'monitor', 18)}</span>
                <div class="auth-session-copy"><div class="auth-session-title"><b>${esc(session.device)}</b>${session.current ? '<span class="badge green">This device</span>' : ''}<span class="badge">${session.authMethod === 'google' ? 'Google' : session.authMethod === 'access_id' ? 'Access ID' : 'Existing session'}</span></div>
                <div class="auth-session-meta"><span>${ic('log-in', 13)}<span>Signed in</span> <time datetime="${esc(session.createdAt)}">${settingsTimestamp(session.createdAt)}</time></span><span>${ic('activity', 13)}${session.current ? '<span>Active now</span>' : `<span>Last active</span> <time datetime="${esc(session.lastSeenAt)}">${settingsTimestamp(session.lastSeenAt)}</time>`}</span></div></div>
                ${session.current ? '' : `<button class="btn btn-secondary btn-sm auth-session-signout" data-a="revokeAuthSession" data-id="${esc(session.id)}">${ic('log-out', 13)}Sign out</button>`}
              </div>`,
            )
            .join('')}</div>`
        : '<div class="auth-sessions-state"><span>No active sessions found.</span></div>';
  const otherCount = sessions?.filter(session => !session.current).length || 0;
  return `<div class="sblock auth-sessions-block"><div class="row between auth-sessions-head"><div><h2>Active sessions</h2><p class="muted">Devices currently signed in to your account.</p></div><button class="btn btn-secondary btn-sm" data-a="loadAuthSessions" ${S.ui.authSessionsLoading ? 'disabled' : ''}>${ic('refresh-cw', 13)}Refresh</button></div>${content}${otherCount ? `<div class="auth-sessions-actions"><button class="btn btn-danger-ghost btn-sm" data-a="revokeOtherAuthSessions">${ic('log-out', 13)}Sign out of all other sessions</button></div>` : ''}</div>`;
}
export function pageSettings() {
  const isAdmin = S.ui.currentUser?.role === 'admin';
  const navigation = SET_NAV.map(([group, items]) => [group, isAdmin ? items : items.filter(([key]) => !ADMIN_SETTINGS.has(key))]).filter(
    ([, items]) => items.length,
  );
  const requestedSection = S.ui.params.sec || S.ui.settings || 'appearance';
  const availableSections = new Set(navigation.flatMap(([, items]) => items.map(([key]) => key)));
  const sec = availableSections.has(requestedSection) ? requestedSection : 'appearance';
  const title = SET_NAV.flatMap(g => g[1]).find(x => x[0] === sec) || ['appearance', 'Appearance'];
  return `<div class="set">
    <nav class="set-nav" aria-label="Settings">${navigation.map(([g, items]) => `<div class="gh">${g}</div>${items.map(([k, n, i]) => `<button class="sitem ${sec === k ? 'on' : ''}" data-a="go" data-r="settings" data-sec="${k}">${ic(i, 15)}<span>${n}</span></button>`).join('')}`).join('')}</nav>
    <div class="set-body" data-keep="set:${sec}"><div class="set-in">${!isAdmin && ADMIN_SETTINGS.has(sec) ? `<div class="empty-state"><div class="glyph">${ic('lock', 20)}</div><h3 class="es-h">Administrator access required</h3><p>Only administrators can manage workspace settings, members, and billing.</p></div>` : settingsBody(sec, title[1])}</div></div>
  </div>`;
}
export function settingsBody(sec, title) {
  const P = S.prefs;
  const d = D();
  const np = myNotificationPreferences();
  const H = lead => `<h1>${title}</h1><p class="lead">${lead}</p>`;
  switch (sec) {
    case 'workspace':
      return (
        H('Your workspace name, address, and identity.') +
        `
      <form data-submit="saveWorkspace">
      <div class="sblock" style="margin-top:0"><div class="row" style="gap:14px;margin-bottom:18px">${wsLogo(d.ws, 52)}<div><div class="label" style="margin-bottom:6px">Workspace icon</div><div class="swatches">${['#2F2E2A', '#5A67D8', '#3B82C4', '#23918A', '#C54B78', '#C48A1E'].map(c => `<button type="button" class="sw ${d.ws.c === c ? 'on' : ''}" style="--c:${c};width:22px;height:22px" data-a="wsColor" data-v="${c}" aria-label="Color ${c}"></button>`).join('')}</div></div></div>
      <div class="col" style="gap:14px;max-width:440px"><div class="field"><label class="label" for="ws-name">Workspace name</label><input class="input" id="ws-name" value="${esc(d.ws.name)}"></div>
      <div class="field"><label class="label" for="ws-url">Workspace URL</label><div class="row workspace-url" style="gap:0"><span class="input workspace-url-prefix">${productHost()}/</span><input class="input" id="ws-url" value="${esc(d.ws.url)}"></div><span class="hint">Changing the URL will break existing links.</span></div>
      <div><button class="btn btn-primary" data-a="saveWorkspace" id="ws-save">Save changes</button></div></div></div></form>
      <div class="sblock"><h2 style="color:var(--red)">Danger zone</h2>${srow('Delete workspace', 'Permanently delete this workspace, its projects, tasks, and files. This cannot be undone.', `<button class="btn btn-danger-ghost" style="border:1px solid color-mix(in srgb,var(--red) 35%,transparent)" data-a="delWorkspace">Delete workspace</button>`)}</div>`
      );
    case 'appearance':
      return (
        H(`Customize how ${PRODUCT_NAME} looks on this device.`) +
        `
      <div class="sblock" style="margin-top:0"><h2>Theme</h2><div class="themecards" style="margin-top:12px" role="radiogroup" aria-label="Theme">${[
        ['light', 'Light'],
        ['dark', 'Dark'],
        ['system', 'System'],
      ]
        .map(([k, n]) => {
          const L = { bg: '#FBFAF8', s: '#F2F1EE', t: '#1D1C1A', b: '#E3E1DC', a: '#4B5BD6' },
            Dk = { bg: '#1D1D1C', s: '#151514', t: '#ECEAE5', b: '#333230', a: '#8E9AF3' };
          const pv = c =>
            `<div class="s" style="background:${c.s}"><i style="background:${c.b};width:70%"></i><i style="background:${c.a};width:55%"></i><i style="background:${c.b};width:80%"></i><i style="background:${c.b};width:60%"></i></div><div class="m" style="background:${c.bg}"><i style="background:${c.t};width:45%;height:7px"></i><i style="background:${c.b}"></i><i style="background:${c.b};width:80%"></i><i style="background:${c.a};width:30%;height:10px;margin-top:4px"></i></div>`;
          return `<button class="tcard ${P.theme === k ? 'on' : ''}" role="radio" aria-checked="${P.theme === k}" data-a="setTheme" data-v="${k}"><div class="tprev" style="${k === 'system' ? 'grid-template-columns:1fr 1fr;display:grid' : ''}">${k === 'system' ? `<div style="display:grid;grid-template-columns:30% 1fr">${pv(L)}</div><div style="display:grid;grid-template-columns:30% 1fr">${pv(Dk)}</div>` : pv(k === 'light' ? L : Dk)}</div><span class="row" style="font-weight:500;font-size:13px;gap:6px">${ic(k === 'light' ? 'sun' : k === 'dark' ? 'moon' : 'monitor', 14)}${n}${P.theme === k ? `<span class="sp"></span><span style="color:var(--accent)">${ic('circle-check', 15)}</span>` : ''}</span></button>`;
        })
        .join('')}</div></div>
      <div class="sblock"><h2>Accent color</h2>${srow(
        'Accent',
        'Used for primary buttons, focus rings, and selection.',
        `<div class="swatches" role="radiogroup" aria-label="Accent color">${[
          ['indigo', '#4B5BD6'],
          ['blue', '#2F6CD4'],
          ['violet', '#7348CC'],
          ['teal', '#1A7F7A'],
          ['rose', '#B93D68'],
          ['graphite', '#34332F'],
        ]
          .map(
            ([k, c]) =>
              `<button class="sw ${P.accent === k ? 'on' : ''}" style="--c:${c}" role="radio" aria-checked="${P.accent === k}" data-a="setPref" data-k="accent" data-v="${k}" aria-label="${k}" data-tip="${k[0].toUpperCase() + k.slice(1)}">${P.accent === k ? ic('check', 13) : ''}</button>`,
          )
          .join('')}</div>`,
      )}</div>
      <div class="sblock"><h2>Density</h2>
        ${srow('Sidebar density', 'Compact fits more projects on screen.', `<div class="seg">${['comfortable', 'compact'].map(k => `<button class="${P.side === k ? 'on' : ''}" data-a="setPref" data-k="side" data-v="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>`)}
        ${srow('Task display', 'Row height in lists and card padding on boards.', `<div class="seg">${['comfortable', 'compact'].map(k => `<button class="${P.density === k ? 'on' : ''}" data-a="setPref" data-k="density" data-v="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>`)}
        ${srow(
          'Motion',
          'Reduce animations for drawers, modals, and transitions.',
          sel(
            'motion',
            [
              ['system', 'Follow system'],
              ['reduce', 'Reduce motion'],
            ],
            P.motion,
          ),
        )}
      </div>`
      );
    case 'language':
      return (
        H('Language and regional formats.') +
        srow('Language', 'The language used throughout the interface.', sel('lang', LANGUAGES, P.lang)) +
        srow('Spellcheck', 'Check spelling in descriptions and comments.', tog('spell', P.spell !== false))
      );
    case 'datetime':
      return (
        H('How dates and times appear across the workspace.') +
        srow(
          'Time zone',
          'Used for due dates and reminders.',
          sel(
            'tz',
            [
              '(GMT-08:00) Pacific Time',
              '(GMT-05:00) Eastern Time',
              '(GMT+00:00) London',
              '(GMT+01:00) Berlin',
              '(GMT+04:00) Saratov',
              '(GMT+08:00) Singapore',
            ],
            P.tz,
          ),
        ) +
        srow(
          'Date format',
          `Preview: <b>${fmtDate(dOff(8))}</b>`,
          sel(
            'dateFmt',
            [
              ['MMM d', 'Oct 1'],
              ['d/M', '1/10'],
              ['M/d', '10/1'],
              ['yyyy-MM-dd', '2026-10-01'],
            ],
            P.dateFmt,
          ),
        ) +
        srow(
          'Start week on',
          'Affects calendars and the timeline.',
          sel(
            'weekStart',
            [
              ['1', 'Monday'],
              ['0', 'Sunday'],
              ['6', 'Saturday'],
            ],
            P.weekStart,
          ),
        ) +
        srow(
          'Time format',
          '',
          sel(
            'timeFmt',
            [
              ['12', '12-hour (2:30 PM)'],
              ['24', '24-hour (14:30)'],
            ],
            P.timeFmt || '12',
          ),
        )
      );
    case 'data-transfer':
      return (
        H('Full workspace backups and KMS Brain data transfer.') +
        `<div class="sblock" style="margin-top:0"><div class="row" style="gap:8px;flex-wrap:wrap"><div class="grow"><h2 style="margin-bottom:4px">Backups</h2><p class="lead" style="font-size:13px;margin:0">A backup is created daily in Google Drive. The latest 30 automatic copies are retained; manual copies are kept until you restore or remove them.</p></div><button class="btn btn-secondary" data-a="loadWorkspaceBackups">${ic('refresh-cw', 14)}Refresh</button><button class="btn btn-primary" data-a="createWorkspaceBackup">${ic('database-backup', 14)}Create backup</button></div>
        ${S.ui.backupsLoading ? `<div class="muted" style="padding:18px 0">${ic('loader', 14)} Loading…</div>` : Array.isArray(S.ui.backups) ? (S.ui.backups.length ? `<div style="margin-top:14px">${S.ui.backups.map(backup => srow(esc(backupDisplayLabel(backup.label)), `${settingsTimestamp(backup.createdAt)} · ${fsize(backup.size || 0)}`, `<button class="btn btn-secondary btn-sm" data-a="restoreWorkspaceBackup" data-id="${esc(backup.id)}">${ic('history', 13)}Restore</button>`)).join('')}</div>` : '<p class="faint" style="padding:16px 0 0">No backups yet.</p>') : '<p class="faint" style="padding:16px 0 0">Select Refresh to show available backups.</p>'}
        </div>
        <div class="sblock"><h2>KMS Brain data transfer</h2><p class="lead" style="font-size:13px;margin-bottom:16px">The JSON file includes knowledge notes, folders, and bookmarks. Existing items are preserved and duplicates are skipped.</p>
        <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn btn-secondary" data-a="exportPortableWorkspace">${ic('download', 14)}Export JSON</button><label class="btn btn-primary" style="cursor:pointer">${ic('upload', 14)}Import JSON<input type="file" accept="application/json,.json" hidden data-in="importPortableWorkspace"></label></div>
        ${S.ui.migrationStatus ? `<div class="callout info" role="status" style="margin-top:16px">${ic('info', 15)}<span>${esc(S.ui.migrationStatus)}</span></div>` : ''}
        </div>
        <div class="sblock"><h2>Included data</h2>
          ${srow('Knowledge base', `${d.knowledgeNotes?.length || 0} notes · ${d.knowledgeFolders?.length || 0} folders`, `<span class="badge">${ic('library-big', 12)}KMS compatible</span>`)}
          ${srow('Bookmarks', `${d.links?.length || 0} bookmarks · ${d.linkFolders?.length || 0} folders`, `<span class="badge">${ic('bookmark', 12)}KMS compatible</span>`)}
        </div>`
      );
    case 'members':
      return (
        H(`${d.members.length} people have access to ${esc(d.ws.name)}.`) +
        `<div class="row" style="margin-bottom:12px"><button class="btn btn-primary" data-a="invite">${ic('user-plus', 14)}Add access</button><button class="btn btn-secondary" data-a="go" data-r="members">Open member directory</button></div>
      <div class="panel" style="overflow:hidden">${d.members.map(m => `<div class="mini" style="min-height:52px;cursor:default" data-ctx="member" data-id="${m.id}">${av(m.id, 'md', false)}<div class="grow"><div style="font-weight:500">${esc(m.name)}</div><div class="faint" style="font-size:12px">${esc(m.email)}</div></div>${m.status === 'invited' ? '<span class="badge amber">Invited</span>' : ''}${m.role === 'Owner' ? `<span class="pillbtn">${ic('crown', 13)}Owner</span>` : `<button class="pillbtn bordered" data-a="pop" data-pop="role" data-id="${m.id}">${m.role}${ic('chevron-down', 12)}</button>`}<button class="ibtn ibtn-sm" data-a="ctxBtn" data-ctx="member" data-id="${m.id}" aria-label="Options">${ic('ellipsis', 14)}</button></div>`).join('')}</div>`
      );
    case 'teams':
      return H('Teams group people and projects.') + teamsGrid();
    case 'projects': {
      const arch = d.projects.filter(p => p.archived);
      return (
        H('Defaults for new projects and archived work.') +
        srow(
          'Default project view',
          'The tab that opens when you open a project.',
          sel(
            'defaultTab',
            [
              ['board', 'Board'],
              ['list', 'List'],
              ['table', 'Table'],
              ['overview', 'Overview'],
              ['timeline', 'Timeline'],
            ],
            P.defaultTab || 'board',
          ),
        ) +
        srow('Show completed tasks on boards', '', tog('showDoneBoard', P.showDoneBoard !== false)) +
        `<div class="sblock"><h2>Archived projects</h2>${arch.length ? arch.map(p => `<div class="srow"><div class="row">${pIcon(p, '', 14)}<b style="font-weight:500">${esc(p.name)}</b></div><div class="row"><button class="btn btn-secondary btn-sm" data-a="restoreProject" data-id="${p.id}">Restore</button><button class="btn btn-danger-ghost btn-sm" data-a="delProject" data-id="${p.id}">Delete</button></div></div>`).join('') : `<p class="faint" style="padding:12px 0">No archived projects. Archived projects are hidden from the sidebar but keep all their tasks.</p>`}<div style="margin-top:12px"><button class="btn btn-secondary btn-sm" data-a="go" data-r="archive">${ic('archive', 13)}Open archive</button></div></div>`
      );
    }
    case 'permissions':
      return (
        H('Control what each role can do.') +
        srow('Members can create projects', '', tog('permCreate', P.permCreate !== false)) +
        srow('Members can invite guests', 'Guests only see projects they are added to.', tog('permGuests', P.permGuests !== false)) +
        srow('Allow public share links', 'Anyone with the link can view a project.', tog('permPublic', !!P.permPublic)) +
        `<div class="sblock"><h2>Role permissions</h2><div style="margin-top:12px">${permsTable()}</div></div>`
      );
    case 'notif-email':
      return (
        H('Choose which emails you receive.') +
        srow('Mentions', 'When someone @mentions you.', tog('email_mention', np.email_mention, 'np')) +
        srow('Assignments', 'When a task is assigned to you.', tog('email_assign', np.email_assign, 'np')) +
        srow('Comments', 'On tasks you created or are assigned.', tog('email_comment', np.email_comment, 'np')) +
        srow('Due date reminders', 'One day before a task is due and when it becomes overdue.', tog('email_due', np.email_due, 'np')) +
        srow('Security alerts', 'When a new device signs in to your account.', tog('email_security', np.email_security !== false, 'np')) +
        srow('Daily digest', 'A summary of what changed, every weekday at 8:00.', tog('email_digest', np.email_digest, 'np'))
      );
    case 'notif-push': {
      const permission = browserNotificationState();
      const pushState = permission === 'granted' ? S.ui.pushState : permission;
      const state = {
        ready: ['Browser notifications are connected to this device.', 'ok'],
        idle: ['Browser notifications are allowed. Turn on the types you need below.', 'info'],
        checking: ['Checking the browser notification connection…', 'info'],
        unavailable: ['Background notifications are not configured on the server yet.', 'danger'],
        error: ['The browser notification connection needs attention.', 'danger'],
        granted: ['Browser notifications are allowed. Reconnect this device to finish setup.', 'info'],
        denied: ['Browser notifications are blocked. Allow them in your browser site settings.', 'danger'],
        default: ['Turn on a notification type below to allow browser alerts.', 'info'],
        unsupported: ['This browser does not support system notifications.', 'danger'],
      }[pushState] || ['The browser notification status is unavailable.', 'danger'];
      const retry = ['error', 'granted'].includes(pushState)
        ? `<button class="btn btn-secondary btn-sm" data-a="retryPush">${ic('refresh-cw', 13)}Reconnect</button>`
        : '';
      return (
        H(`Receive system alerts even when ${PRODUCT_NAME} is closed.`) +
        `<div class="alert ${state[1]}" style="margin-bottom:14px">${ic(pushState === 'ready' ? 'circle-check' : ['default', 'idle', 'checking'].includes(pushState) ? 'bell-ring' : 'circle-alert', 16)}<span class="grow">${state[0]}</span>${retry}</div>` +
        srow('Mentions', '', tog('push_mention', np.push_mention, 'np')) +
        srow('Assignments', '', tog('push_assign', np.push_assign, 'np')) +
        srow('Comments', '', tog('push_comment', np.push_comment, 'np')) +
        srow('Due date reminders', 'One day before a task is due and when it becomes overdue.', tog('push_due', np.push_due, 'np')) +
        srow('Security alerts', 'When a new device signs in to your account.', tog('push_security', np.push_security !== false, 'np')) +
        deliveryStatusPanel()
      );
    }
    case 'notif-mentions':
      return (
        H('Decide which mentions reach you.') +
        srow('@mentions in comments and descriptions', '', tog('mention_all', np.mention_all, 'np')) +
        srow('@team mentions', 'When your team is mentioned, e.g. @Product.', tog('mention_team', np.mention_team !== false, 'np')) +
        srow('@workspace mentions', 'Announcements to everyone.', tog('mention_ws', !!np.mention_ws, 'np'))
      );
    case 'notif-assign':
      return (
        H('Updates about tasks assigned to you.') +
        srow("When I'm assigned a task", '', tog('assign_self', np.assign_self, 'np')) +
        srow('When my task changes status', '', tog('assign_status', np.assign_status !== false, 'np')) +
        srow('When someone comments on my task', '', tog('comment_assigned', np.comment_assigned !== false, 'np')) +
        srow('When my task is overdue', '', tog('assign_over', np.assign_over !== false, 'np'))
      );
    case 'profile': {
      const err = S.ui.errors.pname2;
      return (
        H('How you appear to others in the workspace.') +
        `<form data-submit="saveProfile" class="col" style="gap:16px;max-width:440px">
      <div class="row" style="gap:14px">${av(d.me, 'xl', false)}<div><div class="label" style="margin-bottom:6px">Avatar color</div><div class="swatches">${['#5A67D8', '#C54B78', '#3B82C4', '#23918A', '#C48A1E', '#8662C9'].map(c => `<button type="button" class="sw ${me().c === c ? 'on' : ''}" style="--c:${c};width:22px;height:22px" data-a="avColor" data-v="${c}" aria-label="Color"></button>`).join('')}</div></div></div>
      <div class="field"><label class="label" for="pf-name">Full name</label><input class="input ${err ? 'is-error' : ''}" id="pf-name" value="${esc(P.name)}">${err ? `<span class="err">${ic('circle-alert', 12)}${err}</span>` : ''}</div>
      <div class="field"><label class="label" for="pf-title">Title</label><input class="input" id="pf-title" value="${esc(P.title)}"></div>
      <div class="field"><label class="label" for="pf-email">Email</label><input class="input" id="pf-email" value="${esc(me().email)}" disabled><span class="hint">Contact a workspace owner to change your sign-in email.</span></div>
      <div><button class="btn btn-primary" data-a="saveProfile" id="pf-save">Save profile</button></div></form>`
      );
    }
    case 'preferences':
      return (
        H('Personal defaults for how you work.') +
        srow(
          'Open on launch',
          `The page you see when ${PRODUCT_NAME} opens.`,
          sel(
            'home',
            [
              ['home', 'Home'],
              ['mytasks', 'My Tasks'],
              ['inbox', 'Inbox'],
            ],
            P.home,
          ),
        ) +
        srow(
          'Open tasks in',
          'Side panel keeps your place in the list.',
          sel(
            'openTasks',
            [
              ['drawer', 'Side panel'],
              ['full', 'Full page'],
            ],
            P.openTasks,
          ),
        ) +
        srow('Confirm before deleting tasks', '', tog('confirmDel', P.confirmDel !== false))
      );
    case 'shortcuts':
      return (
        H('Move faster with the keyboard.') +
        SHORTCUTS.map(
          ([g, list]) =>
            `<div class="sblock" style="margin-top:18px"><h2>${g}</h2>${list.map(([n, k]) => `<div class="srow" style="padding:9px 0"><span>${n}</span><span class="row" style="gap:4px">${k.map((x, i) => `${i && k[0] === 'G' ? '<span class="faint" style="font-size:11px">then</span>' : ''}<kbd>${x}</kbd>`).join('')}</span></div>`).join('')}</div>`,
        ).join('')
      );
    case 'security':
      return (
        H('Sign-in security is managed by your Google Account.') +
        `<div class="panel account-security-card"><span class="ftype account-security-icon">${ic('shield-check', 20)}</span><div class="grow"><h2>Google Account security</h2><p class="muted">Change your password, configure two-step verification, and review signed-in devices in Google Account settings.</p><div class="account-security-email">${ic('mail', 14)}<span>${esc(me()?.email || '')}</span></div><a class="btn btn-primary account-security-action" href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer">Open Google security${ic('external-link', 14)}</a></div></div><p class="hint account-security-hint">Smena Manager never stores your Google password or recovery codes.</p>${authSessionsPanel()}`
      );
  }
  return page404();
}
