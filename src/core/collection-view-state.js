import { D, S } from './store.js';
import { readLayoutPreference, writeLayoutPreference } from './view-layout-preferences.js';

const views = new Map();
export function collectionView(name, defaults) {
  const scope = JSON.stringify([S.ui.currentUser?.id, D().ws.id || D().ws.url]);
  let view = views.get(name);
  if (view?.scope !== scope) {
    const saved = readLayoutPreference('collection:' + name, {}) || {};
    view = { name, scope, defaults, page: Math.max(0, Math.min(10000, Math.floor(Number(saved.page) || 0))) };
    views.set(name, view);
    for (const [field, fallback] of Object.entries(defaults)) S.ui[field] = typeof saved[field] === 'string' ? saved[field].slice(0, 500) : fallback;
  }
  return view;
}
export function collectionPage(view, key) {
  S.ui.listPages ||= {};
  if (!view.key) S.ui.listPages[key] = view.page;
  else if (view.key !== key) S.ui.listPages[key] = 0;
  view.key = key;
  return S.ui.listPages[key] || 0;
}
export function saveCollectionView(view, page) {
  const fields = Object.fromEntries(Object.keys(view.defaults).map(field => [field, String(S.ui[field] || '').slice(0, 500)]));
  writeLayoutPreference('collection:' + view.name, { ...fields, page });
}
export function resetCollectionView(view) {
  if (!view) return;
  Object.assign(S.ui, view.defaults);
  view.page = 0;
  view.key = '';
  writeLayoutPreference('collection:' + view.name, { ...view.defaults, page: 0 });
}
