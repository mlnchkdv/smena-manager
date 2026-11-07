import { D, S } from './store.js';
import { knowledgeViewKeys, readScopedLayout } from '../shared/layout-preference-storage.js';
import { localViewResetApplies } from './view-layout-preferences.js';
let loadedKey;
window.addEventListener('smena:device-view-reset', event => {
  if (localViewResetApplies(event, 'knowledge')) loadedKey = undefined;
});
const keys = () => knowledgeViewKeys(S.ui.currentUser?.id, D().ws.id || D().ws.url);
const key = () => keys()[0];
export function knowledgePreferences() {
  const next = key();
  if (next !== loadedKey) {
    loadedKey = next;
    let value = {};
    try {
      const parsed = readScopedLayout(localStorage, keys()).value;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) value = parsed;
    } catch {
      /* optional device preferences */
    }
    S.ui.knowledgeSavedViews = Array.isArray(value.views)
      ? value.views.filter(view => view && ['id', 'name', 'folder', 'query', 'tag', 'sort'].every(field => typeof view[field] === 'string')).slice(0, 20)
      : [];
    S.ui.knowledgeRecent = Array.isArray(value.recent) ? value.recent.filter(id => typeof id === 'string').slice(0, 50) : [];
    S.ui.knowledgeFolderRecent = Array.isArray(value.folderRecent) ? value.folderRecent.filter(id => typeof id === 'string').slice(0, 12) : [];
    S.ui.knowledgeSelection = [];
    S.ui.knowledgeColumns = Array.isArray(value.columns) ? value.columns.filter(key => typeof key === 'string').slice(0, 6) : null;
    S.ui.knowledgeTableSort = value.tableSort && typeof value.tableSort.key === 'string' ? { key: value.tableSort.key, desc: !!value.tableSort.desc } : null;
    S.ui.knowledgePaneHidden = value.paneHidden === true;
    S.ui.knowledgePaneWidth = Math.max(220, Math.min(420, Number(value.paneWidth) || 300));
    S.ui.knowledgeShowFolders = value.showFolders !== false;
    S.ui.knowledgeFolderLayout = value.folderLayout === 'inline' ? 'inline' : 'block';
    S.ui.knowledgeCardDensity = ['comfortable', 'compact'].includes(value.cardDensity) ? value.cardDensity : '';
    S.ui.knowledgeNoteLayout = ['list', 'grid', 'table'].includes(value.noteLayout)
      ? value.noteLayout
      : window.matchMedia('(max-width: 640px)').matches
        ? 'list'
        : 'grid';
    S.ui.knowledgeFolderNavOffset = 0;
    S.ui.knowledgeFolderCardOffset = 0;
    S.ui.knowledgeFolderCardQuery = '';
    S.ui.knowledgeOpenSections = [];
    S.ui.knowledgeMobileFolders = false;
  }
}
export function saveKnowledgePreferences() {
  try {
    if (!key()) return;
    localStorage.setItem(
      key(),
      JSON.stringify({
        views: S.ui.knowledgeSavedViews || [],
        paneHidden: !!S.ui.knowledgePaneHidden,
        paneWidth: S.ui.knowledgePaneWidth || 300,
        recent: S.ui.knowledgeRecent || [],
        folderRecent: S.ui.knowledgeFolderRecent || [],
        showFolders: S.ui.knowledgeShowFolders !== false,
        folderLayout: S.ui.knowledgeFolderLayout === 'inline' ? 'inline' : 'block',
        cardDensity: S.ui.knowledgeCardDensity || '',
        noteLayout: ['list', 'table'].includes(S.ui.knowledgeNoteLayout) ? S.ui.knowledgeNoteLayout : 'grid',
        columns: S.ui.knowledgeColumns,
        tableSort: S.ui.knowledgeTableSort,
      }),
    );
  } catch {
    /* optional device preferences */
  }
}
