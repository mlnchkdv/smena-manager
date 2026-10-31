const SIMPLE_ROUTES = new Set([
  'home',
  'inbox',
  'mytasks',
  'favorites',
  'notifications',
  'search',
  'overview',
  'projects',
  'files',
  'tasks',
  'calendar',
  'timeline',
  'members',
  'teams',
  'activity',
  'knowledge',
  'bookmarks',
  'whiteboards',
  'graph',
  'settings',
  'archive',
]);

function decode(segment) {
  try {
    return decodeURIComponent(segment || '');
  } catch {
    return segment || '';
  }
}

function encode(segment) {
  return encodeURIComponent(String(segment || '').trim());
}

export function parseAppLocation(pathname, hash = '') {
  const segments = String(pathname || '/')
    .split('/')
    .filter(Boolean)
    .map(decode);
  const legacyRoute = String(hash || '').replace(/^#/, '');
  if (!segments.length) return { kind: SIMPLE_ROUTES.has(legacyRoute) ? legacyRoute : 'home', slug: '' };
  const [slug, kind = 'home', key = '', detail = ''] = segments;
  return { slug, kind, key, detail };
}

function resolveEntity(items, key) {
  const exact = items.find(item => item.id === key);
  if (exact) return exact;
  const matches = items.filter(item => item.key && String(item.key).toLocaleLowerCase() === key.toLocaleLowerCase());
  return matches.length === 1 ? matches[0] : null;
}

export function entityRouteKey(items, entity) {
  const key = String(entity?.key || '');
  return key && items.filter(item => String(item.key || '').toLocaleLowerCase() === key.toLocaleLowerCase()).length === 1 ? key : entity?.id || '';
}

export function resolveAppLocation(pathname, hash, data, defaultRoute = 'home') {
  const parsed = parseAppLocation(pathname, hash);
  const route = parsed.kind === 'home' && !parsed.slug ? defaultRoute : parsed.kind;
  if (route === 'settings') return { route, params: parsed.key ? { sec: parsed.key } : {} };
  if (route === 'graph') return { route, params: parsed.key ? { center: parsed.key } : {} };
  if (route === 'whiteboard')
    return (data.whiteboards || []).some(b => b.id === parsed.key) ? { route, params: { id: parsed.key } } : { route: 'nowhere', params: {} };
  if (route === 'whiteboards') return { route, params: parsed.key === 'project' && parsed.detail ? { project: parsed.detail } : {} };
  if (SIMPLE_ROUTES.has(route)) return { route, params: {} };

  if (route === 'project') {
    const project = resolveEntity(data.projects, parsed.key);
    if (project && parsed.detail === 'whiteboard') {
      const board = (data.whiteboards || []).find(b => b.legacyProject === project.id);
      return board ? { route: 'whiteboard', params: { id: board.id } } : { route: 'whiteboards', params: { project: project.id } };
    }
    return project ? { route: 'project', params: { id: project.id, tab: parsed.detail || 'board' } } : { route: 'nowhere', params: {} };
  }
  if (route === 'task') {
    const task = resolveEntity(data.tasks, parsed.key);
    return task ? { route: 'project', params: { id: task.project, tab: 'board' }, drawer: task.id } : { route: 'nowhere', params: {} };
  }
  if (route === 'file') {
    const file = (data.files || []).find(item => item.id === parsed.key);
    return file ? { route: 'files', params: {}, file: file.id } : { route: 'nowhere', params: {} };
  }
  if (route === 'member') {
    return data.members.some(item => item.id === parsed.key) ? { route: 'member', params: { id: parsed.key } } : { route: 'nowhere', params: {} };
  }
  if (route === 'team') {
    return (data.teams || []).some(item => item.id === parsed.key) ? { route: 'team', params: { id: parsed.key } } : { route: 'nowhere', params: {} };
  }
  return { route: 'nowhere', params: {} };
}

export function appLocationPath(data, ui) {
  const slug = encode(data?.ws?.url || 'workspace');
  const modal = ui.modals?.at?.(-1);
  const fileId = modal?.type === 'filePreview' ? modal.file?.id : '';
  if (fileId) return `/${slug}/file/${encode(fileId)}`;

  const task = ui.drawer ? data.tasks.find(item => item.id === ui.drawer) : null;
  if (task) return `/${slug}/task/${encode(entityRouteKey(data.tasks, task))}`;

  if (ui.route === 'project') {
    const project = data.projects.find(item => item.id === ui.params.id);
    if (!project) return `/${slug}/projects`;
    const tab = ui.params.tab && ui.params.tab !== 'board' ? `/${encode(ui.params.tab)}` : '';
    const routeKey = entityRouteKey(data.projects, project);
    return `/${slug}/project/${encode(routeKey === project.key ? routeKey.toLowerCase() : routeKey)}${tab}`;
  }
  if (ui.route === 'member' && ui.params.id) return `/${slug}/member/${encode(ui.params.id)}`;
  if (ui.route === 'whiteboard' && ui.params.id) return `/${slug}/whiteboard/${encode(ui.params.id)}`;
  if (ui.route === 'whiteboards' && ui.params.project) return `/${slug}/whiteboards/project/${encode(ui.params.project)}`;
  if (ui.route === 'team' && ui.params.id) return `/${slug}/team/${encode(ui.params.id)}`;
  if (ui.route === 'settings') return `/${slug}/settings${ui.params.sec ? `/${encode(ui.params.sec)}` : ''}`;
  if (ui.route === 'home') return `/${slug}`;
  if (ui.route === 'graph' && ui.params.center) return `/${slug}/graph/${encode(ui.params.center)}`;
  if (SIMPLE_ROUTES.has(ui.route)) return `/${slug}/${ui.route}`;
  return `/${slug}`;
}
