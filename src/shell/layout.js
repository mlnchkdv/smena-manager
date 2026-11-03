import { shortcut } from '../ui/shortcut.js';
import { isFavorite } from '../core/favorites.js';
/* ---------- shell ---------- */
import { MOD, TODAY, diffD, esc, fmtTimestamp, parse } from '../core/utils.js';
import { ic, wsLogo } from '../core/icons.js';
import { PSTAT } from '../core/constants.js';
import { D, S, allTasks, canSee, mem, myNotifications, pColor, proj, systemConnectionState, team, teamsList, visibleProjects } from '../core/store.js';
import { av, projectIconContent } from '../ui/helpers.js';
import { ROUTE_NAMES } from './render.js';
import { skeleton } from './skeletons.js';
import { page404, stateFailed } from '../pages/errors.js';
import { t as tr, workspaceDraftLabel } from '../core/i18n.js';
import { fileCatalogInfo } from '../core/file-catalog-state.js';
import { canManageTeams } from '../shared/workspace-permissions.js';
import { appLocationPath } from '../shared/app-location.js';
import { SIDEBAR_ITEMS, sidebarPreferences } from '../shared/sidebar-preferences.js';
import { SYNC_PRESENTATION } from '../shared/sync-presentation.js';

const lazyPages = new Map();
const lazyPagePromises = new Map();
const lazyPageLoaders = {
  home: () => import('../pages/home.js').then(module => module.pageHome),
  inbox: () => import('../pages/inbox.js').then(module => module.pageInbox),
  mytasks: () => import('../pages/my-tasks.js').then(module => module.pageMyTasks),
  favorites: () => import('../pages/favorites.js').then(module => module.pageFavorites),
  notifications: () => import('../pages/notifications.js').then(module => module.pageNotifications),
  search: () => import('../pages/search.js').then(module => module.pageSearch),
  overview: () => import('../pages/overview.js').then(module => module.pageOverview),
  projects: () => import('../pages/projects.js').then(module => module.pageProjects),
  files: () => import('../pages/files.js').then(module => module.pageFiles),
  project: () => import('../pages/project.js').then(module => module.pageProject),
  tasks: () => import('../pages/tasks.js').then(module => module.pageTasks),
  calendar: () => import('../views/calendar.js').then(module => module.pageWsCalendar),
  timeline: () => import('../views/timeline.js').then(module => module.pageWsTimeline),
  knowledge: () => import('../pages/knowledge.js').then(module => module.pageKnowledge),
  bookmarks: () => import('../pages/bookmarks.js').then(module => module.pageBookmarks),
  whiteboards: () => import('../pages/whiteboards.js').then(module => module.pageWhiteboards),
  whiteboard: () => import('../pages/whiteboards.js').then(module => module.pageWhiteboard),
  graph: () => import('../pages/graph.js').then(module => module.pageGraph),
  settings: () => import('../pages/settings.js').then(module => module.pageSettings),
  system: () => import('../pages/design-system.js').then(module => module.pageSystem),
  states: () => import('../pages/design-system.js').then(module => module.pageStates),
  members: () => import('../pages/members.js').then(module => module.pageMembers),
  member: () => import('../pages/members.js').then(module => module.pageMember),
  teams: () => import('../pages/members.js').then(module => module.pageTeams),
  team: () => import('../pages/members.js').then(module => module.pageTeam),
  activity: () => import('../pages/activity.js').then(module => module.pageActivity),
  archive: () => import('../features/archive.js').then(module => module.pageArchive),
};

function accountMenuLabel() {
  return `${S.prefs.name}. ${tr('Account menu')}. ${S.ui.workspaceSettingsDirty && systemConnectionState() === 'saved' ? workspaceDraftLabel() : tr(SYNC_PRESENTATION[systemConnectionState()][1])}`;
}

function accountAvatarStatus(memberId, size = '') {
  const state = systemConnectionState();
  return `<span class="account-avatar-status ${size === 'md' ? 'account-avatar-status-md' : ''}" data-state="${state}" aria-hidden="true">${av(memberId, size, false)}<span class="account-connection-badge"></span></span>`;
}

