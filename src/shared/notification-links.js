const DEFAULT_ORIGIN = 'https://smena-manager.vercel.app';

export function notificationPath(data, route = 'notifications') {
  const slug = encodeURIComponent(String(data?.ws?.url || 'workspace').trim() || 'workspace');
  if (route && typeof route === 'object') {
    if (route.task && data?.tasks?.some(task => task.id === route.task)) return `/${slug}/task/${encodeURIComponent(route.task)}`;
    route = 'notifications';
  }
  const page = String(route || 'notifications')
    .replace(/^\/+|\/+$/gu, '')
    .replace(/[^a-z-]/giu, '');
  return `/${slug}/${page || 'notifications'}`;
}

export function notificationUrl(data, route = 'notifications', origin = globalThis.process?.env?.APP_ORIGIN || DEFAULT_ORIGIN) {
  let base;
  try {
    base = new URL(origin);
  } catch {
    base = new URL(DEFAULT_ORIGIN);
  }
  if (!['http:', 'https:'].includes(base.protocol)) base = new URL(DEFAULT_ORIGIN);
  return new URL(notificationPath(data, route), base.origin).href;
}
