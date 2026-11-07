import { D, S } from './store.js';
import { layoutPreferenceKeys, readScopedLayout } from '../shared/layout-preference-storage.js';

const keys = name => layoutPreferenceKeys(S.ui.currentUser?.id, D().ws.id || D().ws.url, name);
export const localViewResetApplies = (event, section) =>
  event.detail?.user === S.ui.currentUser?.id && event.detail.workspace === (D().ws.id || D().ws.url) && event.detail.section === section;
export function readLayoutPreferenceEntry(name) {
  try {
    return readScopedLayout(localStorage, keys(name));
  } catch {
    return { stored: false };
  }
}
export function readLayoutPreference(name, fallback) {
  const { stored, value } = readLayoutPreferenceEntry(name);
  return stored && typeof value === typeof fallback && (typeof value !== 'number' || Number.isFinite(value)) ? value : fallback;
}
export function writeLayoutPreference(name, value) {
  try {
    const target = keys(name)[0];
    if (target) localStorage.setItem(target, JSON.stringify(value));
  } catch {
    /* Optional device layout; never block workspace work. */
  }
}