function lazyPage(route) {
  if (lazyPages.has(route)) {
    if (lazyPages.get(route) === stateFailed && S.ui.deploymentChanged)
      return '<div class="fullstate"><div class="box"><h1>A new app version is available.</h1><p>Use the update panel to load this section safely.</p><button class="btn btn-primary" data-a="reviewAppUpdate">Review app update</button></div></div>';
    return lazyPages.get(route)();
  }
  if (!lazyPagePromises.has(route)) {
    const promise = lazyPageLoaders[route]()
      .then(page => {
        lazyPages.set(route, page);
        window.dispatchEvent(new CustomEvent('smena:page-module-ready', { detail: { route } }));
      })
      .catch(error => {
        console.error(`[Pages] Unable to load ${route}:`, error);
        lazyPages.set(route, stateFailed);
        window.dispatchEvent(new CustomEvent('smena:page-module-ready', { detail: { route } }));
      });
    lazyPagePromises.set(route, promise);
  }
  return skeleton();
}

export function renderShell() {
  const u = S.ui;
  const role = u.currentUser?.role || 'viewer';
  return `<button class="skip" data-a="skipToContent">Skip to content</button><div class="shell role-${role} ${u.collapsed ? 'collapsed' : ''} ${u.mnav ? 'mnav' : ''} ${u.fx.tabs ? 'fx-tabs' : ''}">
    ${renderSidebar()}
    ${u.mnav ? '<div class="side-scrim" data-a="closeMnav"></div>' : ''}
    <main class="main" id="main">
      ${renderTopbar()}
      ${['offline', 'unavailable', 'invalid'].includes(u.personalSyncState) ? `<div class="offline-bar" role="alert">${ic('settings', 15)}<span>Personal settings are waiting to sync.</span><span class="sp"></span><button class="btn btn-sm btn-secondary" data-a="retryPersonalSettings">Try again</button><button class="btn btn-sm btn-secondary" data-a="downloadUnsyncedCopy">Download unsynced copy</button></div>` : ''}
      ${u.offline ? `<div class="offline-bar" role="alert">${ic('wifi-off', 15)}<span><b>You're offline.</b> ${u.recoveryUnavailable ? 'Changes are kept in this tab. Download a copy before closing.' : 'Changes are saved locally and will sync when your connection is back.'}</span><span class="sp"></span><button class="btn btn-sm btn-secondary" data-a="retryOnline">Try again</button></div>` : ''}
      ${u.recoveryUnavailable && (u.offline || u.syncUnavailable || u.syncTooLarge || u.syncInvalid || u.syncConflict) ? `<div class="offline-bar size-limit-bar" role="alert">${ic('triangle-alert', 15)}<span>Local recovery storage is unavailable. Keep this tab open until changes are saved.</span><span class="sp"></span><button class="btn btn-sm btn-secondary" data-a="downloadUnsyncedCopy">Download unsynced copy</button></div>` : ''}
      ${u.syncUnavailable ? `<div class="offline-bar size-limit-bar" role="alert">${ic('cloud-alert', 15)}<span><b>Sync is temporarily unavailable.</b> Changes are queued and will retry automatically.</span><span class="sp"></span><button class="btn btn-sm btn-secondary" data-a="retryOnline">Try again</button></div>` : ''}
      ${u.syncTooLarge ? `<div class="offline-bar size-limit-bar" role="alert">${ic('database-zap', 15)}<span><b>Workspace sync limit reached.</b> Reduce the affected data below 4 MB or download a copy before changing it.</span><span class="sp"></span><button class="btn btn-sm btn-secondary" data-a="downloadUnsyncedCopy">Download unsynced copy</button></div>` : ''}
      ${u.syncInvalid ? `<div class="offline-bar size-limit-bar" role="alert">${ic('triangle-alert', 15)}<span><b>Changes were not synced.</b> The workspace data has an invalid structure.</span><span class="sp"></span><button class="btn btn-sm btn-secondary" data-a="reload">Reload saved version</button></div>` : ''}
      ${u.syncConflict ? `<div class="offline-bar size-limit-bar" role="alert">${ic('git-merge', 15)}<span><b>Workspace synchronization conflict.</b> The local version is saved in this browser. You can load the latest server version.</span><span class="sp"></span><button class="btn btn-sm btn-secondary" data-a="reviewSyncConflict">Review conflict</button></div>` : ''}
      ${role === 'viewer' ? `<div class="offline-bar readonly-bar" role="status">${ic('eye', 15)}<span><b>View-only access.</b> Ask an administrator for editing permissions.</span></div>` : ''}
      <div class="content ${u.fx.route ? 'fx-route' : ''}" id="main-content" tabindex="-1" data-keep="c:${u.route}:${u.params.id || ''}:${u.params.tab || ''}:${u.params.sec || ''}">${u.loading ? skeleton() : renderPage()}</div>
    </main>
    ${renderBottomNav()}
  </div>`;
}
export function renderPage() {
  const r = S.ui.route;
  try {
    const P = {
      inbox: () => lazyPage('inbox'),
      mytasks: () => lazyPage('mytasks'),
      favorites: () => lazyPage('favorites'),
      notifications: () => lazyPage('notifications'),
      search: () => lazyPage('search'),
      overview: () => lazyPage('overview'),
      projects: () => lazyPage('projects'),
      files: () => lazyPage('files'),
      project: () => lazyPage('project'),
      tasks: () => lazyPage('tasks'),
      calendar: () => lazyPage('calendar'),
      timeline: () => lazyPage('timeline'),
      members: () => lazyPage('members'),
      member: () => lazyPage('member'),
      teams: () => lazyPage('teams'),
      team: () => lazyPage('team'),
      activity: () => lazyPage('activity'),
      knowledge: () => lazyPage('knowledge'),
      bookmarks: () => lazyPage('bookmarks'),
      whiteboards: () => lazyPage('whiteboards'),
      whiteboard: () => lazyPage('whiteboard'),
      graph: () => lazyPage('graph'),
      settings: () => lazyPage('settings'),
      system: () => lazyPage('system'),
      states: () => lazyPage('states'),
      archive: () => lazyPage('archive'),
    };
    return (P[r] || page404)();
  } catch (e) {
    console.error(e);
    return stateFailed();
  }
}

export function sItem(route, label, icon, opt = {}) {
  const on = (S.ui.route === route || (route === 'whiteboards' && S.ui.route === 'whiteboard')) && (!opt.id || S.ui.params.id === opt.id);
  return `<button class="sitem ${on ? 'on' : ''}" ${opt.userText ? 'translate="no"' : ''} data-a="${opt.act || 'go'}" data-r="${route}" ${opt.id ? `data-id="${opt.id}"` : ''} ${S.ui.collapsed ? `data-tip="${esc(label)}" data-tip-pos="right"` : ''} ${on ? 'aria-current="page"' : ''}>${ic(icon, 16)}<span class="trunc">${esc(label)}</span>${opt.ct ? `<span class="ct ${opt.dot ? 'dotc' : ''}">${opt.ct}</span>` : ''}${opt.kbd ? `<span class="ct hide-m"><kbd>${opt.kbd}</kbd></span>` : ''}</button>`;
}
export function renderSidebar() {
  const u = S.ui,
    d = D();
  const menu = sidebarPreferences(S.prefs.sidebar);
  const notifications = myNotifications();
  const unreadInbox = notifications.filter(n => !n.read && n.type !== 'update').length;
  const unreadAll = notifications.filter(n => !n.read).length;
  const myOpen = allTasks().filter(t => t.assignee === d.me && t.status !== 'done' && t.due && diffD(parse(t.due), TODAY) <= 0).length;
  const fileProjectIds = new Set(
    visibleProjects()
      .filter(canSee)
      .map(project => project.id),
  );
  const fileCount = fileCatalogInfo()?.total ?? (d.files || []).filter(file => fileProjectIds.has(file.project)).length;
  const projs = menu.projects ? visibleProjects().filter(p => p.status !== 'complete') : [];
  const counts = {
    inbox: unreadInbox,
    mytasks: myOpen,
    notifications: unreadAll,
    files: fileCount,
    knowledge: d.knowledgeNotes?.length,
    bookmarks: d.links?.filter(link => !link.is_archived).length,
    whiteboards: d.whiteboards?.filter(board => !board.archived).length,
  };
  const items = group =>
    menu.order
      .filter(id => !menu.hidden.includes(id))
      .map(id => SIDEBAR_ITEMS.find(item => item[0] === id))
      .filter(item => item?.[3] === group)
      .map(([id, label, icon]) => sItem(id, label, icon, { ct: menu.counts ? counts[id] || '' : '', dot: id === 'inbox' }))
      .join('');
  const workspaceItems = items('workspace');
  const inProj = u.route === 'project' ? u.params.id : null;
  return `<nav class="side" aria-label="Main">
    <div class="side-top">
      <div class="row" style="gap:2px">
        <button class="ws grow" data-a="pop" data-pop="ws" aria-haspopup="menu" title="${esc(tr('Switch workspace'))}">
          ${wsLogo(d.ws, 22)}
          <span class="ws-name trunc" translate="no">${esc(d.ws.name)}</span>
          <span class="chev-d faint">${ic('chevrons-up-down', 13)}</span>
        </button>
        ${u.collapsed ? '' : `<button class="ibtn ibtn-sm hide-m" data-a="toggleSide" data-tip="Collapse sidebar  [" aria-label="Collapse sidebar">${ic('panel-left', 15)}</button>`}
        <button class="ibtn mobile-nav-close" data-a="closeMnav" aria-label="Close navigation">${ic('x', 18)}</button>
      </div>
    </div>
    <div class="side-scroll" data-keep="side">
      ${u.collapsed ? `<button class="sitem" data-a="toggleSide" data-tip="Expand sidebar" data-tip-pos="right" aria-label="Expand sidebar">${ic('panel-left', 16)}</button>` : ''}
      ${items('personal')}
      ${workspaceItems ? `<div class="sgroup"><div class="sgroup-h"><span>Workspace</span><span class="sp"></span><button class="ibtn ibtn-xs" data-a="customizeSidebar" aria-label="Customize menu" title="Customize menu">${ic('sliders-horizontal', 12)}</button></div>${workspaceItems}</div>` : ''}
      <div class="sgroup" id="side-projects">
        ${menu.projects ? `<div class="sgroup-h"><span>Projects</span><span class="sp"></span><button class="ibtn ibtn-xs" data-a="newProject" data-tip="New project  P" aria-label="New project">${ic('plus', 14)}</button></div>` : ''}
        ${projs
          .map(p => {
            const open = !!u.expanded[p.id];
            const on = inProj === p.id;
            const compact = u.collapsed && innerWidth > 900;
            return `<div class="sproj" data-proj-drop="${p.id}">
            <div class="sitem sproject-row ${on ? 'on' : ''}" draggable="true" data-drag-proj="${p.id}" data-ctx="project" data-id="${p.id}">
              <button class="sproject-expand" data-a="toggleExpand" data-id="${p.id}" aria-expanded="${open && !compact}" aria-controls="project-sections-${esc(p.id)}" aria-label="${esc(tr(open ? 'Collapse project sections' : 'Expand project sections'))}: ${esc(p.name)}">${ic('chevron-right', 13, 'chev ' + (open ? 'open' : ''))}</button>
              <a class="sproject-link" href="${esc(appLocationPath(D(), { route: 'project', params: { id: p.id } }))}" data-a="go" data-r="project" data-id="${p.id}" aria-label="${esc(p.name)}" title="${esc(p.name)}" ${on ? 'aria-current="page"' : ''} ${compact ? `data-tip="${esc(p.name)}" data-tip-pos="right"` : ''}>
              <span class="pico" style="--c:${pColor(p)}">${projectIconContent(p, 12)}</span><span class="trunc sproject-name" translate="no">${esc(p.name)}</span>
              ${isFavorite('project', p) ? `<span class="fav">${ic('star', 11)}</span>` : ''}
              ${p.private ? `<span class="faint" style="margin-left:4px">${ic('lock', 11)}</span>` : ''}
              <span class="sdot" style="background:${PSTAT[p.status].c}" title="${PSTAT[p.status].name}"></span>
              </a><button class="ibtn ibtn-xs sproject-options" data-a="ctxBtn" data-ctx="project" data-id="${p.id}" aria-label="${esc(tr('Project options'))}: ${esc(p.name)}">${ic('ellipsis', 14)}</button>
            </div>
            <div id="project-sections-${esc(p.id)}" class="sub ${open && !compact ? 'open' : ''}">
              ${[
                ['board', 'Board', 'square-kanban'],
                ['list', 'List', 'list'],
                ['timeline', 'Timeline', 'chart-gantt'],
                ['files', 'Files', 'paperclip'],
              ]
                .map(
                  ([tab, n, i]) =>
                    `<button class="sitem ${on && u.params.tab === tab ? 'on' : ''}" data-a="go" data-r="project" data-id="${p.id}" data-tab="${tab}">${ic(i, 14)}<span>${n}</span></button>`,
                )
                .join('')}
            </div>
          </div>`;
          })
          .join('')}
        ${sItem('archive', 'Archive', 'archive', { ct: menu.counts ? D().tasks.filter(t => t.archived).length + D().projects.filter(p => p.archived).length + (D().trash?.length || 0) || '' : '' })}
      </div>
      ${
        menu.teams
          ? `<div class="sgroup">
        <div class="sgroup-h"><span>Teams</span><span class="sp"></span>${canManageTeams(u.currentUser?.role) ? `<button class="ibtn ibtn-xs" data-a="newTeam" data-tip="New team" aria-label="New team">${ic('plus', 14)}</button>` : ''}</div>
        ${teamsList()
          .map(t => sItem('team', t.name, t.icon, { id: t.id, userText: true }))
          .join('')}
      </div>`
          : ''
      }
    </div>
    <div class="side-bot">
      ${sItem('settings', 'Settings', 'settings')}
      <button class="sitem account-menu-trigger" data-a="pop" data-pop="user" title="${esc(accountMenuLabel())}" style="height:36px" ${u.collapsed ? 'data-tip="Profile" data-tip-pos="right"' : ''}>${accountAvatarStatus(d.me)}<span class="trunc" style="color:var(--text);font-weight:500" translate="no">${esc(S.prefs.name)}</span><span class="ct">${ic('chevrons-up-down', 13)}</span></button>
    </div>
  </nav>`;
}

export function crumbs() {
  const u = S.ui,
    r = u.route,
    out = [];
  const c = (label, act = '', cur = false, icon = '', userText = false) => {
    const tag = act ? 'button' : 'span';
    return `<${tag} class="${cur ? 'cur' : ''}" ${cur ? 'aria-current="page"' : ''} ${userText ? 'translate="no"' : ''} ${act}>${icon}${esc(label)}</${tag}>`;
  };
  if (r === 'project') {
    const p = proj(u.params.id);
    out.push(c('Projects', 'data-a="go" data-r="projects"'));
    if (p)
      out.push(
        c(
          p.name,
          `data-a="go" data-r="project" data-id="${p.id}" data-tab="overview"`,
          true,
          `<span class="pico" style="--c:${pColor(p)};width:16px;height:16px;border-radius:4px;display:grid;place-items:center;color:${pColor(p)}">${projectIconContent(p, 11)}</span>`,
          true,
        ),
      );
  } else if (r === 'member') {
    out.push(c('Members', 'data-a="go" data-r="members"'));
    out.push(c(mem(u.params.id)?.name || 'Member', '', true, '', Boolean(mem(u.params.id)?.name)));
  } else if (r === 'team') {
    out.push(c('Teams', 'data-a="go" data-r="teams"'));
    out.push(c(team(u.params.id)?.name || 'Team', '', true, '', Boolean(team(u.params.id)?.name)));
  } else if (r === 'settings') {
    out.push(c('Settings', '', true));
  } else out.push(c(ROUTE_NAMES[r] || 'Not found', '', true));
  return out.join('<span class="sep">/</span>');
}
export function renderTopbar() {
  const state = systemConnectionState();
  const sync = SYNC_PRESENTATION[state];
  const syncLabel = state === 'saved' && S.ui.workspaceSettingsDirty ? workspaceDraftLabel() : tr(sync[1]);
  const syncTitle =
    state === 'saved' && !S.ui.workspaceSettingsDirty && S.ui.lastSyncedAt ? `${tr('Last synchronized')}: ${fmtTimestamp(S.ui.lastSyncedAt, true)}` : syncLabel;
  return `<header class="topbar">
    <button class="ibtn" data-a="openMnav" aria-label="Open navigation" id="mnav-btn">${ic('menu', 17)}</button>
    <button class="workspace-context pillbtn" data-a="pop" data-pop="ws" title="${esc(D().ws.name)}" aria-label="${esc(tr('Switch workspace'))}: ${esc(D().ws.name)}"><span class="trunc" translate="no">${esc(D().ws.name)}</span>${ic('chevron-down', 12)}</button>
    <nav class="crumbs trunc" aria-label="Breadcrumb">${crumbs()}</nav>
    <span class="sp"></span>
    <span class="sr" id="sync-indicator" data-state="${state}" title="${esc(syncTitle)}" aria-live="polite"><span class="sync-label" translate="no">${esc(syncLabel)}</span></span>
    <button class="topsearch" data-a="openPalette" aria-label="${esc(tr('Search or jump to…'))} ${MOD} + K" aria-keyshortcuts="${MOD === '⌘' ? 'Meta' : 'Control'}+k">${ic('search', 14)}<span class="lbltxt">Search or jump to…</span><span class="kbd topsearch-shortcut" aria-hidden="true">${shortcut([MOD, 'K'])}</span></button>
    <button class="ibtn" data-a="go" data-r="notifications" data-tip="Notifications" aria-label="Notifications">${ic('bell', 16)}${myNotifications().some(n => !n.read) ? '<span style="position:absolute;top:6px;right:7px;width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 2px var(--surface)"></span>' : ''}</button>
    ${S.ui.currentUser?.role === 'viewer' ? '' : `<button class="btn btn-secondary btn-sm" data-a="pop" data-pop="create" aria-haspopup="menu" aria-label="Create new">${ic('plus', 14)}<span class="hide-m">New</span>${ic('chevron-down', 12, 'hide-m')}</button>`}
    <button class="ibtn mobile-sync-entry" data-a="pop" data-pop="user" data-state="${state}" aria-label="${esc(tr('System status') + ': ' + syncLabel)}" title="${esc(syncTitle)}">${ic(sync[0], 16)}<span class="sr" translate="no">${esc(syncLabel)}</span></button><button class="ibtn hide-m account-menu-button account-menu-trigger" data-a="pop" data-pop="user" title="${esc(accountMenuLabel())}">${accountAvatarStatus(D().me, 'md')}<span class="sr">${esc(accountMenuLabel())}</span></button>
  </header>`;
}
export function renderBottomNav() {
  const r = S.ui.route;
  const unread = myNotifications().some(n => !n.read && n.type !== 'update');
  const b = (route, label, icon, extra = '') =>
    `<button class="${r === route ? 'on' : ''}" data-a="go" data-r="${route}">${ic(icon, 19)}<span>${label}</span>${extra}</button>`;
  return `<nav class="bottomnav" aria-label="Primary">
    ${b('home', 'Home', 'house')}${b('mytasks', 'My Tasks', 'circle-check')}${b('projects', 'Projects', 'folder-kanban')}${b('inbox', 'Inbox', 'inbox', unread ? '<span class="bdot"></span>' : '')}
    <button data-a="openMnav">${ic('ellipsis', 19)}<span>More</span></button>
  </nav>`;
}
