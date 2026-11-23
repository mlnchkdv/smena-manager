import { S, canSee, proj, task } from './store.js';
import { getActiveWorkspace } from './api.js';

const taskRoutes = new Set([
  'tasks',
  'mytasks',
  'inbox',
  'notifications',
  'home',
  'calendar',
  'timeline',
  'activity',
  'project',
  'overview',
  'search',
  'graph',
]);
const calendar = ['calDate', 'calMode', 'calAgendaAnchor'];
const timeline = ['tlPresentation', 'tlZoom', 'tlGroup', 'tlAnchor', 'tlAnchorKey'];
const activity = ['actFilter', 'actFrom', 'actTo', 'actPeriod', 'actProject', 'actQuery', 'actWho'];
const scope = () => JSON.stringify([S.ui.currentUser?.id, getActiveWorkspace()]);
const saved = new Map();
const storageKey = 'smena.work-navigation.v1';

function savedWorkEntries() {
  try {
    const entries = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

window.addEventListener('smena:upload-scope-change', event => {
  if (!event.detail?.signedOut) return;
  saved.clear();
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    /* Same-document history still gets cleared. */
  }
});

const belongsToView = (name, key, isTimeline) => name.startsWith(key + ':') || (isTimeline && name === 'timeline');

export function captureWorkContext() {
  const { route, params, drawer } = S.ui;
  if (!taskRoutes.has(route)) return null;
  const key = route === 'project' ? (params.tab?.startsWith('v:') ? 's' + params.tab : 'p:' + params.id) : { calendar: 'cal', timeline: 'tl' }[route] || route;
  const fields =
    route === 'search'
      ? ['searchQ', 'searchCat', 'searchOffsets', 'searchPageContext']
      : route === 'graph'
        ? [
            'graphView',
            'graphSelected',
            'graphQuery',
            'graphKind',
            'graphProject',
            'graphDepth',
            'graphArchive',
            'graphConnected',
            'graphCenter',
            'graphFiltersOpen',
            'graphSelectionClosed',
            'graphClustersChosen',
            'graphClustersEnabled',
            'graphClustersExpanded',
          ]
        : route === 'calendar' || params.tab === 'calendar'
          ? calendar
          : route === 'timeline' || params.tab === 'timeline'
            ? timeline
            : route === 'activity'
              ? activity
              : route === 'inbox'
                ? ['inboxCat', 'inboxQuery', 'inboxSel', 'inboxUnread', 'inboxWindow']
                : route === 'notifications'
                  ? ['notifFilter']
                  : [];
  const positions = [...document.querySelectorAll('.content, .content [data-keep]')].map(el => [
    el.matches('.content') ? null : el.dataset.keep,
    el.scrollTop,
    el.scrollLeft,
  ]);
  const isTimeline = fields === timeline;
  const listState = Object.fromEntries(
    ['listPages', 'collapsedGroups'].map(field => [
      field,
      Object.fromEntries(Object.entries(S.ui[field] || {}).filter(([name]) => belongsToView(name, key, isTimeline))),
    ]),
  );
  return structuredClone({
    scope: scope(),
    route,
    params,
    drawer,
    drawerFull: S.ui.drawerFull,
    drawerTab: drawer ? S.ui.drawerTab : undefined,
    drawerOpener: drawer ? S.ui.drawerOpener : undefined,
    key,
    isTimeline,
    view: S.views[key],
    ui: Object.fromEntries(fields.map(field => [field, S.ui[field]])),
    listState,
    positions,
  });
}

export function restoreWorkContext(context, { location = false } = {}) {
  if (!S.ui.currentUser || !context || context.scope !== scope() || !taskRoutes.has(context.route)) return null;
  if (context.route === 'project' && !canSee(proj(context.params?.id))) return null;
  if (context.drawer && (S.ui.drawer !== context.drawer || !canSee(proj(task(context.drawer)?.project)))) return null;
  if (location) {
    S.ui.route = context.route;
    S.ui.params = structuredClone(context.params);
    S.ui.drawer = context.drawer || null;
    S.ui.drawerFull = context.drawerFull || false;
  }
  if (context.route !== S.ui.route || JSON.stringify(context.params) !== JSON.stringify(S.ui.params)) return null;
  if (context.drawer) {
    S.ui.drawerTab = context.drawerTab === 'activity' ? 'activity' : 'comments';
    S.ui.drawerOpener = context.drawerOpener || null;
  }
  if (context.view) S.views[context.key] = structuredClone(context.view);
  else delete S.views[context.key];
  Object.assign(S.ui, context.ui);
  for (const [field, entries] of Object.entries(context.listState)) {
    const map = (S.ui[field] ||= {});
    for (const key of Object.keys(map)) if (belongsToView(key, context.key, context.isTimeline)) delete map[key];
    Object.assign(map, entries);
  }
  return context;
}

export function restoreWorkScroll(context) {
  if (!context) return;
  for (const [key, top, left] of context.positions) {
    const el = document.querySelector(key ? `.content [data-keep="${CSS.escape(key)}"]` : '.content');
    if (el) {
      el.scrollTop = top;
      el.scrollLeft = left;
    }
  }
}

export function saveWorkHistory(context = captureWorkContext()) {
  if (!context || !S.ui.currentUser || !S.ui.locationReady) return;
  const state = history.state || {};
  const key = state.workContext || crypto.randomUUID();
  const entry = { path: location.pathname, context };
  saved.delete(key);
  saved.set(key, entry);
  if (saved.size > 50) saved.delete(saved.keys().next().value);
  history.replaceState({ ...state, workContext: key }, '');
  try {
    const entries = savedWorkEntries()
      .filter(item => item?.[0] !== key && item?.[1]?.context?.scope === scope())
      .slice(-49);
    entries.push([key, entry]);
    sessionStorage.setItem(storageKey, JSON.stringify(entries));
  } catch {
    /* Keep same-document history available if storage is denied. */
  }
}

export function workHistoryContext(state) {
  if (!state?.workContext || !S.ui.currentUser) return null;
  const entry = saved.get(state.workContext) || savedWorkEntries().find(item => item?.[0] === state.workContext)?.[1];
  return entry?.path === location.pathname && entry.context?.scope === scope() ? entry.context : null;
}

export function saveOpenTaskHistory() {
  if (S.ui.drawer && history.state?.taskFromWork) saveWorkHistory();
}
