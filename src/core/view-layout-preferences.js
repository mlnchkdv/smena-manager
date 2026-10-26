import { D, S } from './store.js';

const key = name => (S.ui.currentUser?.id ? `smena.layout.v1:${S.ui.currentUser.id}:${D().ws.id || D().ws.url}:${name}` : null);
export function readLayoutPreference(name, fallback) {
  if (!key(name)) return fallback;
  try {
    const value = JSON.parse(localStorage.getItem(key(name)) || 'null');
    return typeof value === typeof fallback && (typeof value !== 'number' || Number.isFinite(value)) ? value : fallback;
  } catch {
    return fallback;
  }
}
export function writeLayoutPreference(name, value) {
  try {
    const target = key(name);
    if (target) localStorage.setItem(target, JSON.stringify(value));
  } catch {
    /* Optional device layout; never block workspace work. */
  }
}
