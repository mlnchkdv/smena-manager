import { D, S } from './store.js';
import { fileViewKey, readFileView, writeFileView } from '../shared/file-view.js';
import { readFilePresets, writeFilePresets } from '../shared/file-presets.js';
import { readLayoutPreference } from './view-layout-preferences.js';
import { fileContextKey, readFileContext, writeFileContext } from '../shared/file-context-store.js';
export function fileFolderView() {
  return innerWidth <= 640
    ? { compact: readLayoutPreference('fileFoldersMobileCompact', true), collapsed: readLayoutPreference('fileFoldersMobileCollapsed', true) }
    : { compact: S.ui.fileFolderLayout === 'compact', collapsed: S.ui.fileFoldersCollapsed === true || (innerHeight <= 480 && !S.ui.fileFoldersHasChoice) };
}
let loadedKey;
let activeContext;
const contexts = new Map();
let contextPage = 0,
  contextScroll = 0,
  contextAnchor = null,
  pendingPage = false,
  pendingScroll = false,
  scrollTimer;
let contextPageKey = '';
const contextKey = () => fileContextKey(S.ui.currentUser?.id, D().ws?.id || D().ws?.url, activeContext);
const snapshot = () => ({
  ...Object.fromEntries(contextFields.map(field => [field, S.ui[field]])),
  page: contextPage,
  pageKey: contextPageKey,
  scroll: contextScroll,
  anchor: contextAnchor,
});
function persistContext() {
  if (!activeContext || !S.ui.currentUser?.id) return;
  const value = snapshot();
  contexts.set(activeContext, value);
  if (contexts.size > 20) contexts.delete(contexts.keys().next().value);
  try {
    writeFileContext(sessionStorage, contextKey(), value);
  } catch {
    /* Device storage is optional. */
  }
}
const contextFields = [
  'fileQ',
  'fileProject',
  'fileFolder',
  'fileRecursive',
  'fileType',
  'fileUploadProject',
  'fileSelection',
  'fileFolderOffset',
  'fileFolderQuery',
  'fileSelectedPreset',
];
export const captureFileLocation = () => structuredClone(snapshot());
export function restoreFileLocation(value) {
  Object.assign(S.ui, Object.fromEntries(contextFields.filter(field => Object.hasOwn(value, field)).map(field => [field, structuredClone(value[field])])));
  contextPage = value.page || 0;
  contextPageKey = value.pageKey || '';
  contextScroll = value.scroll || 0;
  contextAnchor = value.anchor || null;
  pendingPage = pendingScroll = true;
}
export function fileContext(projectId = null) {
  const next = projectId || 'workspace';
  if (next === activeContext) {
    if (!document.querySelector('#main-content .files-page')) pendingScroll = true;
    return;
  }
  if (activeContext) persistContext();
  activeContext = next;
  let restored = contexts.get(next);
  if (!restored)
    try {
      restored = readFileContext(sessionStorage, contextKey());
    } catch {
      /* Optional session context. */
    }
  Object.assign(
    S.ui,
    restored
      ? Object.fromEntries(contextFields.filter(field => Object.hasOwn(restored, field)).map(field => [field, restored[field]]))
      : {
          fileQ: '',
          fileProject: projectId || 'all',
          fileFolder: null,
          fileRecursive: false,
          fileType: 'all',
          fileUploadProject: projectId || '',
          fileSelection: [],
          fileFolderOffset: 0,
          fileFolderQuery: '',
          fileSelectedPreset: '',
        },
  );
  S.ui.fileSelection = [];
  contextPage = restored?.page || 0;
  contextScroll = restored?.scroll || 0;
  contextAnchor = restored?.anchor || null;
  pendingPage = pendingScroll = !!restored;
  contextPageKey = restored?.pageKey || '';
}
export function restoreFileContextPage(pageKey, valid = true) {
  if (!pendingPage) return;
  valid = valid && (!contextPageKey || contextPageKey === pageKey);
  S.ui.listPages ||= {};
  S.ui.listPages[pageKey] = valid ? contextPage : 0;
  contextPageKey = pageKey;
  if (!valid) {
    contextScroll = 0;
    contextAnchor = null;
  }
  pendingPage = false;
}
export function rememberFileContextPage(pageKey, page, ready) {
  const nextPage = ready ? page : S.ui.listPages?.[pageKey] || 0;
  if ((contextPageKey && contextPageKey !== pageKey) || contextPage !== nextPage) {
    contextScroll = 0;
    contextAnchor = null;
  }
  contextPageKey = pageKey;
  contextPage = nextPage;
  persistContext();
  if (!ready) return;
  if (!pendingScroll) return;
  pendingScroll = false;
  const captured = contextKey();
  requestAnimationFrame(() => {
    if (captured !== contextKey() || !isFileRoute()) return;
    const main = document.getElementById('main-content');
    if (!main) return;
    const anchor = contextAnchor && main.querySelector(`:is(article.workspace-file-card,tr)[data-id="${CSS.escape(contextAnchor.id)}"]`);
    main.scrollTop = anchor ? main.scrollTop + anchor.getBoundingClientRect().top - main.getBoundingClientRect().top - contextAnchor.offset : contextScroll;
  });
}
const isFileRoute = () => S.ui.route === 'files' || (S.ui.route === 'project' && S.ui.params.tab === 'files');
document.addEventListener(
  'scroll',
  event => {
    if (event.target?.id !== 'main-content' || !isFileRoute() || pendingScroll) return;
    contextScroll = event.target.scrollTop;
    const top = event.target.getBoundingClientRect().top;
    const anchor = [...event.target.querySelectorAll('article.workspace-file-card,.workspace-file-table tbody tr')].find(
      el => el.getBoundingClientRect().bottom > top + 8,
    );
    contextAnchor = anchor ? { id: anchor.dataset.id, offset: anchor.getBoundingClientRect().top - top } : null;
    clearTimeout(scrollTimer);
    const captured = contextKey();
    scrollTimer = setTimeout(() => {
      if (captured === contextKey()) persistContext();
    }, 150);
  },
  true,
);
const key = () => fileViewKey(S.ui.currentUser?.id, D().ws?.id || D().ws?.url);
export function filePreferences() {
  const next = key();
  if (next === loadedKey) return;
  S.ui.fileDownload?.dispose?.();
  S.ui.fileDownload?.controller.abort();
  S.ui.fileDownload = null;
  S.ui.fileNativeTransfer?.controller.abort();
  S.ui.fileNativeTransfer = null;
  loadedKey = next;
  activeContext = null;
  contexts.clear();
  let storage;
  try {
    storage = localStorage;
  } catch {
    /* Storage can be disabled. */
  }
  const value = readFileView(storage, next);
  try {
    S.ui.fileFoldersHasChoice = typeof JSON.parse(storage?.getItem(next) || '{}').foldersCollapsed === 'boolean';
  } catch {
    S.ui.fileFoldersHasChoice = false;
  }
  S.ui.fileFilterPresets = readFilePresets(storage, next);
  S.ui.fileSelectedPreset = '';
  S.ui.fileRecursive = false;
  S.ui.fileView = value.view;
  S.ui.fileSort = value.sort;
  S.ui.filePageSize = value.pageSize;
  S.ui.fileFolderLayout = value.folderLayout;
  S.ui.fileFoldersCollapsed = value.foldersCollapsed;
  S.ui.fileFolderOffset = 0;
  S.ui.fileFolderQuery = '';
  S.ui.fileFolder = null;
  S.ui.fileProject = 'all';
  S.ui.fileType = 'all';
  S.ui.fileQ = '';
  S.ui.fileSelection = [];
}
export function saveFileFilterPresets() {
  try {
    return writeFilePresets(localStorage, key(), S.ui.fileFilterPresets);
  } catch {
    return false;
  }
}
export function saveFilePreferences() {
  try {
    writeFileView(localStorage, key(), {
      view: S.ui.fileView,
      sort: S.ui.fileSort,
      pageSize: S.ui.filePageSize,
      folderLayout: S.ui.fileFolderLayout,
      foldersCollapsed: S.ui.fileFoldersCollapsed,
    });
  } catch {
    /* Optional device-only preferences never block file operations. */
  }
}
