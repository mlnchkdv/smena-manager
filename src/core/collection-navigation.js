import { D, S, visibleProjects } from './store.js';
import { getSessionGeneration } from './api.js';
import { captureFileLocation, restoreFileLocation } from './file-preferences.js';
import { CollectionLocationHistory } from '../shared/collection-location-history.js';

const trails = new Map();
const browsing = new Map();
let owner,
  restoreNonce = 0;
let pendingRestore, restoreTimer;
const fields = {
  knowledge: [
    'knowledgeFolder',
    'knowledgeOffset',
    'knowledgeLimit',
    'knowledgeQuery',
    'knowledgeTag',
    'knowledgeSort',
    'knowledgeSelection',
    'knowledgeFolderCardQuery',
    'knowledgeFolderCardOffset',
  ],
  bookmarks: ['bookmarkFolder', 'bookmarkQuery', 'bookmarkScope', 'bookmarkFilterKey', 'bookmarkSelection', 'bookmarkSelectionKey'],
};
const scope = () => JSON.stringify([getSessionGeneration(), S.ui.currentUser?.id, D().ws.id || D().ws.url]);
const routeScope = kind => (kind === 'files' && S.ui.route === 'project' ? S.ui.params.id : '');
export const collectionLocationKey = kind =>
  kind === 'files'
    ? JSON.stringify([S.ui.fileProject || 'all', S.ui.fileFolder || ''])
    : String(S.ui[kind === 'knowledge' ? 'knowledgeFolder' : 'bookmarkFolder'] || 'all');
