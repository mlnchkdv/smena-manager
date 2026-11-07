import { knowledgeViewKeys, layoutPreferenceKeys } from './layout-preference-storage.js';
import { fileViewKey } from './file-view.js';

const noteFields = ['paneHidden', 'paneWidth', 'columns', 'tableSort', 'showFolders', 'folderLayout', 'cardDensity', 'noteLayout'];
const names = {
  files: ['fileFoldersMobileCompact', 'fileFoldersMobileCollapsed'],
  knowledge: ['knowledge-line-wrap', 'knowledge-table-wide'],
  other: [
    'homeView',
    'bookmarkLayout',
    'inboxPreview',
    'archive-category',
    'calendarMobileMode',
    'calendarWideMode',
    'activityGrouping',
    'graph-clusters',
    'whiteboard-minimap',
    'whiteboard-resize-aspect',
    'whiteboard-resize-guides',
  ],
};
function ownedName(key, user, workspace) {
  if (typeof key !== 'string') return null;
  const prefix = 'smena.layout.v2:';
  if (key.startsWith(prefix)) {
    try {
      const value = JSON.parse(key.slice(prefix.length));
      return Array.isArray(value) && value.length === 3 && value[0] === user && value[1] === workspace && typeof value[2] === 'string' ? value[2] : null;
    } catch {
      return null;
    }
  }
  const legacy = layoutPreferenceKeys(user, workspace, '_')[1]?.slice(0, -1);
  return legacy && key.startsWith(legacy) ? key.slice(legacy.length) : null;
}
export function deviceViewResetPlan(storage, user, workspace, section) {
  if (!user || !workspace || !Object.hasOwn(names, section) || !knowledgeViewKeys(user, workspace).length) throw new TypeError('Invalid view scope.');
  const plan = [],
    add = (key, after, before = storage.getItem(key)) => {
      if (before !== null && before !== after) plan.push({ key, before, after });
    };
  if (section === 'files') add(fileViewKey(user, workspace), null);
  if (section === 'knowledge')
    for (const key of knowledgeViewKeys(user, workspace)) {
      const raw = storage.getItem(key);
      if (raw === null) continue;
      const value = JSON.parse(raw);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Unreadable saved view.');
      const next = { ...value };
      for (const field of noteFields) delete next[field];
      add(key, JSON.stringify(next), raw);
    }
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index),
      name = ownedName(key, user, workspace);
    if (name && (names[section].includes(name) || (section === 'other' && (name.startsWith('collection:') || name.startsWith('whiteboard-outline:')))))
      add(key, null);
  }
  return plan;
}
export function resetDeviceViews(storage, user, workspace, section) {
  const plan = deviceViewResetPlan(storage, user, workspace, section),
    applied = [];
  try {
    for (const change of plan) {
      if (storage.getItem(change.key) !== change.before) throw new Error('View changed during reset.');
      if (change.after === null) storage.removeItem(change.key);
      else storage.setItem(change.key, change.after);
      applied.push(change);
    }
  } catch (cause) {
    let rollbackFailed = false;
    for (const change of applied.reverse())
      try {
        if (storage.getItem(change.key) !== change.after) {
          rollbackFailed = true;
          continue;
        }
        storage.setItem(change.key, change.before);
      } catch {
        rollbackFailed = true;
      }
    throw Object.assign(new Error('Unable to reset local view.', { cause }), { rollbackFailed });
  }
  return { changed: plan.length };
}
