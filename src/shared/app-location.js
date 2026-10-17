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

export function resolveAppLocation(pathname, hash, data, defaultRoute = 'home') {
  const parsed = parseAppLocation(pathname, hash);
  const route = parsed.kind === 'home' && !parsed.slug ? defaultRoute : parsed.kind;
  if (route === 'settings') return { route, params: parsed.key ? { sec: parsed.key } : {} };
  if (SIMPLE_ROUTES.has(route)) return { route, params: {} };

  if (route === 'project') {
    const project = data.projects.find(item => item.id === parsed.key || String(item.key || '').toLowerCase() === parsed.key.toLowerCase());
    return project ? { route: 'project', params: { id: project.id, tab: parsed.detail || 'board' } } : { route: 'nowhere', params: {} };
  }
  if (route === 'task') {
    const task = data.tasks.find(item => item.id === parsed.key || String(item.key || '').toLowerCase() === parsed.key.toLowerCase());
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
  if (task) return `/${slug}/task/${encode(task.key || task.id)}`;

  if (ui.route === 'project') {
    const project = data.projects.find(item => item.id === ui.params.id);
    if (!project) return `/${slug}/projects`;
    const tab = ui.params.tab && ui.params.tab !== 'board' ? `/${encode(ui.params.tab)}` : '';
    return `/${slug}/project/${encode(String(project.key || project.id).toLowerCase())}${tab}`;
  }
  if (ui.route === 'member' && ui.params.id) return `/${slug}/member/${encode(ui.params.id)}`;
  if (ui.route === 'team' && ui.params.id) return `/${slug}/team/${encode(ui.params.id)}`;
  if (ui.route === 'settings') return `/${slug}/settings${ui.params.sec ? `/${encode(ui.params.sec)}` : ''}`;
  if (ui.route === 'home') return `/${slug}`;
  if (SIMPLE_ROUTES.has(ui.route)) return `/${slug}/${ui.route}`;
  return `/${slug}`;
}
