const sections = new Set(
  'home inbox mytasks favorites notifications search overview projects files tasks calendar timeline members teams activity knowledge bookmarks graph archive settings'.split(
    ' ',
  ),
);
const personal = new Set('appearance language datetime notif-mentions notif-assign notif-email notif-push profile security preferences shortcuts'.split(' '));
const settings = new Set([...personal, 'workspace', 'data-transfer', 'members', 'teams', 'projects', 'permissions']);
const key = (account, workspace) => `smena.workspace.section:${account}:${workspace}`;

export function rememberWorkspaceSection(storage, account, workspace, route, params = {}) {
  if (!account || !workspace) return;
  const section = { project: 'projects', member: 'members', team: 'teams' }[route] || route;
  if (!sections.has(section)) return;
  try {
    storage.setItem(key(account, workspace), JSON.stringify({ route: section, sec: section === 'settings' ? params.sec : undefined }));
  } catch {
    /* Navigation works without optional per-tab memory. */
  }
}

export function workspaceSectionDestination(storage, account, target) {
  let route = 'home',
    sec = '';
  try {
    const remembered = JSON.parse(storage.getItem(key(account, target.id)) || 'null');
    if (sections.has(remembered?.route)) route = remembered.route;
    if (route === 'settings') {
      if (!settings.has(remembered.sec) || (target.role !== 'admin' && !personal.has(remembered.sec))) route = 'home';
      else sec = `/${remembered.sec}`;
    }
  } catch {
    /* Invalid or unavailable memory falls back to Home. */
  }
  return `/${encodeURIComponent(target.url)}/${route}${sec}`;
}
