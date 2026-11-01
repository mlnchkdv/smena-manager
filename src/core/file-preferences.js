import { D, S } from './store.js';
import { fileViewKey, readFileView, writeFileView } from '../shared/file-view.js';
import { readFilePresets, writeFilePresets } from '../shared/file-presets.js';
import { readLayoutPreference } from './view-layout-preferences.js';
export function fileFolderView() {
  return innerWidth <= 640
    ? { compact: readLayoutPreference('fileFoldersMobileCompact', true), collapsed: readLayoutPreference('fileFoldersMobileCollapsed', true) }
    : { compact: S.ui.fileFolderLayout === 'compact', collapsed: S.ui.fileFoldersCollapsed === true };
}
let loadedKey;
let activeContext;
const contexts = new Map();
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
export function fileContext(projectId = null) {
  const next = projectId || 'workspace';
  if (next === activeContext) return;
  if (activeContext) contexts.set(activeContext, Object.fromEntries(contextFields.map(field => [field, S.ui[field]])));
  Object.assign(
    S.ui,
    contexts.get(next) || {
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
  activeContext = next;
}
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
