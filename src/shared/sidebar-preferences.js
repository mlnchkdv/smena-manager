export const SIDEBAR_ITEMS = Object.freeze([
  ['home', 'Home', 'house', 'personal'],
  ['inbox', 'Inbox', 'inbox', 'personal'],
  ['mytasks', 'My Tasks', 'circle-check', 'personal'],
  ['favorites', 'Favorites', 'star', 'personal'],
  ['notifications', 'Notifications', 'bell', 'personal'],
  ['overview', 'Overview', 'layout-dashboard', 'workspace'],
  ['projects', 'Projects', 'folder-kanban', 'workspace'],
  ['files', 'Files', 'files', 'workspace'],
  ['tasks', 'Tasks', 'list-checks', 'workspace'],
  ['calendar', 'Calendar', 'calendar', 'workspace'],
  ['timeline', 'Timeline', 'chart-gantt', 'workspace'],
  ['knowledge', 'Knowledge base', 'library-big', 'workspace'],
  ['bookmarks', 'Bookmarks', 'bookmark', 'workspace'],
  ['whiteboards', 'Whiteboards', 'panels-top-left', 'workspace'],
  ['graph', 'Graph', 'network', 'workspace'],
  ['members', 'Members', 'users', 'workspace'],
  ['activity', 'Activity', 'activity', 'workspace'],
]);
const routes = SIDEBAR_ITEMS.map(item => item[0]);
export const defaultSidebar = () => ({ version: 1, order: [...routes], hidden: [], counts: true, projects: true, teams: true });
export function validSidebar(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    value.version === 1 &&
    Object.keys(value).every(k => ['version', 'order', 'hidden', 'counts', 'projects', 'teams'].includes(k)) &&
    Array.isArray(value.order) &&
    (value.order.length === routes.length || (value.order.length === routes.length - 1 && !value.order.includes('whiteboards'))) &&
    new Set(value.order).size === value.order.length &&
    value.order.every(k => routes.includes(k)) &&
    Array.isArray(value.hidden) &&
    value.hidden.length <= routes.length &&
    new Set(value.hidden).size === value.hidden.length &&
    value.hidden.every(k => routes.includes(k)) &&
    ['counts', 'projects', 'teams'].every(k => typeof value[k] === 'boolean'),
  );
}
export function sidebarPreferences(raw) {
  const defaults = defaultSidebar();
  try {
    const value = JSON.parse(raw || 'null');
    if (!value || value.version !== 1 || !Array.isArray(value.order) || !Array.isArray(value.hidden)) return defaults;
    const order = [...new Set(value.order.filter(k => routes.includes(k)))];
    if (!order.includes('whiteboards') && order.includes('bookmarks')) order.splice(order.indexOf('bookmarks') + 1, 0, 'whiteboards');
    const normalized = {
      ...defaults,
      ...Object.fromEntries(['counts', 'projects', 'teams'].map(k => [k, typeof value[k] === 'boolean' ? value[k] : true])),
      order: [...order, ...routes.filter(k => !order.includes(k))],
      hidden: [...new Set(value.hidden.filter(k => routes.includes(k)))],
    };
    return validSidebar(normalized) ? normalized : defaults;
  } catch {
    return defaults;
  }
}