function trail(kind) {
  const current = scope();
  if (owner !== current) {
    trails.clear();
    browsing.clear();
    owner = current;
    ++restoreNonce;
  }
  const key = kind + ':' + routeScope(kind);
  if (!trails.has(key)) trails.set(key, new CollectionLocationHistory());
  while (trails.size > 8) trails.delete(trails.keys().next().value);
  return trails.get(key);
}
export function collectionLocationAllowed(kind, frame) {
  if (kind === 'files') {
    const id = frame.values.fileProject || 'all',
      folder = frame.values.fileFolder;
    if (routeScope(kind) && id !== routeScope(kind)) return false;
    const project = visibleProjects().find(project => project.id === id && !project.archived);
    return id === 'all' ? !folder : !!project && (!folder || project.fileFolders?.some(item => item.id === folder && !item.archived));
  }
  const id = frame.values[kind === 'knowledge' ? 'knowledgeFolder' : 'bookmarkFolder'] || 'all';
  if (['all', 'root', ...(kind === 'knowledge' ? ['favorites', 'recent'] : [])].includes(id)) return true;
  return (kind === 'knowledge' ? D().knowledgeFolders : D().linkFolders || []).some(folder => folder.id === id);
}
function capture(kind) {
  const values =
    kind === 'files'
      ? captureFileLocation()
      : Object.fromEntries(
          fields[kind].map(field => [
            field,
            structuredClone(
              S.ui[field] ??
                (field.endsWith('Selection')
                  ? []
                  : field.endsWith('Offset')
                    ? 0
                    : field === 'knowledgeLimit'
                      ? 200
                      : field.endsWith('Folder')
                        ? 'all'
                        : field === 'bookmarkScope'
                          ? 'active'
                          : field === 'knowledgeSort'
                            ? 'updated'
                            : ''),
            ),
          ]),
        );
  if (kind === 'bookmarks') values.page = S.ui.listPages?.bookmarks || 0;
  const active = document.activeElement?.closest?.('[data-a]');
  return {
    key: collectionLocationKey(kind),
    values,
    scroll: ['.content', '.knowledge-main'].map(selector => ({ selector, top: document.querySelector(selector)?.scrollTop || 0 })),
    focus: active ? Object.fromEntries(['a', 'id', 'folder', 'project'].filter(key => active.dataset[key]).map(key => [key, active.dataset[key]])) : null,
  };
}
function apply(kind, frame) {
  if (kind === 'files') restoreFileLocation(frame.values);
  else {
    Object.assign(
      S.ui,
      Object.fromEntries(fields[kind].filter(field => Object.hasOwn(frame.values, field)).map(field => [field, structuredClone(frame.values[field])])),
    );
    if (kind === 'bookmarks') {
      S.ui.listPages ||= {};
      S.ui.listPages.bookmarks = frame.values.page || 0;
    }
  }
  if (kind === 'knowledge') {
    Object.assign(S.ui, { knowledgeDrawer: null, knowledgeMobileFolders: false });
    if (S.ui.knowledgeFolderOverlay) S.ui.knowledgeFolderNavOpen = false;
  }
}
function restorePosition(kind, frame) {
  const captured = scope(),
    key = collectionLocationKey(kind),
    route = JSON.stringify([S.ui.route, S.ui.params]),
    nonce = ++restoreNonce;
  const scroll = frame?.scroll || [
    { selector: '.content', top: 0 },
    { selector: '.knowledge-main', top: 0 },
  ];
  const started = performance.now();
  let settled = 0;
  clearTimeout(restoreTimer);
  pendingRestore = () => {
    if (captured !== scope() || key !== collectionLocationKey(kind) || route !== JSON.stringify([S.ui.route, S.ui.params]) || nonce !== restoreNonce) {
      pendingRestore = null;
      return;
    }
    const targets = scroll.map(item => ({ ...item, node: document.querySelector(item.selector) })).filter(item => item.node);
    const ready = targets.every(item => item.top <= item.node.scrollHeight - item.node.clientHeight + 2);
    const expired = performance.now() - started > 8000;
    // A cold result may temporarily have no height. Do not consume the saved
    // position by clamping it to zero before the requested rows arrive.
    if (ready || expired) {
      const matched = targets.every(item => Math.abs(item.node.scrollTop - Math.min(item.top, item.node.scrollHeight - item.node.clientHeight)) <= 2);
      for (const item of targets) item.node.scrollTop = item.top;
      settled = matched ? settled + 1 : 0;
    }
    if (!expired && settled < 2) {
      clearTimeout(restoreTimer);
      restoreTimer = setTimeout(() => pendingRestore?.(), 100);
      return;
    }
    pendingRestore = null;
    if (frame?.focus) {
      const selector = Object.entries(frame.focus)
        .map(([key, value]) => `[data-${key}="${CSS.escape(value)}"]`)
        .join('');
      const target = document.querySelector(selector);
      (target?.getClientRects().length ? target : document.getElementById('main-content'))?.focus({ preventScroll: true });
    }
  };
  requestAnimationFrame(() => pendingRestore?.());
}
export function beginCollectionBrowsing(kind) {
  browsing.set(kind, { scope: scope(), key: collectionLocationKey(kind), frame: capture(kind) });
}
export function closeCollectionBrowsing(kind) {
  const entry = browsing.get(kind);
  browsing.delete(kind);
  if (entry?.scope === scope() && entry.key === collectionLocationKey(kind)) restorePosition(kind, entry.frame);
}
window.addEventListener('smena:rendered', () => requestAnimationFrame(() => pendingRestore?.()));
const stopRestoring = () => {
  pendingRestore = null;
  clearTimeout(restoreTimer);
};
for (const event of ['pointerdown', 'wheel', 'touchmove', 'keydown']) document.addEventListener(event, stopRestoring, { capture: true, passive: true });
export function navigateCollection(kind, update, repaint) {
  const history = trail(kind),
    current = capture(kind);
  const entry = browsing.get(kind);
  browsing.delete(kind);
  if (entry?.scope === scope() && entry.key === current.key) {
    current.scroll = entry.frame.scroll;
    current.focus = entry.frame.focus;
  }
  update();
  let cached = history.enter(current, collectionLocationKey(kind));
  if (cached && !collectionLocationAllowed(kind, cached)) cached = null;
  if (cached) apply(kind, cached);
  repaint();
  restorePosition(kind, cached);
}
export function canReturnCollection(kind) {
  return trail(kind).canBack(collectionLocationKey(kind), frame => collectionLocationAllowed(kind, frame));
}
export function returnCollection(kind, repaint) {
  const frame = trail(kind).back(capture(kind), frame => collectionLocationAllowed(kind, frame));
  if (!frame) return false;
  apply(kind, frame);
  repaint();
  restorePosition(kind, frame);
  return true;
}
