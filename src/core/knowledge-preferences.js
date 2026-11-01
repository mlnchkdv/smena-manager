import { D, S } from './store.js';
let loadedKey;
const key = () => `smena.knowledge.ui.v1:${S.ui.currentUser?.id || 'anonymous'}:${D().ws.id || D().ws.url}`;
export function knowledgePreferences() {
  const next = key();
  if (next !== loadedKey) {
    loadedKey = next;
    let value = {};
    try {
      const parsed = JSON.parse(localStorage.getItem(next) || '{}');
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
    S.ui.knowledgePaneHidden = value.paneHidden === true;
    S.ui.knowledgePaneWidth = Math.max(220, Math.min(420, Number(value.paneWidth) || 300));
    S.ui.knowledgeShowFolders = value.showFolders !== false;
    S.ui.knowledgeFolderLayout = value.folderLayout === 'inline' ? 'inline' : 'block';
    S.ui.knowledgeCardDensity = value.cardDensity === 'comfortable' ? 'comfortable' : 'compact';
    S.ui.knowledgeNoteLayout = ['list', 'grid'].includes(value.noteLayout)
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
        cardDensity: S.ui.knowledgeCardDensity === 'comfortable' ? 'comfortable' : 'compact',
        noteLayout: S.ui.knowledgeNoteLayout === 'list' ? 'list' : 'grid',
      }),
    );
  } catch {
    /* optional device preferences */
  }
}
