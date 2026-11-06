import { setPersonalFavorite } from './actions.js';
import { noteTypes } from '../shared/knowledge-types.js';
import { bookmarkUrlKey } from '../shared/web-capture.js';
/* =====================================================================
   ACTIONS · INPUT HANDLERS · DRAG & DROP · KEYBOARD · INIT
   ===================================================================== */
import { $, esc, uid } from '../core/utils.js';

import { D, S, save } from '../core/store.js';

import { knowledgeDisplayParts } from '../shared/knowledge-frontmatter.js';

import { mutate, toast } from '../ui/toast.js';
import { focusKey, go, render } from '../shell/render.js';
import { closeModal, openModal } from '../overlays/modals.js';

import { getSessionGeneration } from '../core/api.js';

import { extractWikiLinks } from '../shared/knowledge-links.js';
import { updateKnowledgeSaveStatus, knowledgeEditBlocked } from '../ui/knowledge-save-status.js';
import { savedBookmarkView } from '../shared/bookmark-view.js';
import { bindWikiReferences, entityAllowed, RELATION_TYPES, resolveGraphEntity } from '../shared/relations.js';
import { graphOptions } from '../ui/relations.js';
import {
  renameKnowledgeFolder as renameKnowledgeFolderData,
  deleteKnowledgeFolder as deleteKnowledgeFolderData,
} from '../shared/knowledge-folder-operations.js';

import { isRussian, t } from '../core/i18n.js';

import { A, IN, BLUR, confirmDlg, moveToTrash, copy } from './actions.js';
function knowledgeCollections() {
  if (!Array.isArray(D().knowledgeNotes)) D().knowledgeNotes = [];
  if (!Array.isArray(D().knowledgeFolders)) D().knowledgeFolders = [];
  return { notes: D().knowledgeNotes, folders: D().knowledgeFolders };
}

const IMPORTANCE_LEVELS = new Set(['low', 'medium', 'high', 'critical']);

function bookmarkCollections() {
  if (!Array.isArray(D().links)) D().links = [];
  if (!Array.isArray(D().linkFolders)) D().linkFolders = [];
  return { links: D().links, folders: D().linkFolders };
}

function emptyBookmarkDraft(folder = '') {
  return { url: '', title: '', description: '', excerpt: '', readingStatus: 'unread', folder, tags: '', importance: 'medium' };
}

function normalizedBookmarkUrl(value) {
  const candidate = /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`;
  try {
    const parsed = new URL(candidate);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

/* ---------- knowledge base ---------- */
A.newKnowledgeNote = el => {
  if (S.ui.currentUser?.role === 'viewer' || knowledgeEditBlocked()) return;
  const hubSource = el?.dataset?.hubSource;
  if (hubSource && (!hubSource.startsWith('project:') || !entityAllowed(D(), hubSource, graphOptions(), true))) return;
  const selectedType = noteTypes(D().ws).find(t => t.id === el?.dataset?.typeId);
  mutate(() => {
    const { notes } = knowledgeCollections();
    const now = new Date().toISOString();
    const note = {
      id: uid('kn'),
      title: `${selectedType ? (isRussian() && selectedType.ru ? selectedType.ru : selectedType.name) : isRussian() ? 'Новая заметка' : 'New note'} ${notes.length + 1}`,
      category: 'General',
      typeId: selectedType?.id || 'note',
      summary: '',
      extracted_skills: [],
      tags: [],
      wikilinks: [],
      formatted_markdown: '',
      folderId:
        S.ui.knowledgeFolder &&
        !['all', 'root', 'favorites'].includes(S.ui.knowledgeFolder) &&
        knowledgeCollections().folders.some(folder => folder.id === S.ui.knowledgeFolder)
          ? S.ui.knowledgeFolder
          : null,
      favorite: false,
      createdBy: D().me,
      updatedBy: D().me,
      createdAt: now,
      updatedAt: now,
    };
    if (hubSource) {
      note.folderId = null;
      D().relations ||= [];
      D().relations.push({ id: uid('rel'), from: hubSource, to: `note:${note.id}`, type: 'related', createdBy: D().me, createdAt: now });
    }
    notes.unshift(note);
    S.ui.knowledgeActive = null;
    S.ui.knowledgeDrawer = note.id;
    S.ui.knowledgeDrawerView = 'edit';
    S.ui.knowledgeQuery = '';
  });
};
export async function importKnowledgeFiles(files, folderId = S.ui.knowledgeFolder, previous = null) {
  if (!files?.length || !['admin', 'editor'].includes(S.ui.currentUser?.role) || S.ui.knowledgeImportReading || knowledgeEditBlocked()) return;
  const { knowledgeCatalogMode } = await import('../core/api.js');
  if (knowledgeCatalogMode() && !previous) return (await import('../features/knowledge-import-queue.js')).openKnowledgeImportQueue(files, folderId);
  const owner = S.ui.currentUser.id;
  const workspace = D().ws.id || D().ws.url;
  const destination = knowledgeCollections().folders.some(folder => folder.id === folderId) ? folderId : null;
  const controller = new AbortController();
  S.ui.knowledgeImportAbort = controller;
  S.ui.knowledgeImportOwner = JSON.stringify([owner, workspace]);
  S.ui.knowledgeImportReading = true;
  S.ui.knowledgeImportStatus = '';
  render();
  try {
    const [{ reviewKnowledgeImportQueue }, { mergePortableWorkspace }, { jsonByteLength, WORKSPACE_TRANSPORT_MAX_BYTES }] = await Promise.all([
      import('../shared/knowledge-import.js'),
      import('../shared/portable-workspace.js'),
      import('../shared/workspace-size.js'),
    ]);
    if (owner !== S.ui.currentUser?.id || workspace !== (D().ws.id || D().ws.url)) return;
    const review = await reviewKnowledgeImportQueue(files, {
      signal: controller.signal,
      idFactory: uid,
      memberId: D().me,
      folderId: destination,
      onProgress: (done, total) => {
        if (owner !== S.ui.currentUser?.id || workspace !== (D().ws.id || D().ws.url)) return;
        document.querySelector('[data-knowledge-import-progress]')?.replaceChildren(document.createTextNode(`${t('Reading note files…')} ${done} / ${total}`));
      },
    });
    if (owner !== S.ui.currentUser?.id || workspace !== (D().ws.id || D().ws.url)) return;
    const payload = { notes: [...(previous?.payload.notes || []), ...review.payload.notes] };
    let retryIndex = 0;
    const entries = previous ? previous.entries.map(entry => (entry.error ? review.entries[retryIndex++] : entry)) : review.entries;
    if (jsonByteLength({ payload }) > WORKSPACE_TRANSPORT_MAX_BYTES - 4096) throw new Error('The import file must be smaller than 4 MB.');
    S.ui.knowledgeMobileFolders = false;
    S.ui.importPreview = {
      payload,
      entries,
      files: previous?.files || Array.from(files),
      batches: Math.ceil((previous?.files || files).length / 50),
      destination,
      policy: 'copy',
      result: mergePortableWorkspace(D(), payload),
      busy: false,
    };
    openModal({ type: 'portableImport' });
  } catch (error) {
    if (owner === S.ui.currentUser?.id && workspace === (D().ws.id || D().ws.url)) {
      S.ui.knowledgeImportStatus = controller.signal.aborted
        ? 'Import canceled. Nothing was saved.'
        : error instanceof Error
          ? error.message
          : 'Note files could not be imported.';
      toast(S.ui.knowledgeImportStatus, { kind: 'err', ms: 6000 });
      if (previous) {
        S.ui.importPreview = previous;
        openModal({ type: 'portableImport' });
      }
    }
  } finally {
    if (owner === S.ui.currentUser?.id && workspace === (D().ws.id || D().ws.url) && S.ui.knowledgeImportAbort === controller) {
      S.ui.knowledgeImportReading = false;
      S.ui.knowledgeImportAbort = null;
      render();
    }
  }
}
A.cancelKnowledgeImport = () => S.ui.knowledgeImportAbort?.abort();
A.retryKnowledgeImport = () => {
  const previous = S.ui.importPreview;
  if (!previous?.files || previous.busy) return;
  const failed = previous.files.filter((_, index) => previous.entries[index]?.error);
  if (!failed.length) return;
  closeModal();
  return importKnowledgeFiles(failed, previous.destination, previous);
};
IN.importKnowledgeMarkdown = el => {
  const files = [...(el.files || [])];
  el.value = '';
  return importKnowledgeFiles(files);
};
A.openKnowledgeNote = el => {
  if (!S.ui.knowledgeDrawer) S.ui.knowledgeDrawerOpener = el.isConnected ? focusKey(el) : S.ui.knowledgeDrawerOpener;
  S.ui.knowledgeDrawer = el.dataset.id;
  S.ui.knowledgeDrawerView = 'preview';
  S.ui.knowledgeActive = null;
  if (el.classList.contains('knowledge-relation')) {
    S.ui.knowledgeQuery = '';
    S.ui.knowledgeFolder = 'all';
  }
  render();
  if (S.ui.knowledgeDrawer) {
    const drawer = $('.knowledge-drawer');
    if (drawer && !drawer.contains(document.activeElement)) drawer.focus({ preventScroll: true });
  }
};
A.previewKnowledgeNote = el => {
  if (!el.dataset.id) return;
  S.ui.knowledgeDrawer = el.dataset.id;
  S.ui.knowledgeDrawerView = 'preview';
  S.ui.knowledgeActive = null;
  S.ui.knowledgeDrawerOpener = el.isConnected ? focusKey(el) : S.ui.knowledgeDrawerOpener;
  render();
  const drawer = $('.knowledge-drawer');
  if (drawer) drawer.focus({ preventScroll: true });
};
A.goKnowledgeNote = el => {
  if (!D().knowledgeNotes.some(note => note.id === el.dataset.id)) return;
  // Command results can open the reader before the knowledge feature is loaded.
  if (typeof el.dataset.query === 'string') {
    const query = el.dataset.query.trim().slice(0, 1000);
    S.ui.knowledgeFind = query ? { query, owner: S.ui.currentUser?.id, workspace: D().ws.id || D().ws.url, index: 0 } : null;
  }
  S.ui.palette = null;
  S.ui.pop = null;
  A.previewKnowledgeNote(el);
};
A.setKnowledgePresentation = () => {
  // Kept for old deep links; the knowledge base now always uses panel view.
  S.ui.knowledgePresentation = 'drawer';
  render();
};
A.clearSearchInput = el => {
  if (!['search-page-q', 'bookmark-search'].includes(el.dataset.input)) return;
  const input = document.getElementById(el.dataset.input);
  if (!input) return;
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById(el.dataset.input)?.focus({ preventScroll: true });
};
A.closeKnowledgeDrawer = () => {
  S.ui.knowledgeWikiTrail = [];
  S.ui.knowledgeDrawer = null;
  render();
  if (!document.activeElement || document.activeElement === document.body) document.querySelector('[data-in="knowledgeQuery"]')?.focus();
};
A.followKnowledgeWiki = el => {
  if (S.ui.knowledgeDirty) return toast('Save the note before navigating.', { kind: 'info' });
  if (S.ui.knowledgeDrawer !== el.dataset.source || !D().knowledgeNotes.some(note => note.id === el.dataset.id)) return;
  S.ui.knowledgeWikiTrail = [
    ...(S.ui.knowledgeWikiTrail || []),
    { id: el.dataset.source, scroll: document.querySelector('.knowledge-drawer-body')?.scrollTop || 0 },
  ].slice(-20);
  S.ui.knowledgeDrawer = el.dataset.id;
  S.ui.knowledgeDrawerView = 'preview';
  render();
  document.querySelector('[data-a="backKnowledgeWiki"]')?.focus();
};
A.backKnowledgeWiki = () => {
  if (S.ui.knowledgeDirty) return toast('Save the note before navigating.', { kind: 'info' });
  const previous = S.ui.knowledgeWikiTrail?.pop();
  if (!previous || !D().knowledgeNotes.some(note => note.id === previous.id)) return;
  S.ui.knowledgeDrawer = previous.id;
  S.ui.knowledgeDrawerView = 'preview';
  render();
  document.querySelector('.knowledge-drawer-body')?.scrollTo(0, previous.scroll);
  document.querySelector('.knowledge-drawer [data-a="closeKnowledgeDrawer"]')?.focus();
};
A.editKnowledgeNote = () => {
  S.ui.knowledgeDrawerView = 'edit';
  render();
  document.getElementById('knowledge-title')?.focus();
};
A.retryKnowledgeBody = async el => {
  const note = D().knowledgeNotes.find(item => item.id === el.dataset.id);
  if (!note) return;
  const { ensureKnowledgeBody } = await import('../core/knowledge-bodies.js');
  const pending = ensureKnowledgeBody(note, true);
  render();
  try {
    await pending;
  } catch {
    /* The reader offers another retry. */
  }
  render();
};
A.toggleKnowledgeFavorite = el => {
  setPersonalFavorite(
    'note',
    knowledgeCollections().notes.find(item => item.id === el.dataset.id),
  );
};

A.setKnowledgeFolder = el => {
  const compactNavigation = !!S.ui.knowledgeFolderOverlay;
  S.ui.knowledgeOffset = 0;
  S.ui.knowledgeMobileFolders = false;
  S.ui.knowledgeDrawer = null;
  S.ui.knowledgeFolder = el.dataset.folder || 'all';
  S.ui.knowledgeRevealFolder = S.ui.knowledgeFolder;
  S.ui.knowledgeFolderCardQuery = '';
  S.ui.knowledgeFolderCardOffset = 0;
  S.ui.knowledgeActive = null;
  S.ui.knowledgeLimit = 200;
  S.ui.knowledgeTag = '';
  if (compactNavigation) {
    S.ui.knowledgeFolderNavOpen = false;
    S.ui.knowledgeFolderQuery = '';
  }
  if (S.ui.knowledgeFolder && !['all', 'root', 'favorites'].includes(S.ui.knowledgeFolder)) {
    const folders = knowledgeCollections().folders;
    const collapsed = { ...(S.ui.knowledgeCollapsedFolders || {}) };
    const byId = new Map(folders.map(folder => [folder.id, folder]));
    const seen = new Set();
    let current = byId.get(S.ui.knowledgeFolder);
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      delete collapsed[current.id];
      current = byId.get(current.parentId);
    }
    S.ui.knowledgeCollapsedFolders = collapsed;
  }
  render();
  // The mobile folder sheet disappears after navigation. Move focus to the
  // destination instead of leaving keyboard/screen-reader users on the body.
  if (compactNavigation) document.getElementById('knowledge-view-title')?.focus({ preventScroll: true });
};
A.toggleKnowledgeFolder = el => {
  const id = el.dataset.folder;
  if (!id) return;
  const collapsed = S.ui.knowledgeCollapsedFolders || {};
  S.ui.knowledgeCollapsedFolders = { ...collapsed, [id]: !collapsed[id] };
  render();
};
A.expandKnowledgeFolders = () => {
  S.ui.knowledgeCollapsedFolders = {};
  render();
};
A.toggleKnowledgeFolderNav = () => {
  S.ui.knowledgeFolderNavOpen = S.ui.knowledgeFolderNavOpen !== false ? false : true;
  render();
};
A.collapseKnowledgeFolders = () => {
  S.ui.knowledgeCollapsedFolders = Object.fromEntries(knowledgeCollections().folders.map(folder => [folder.id, true]));
  render();
};
A.clearKnowledgeTag = () => {
  S.ui.knowledgeOffset = 0;
  S.ui.knowledgeTag = '';
  S.ui.knowledgeActive = null;
  S.ui.knowledgeLimit = 200;
  render();
};
A.clearKnowledgeQuery = () => {
  S.ui.knowledgeOffset = 0;
  S.ui.knowledgeQuery = '';
  S.ui.knowledgeActive = null;
  S.ui.knowledgeLimit = 200;
  render();
  document.getElementById('knowledge-search')?.focus({ preventScroll: true });
};
A.loadMoreKnowledge = () => {
  S.ui.knowledgeLimit = Math.min(1000, (S.ui.knowledgeLimit || 200) + 200);
  render();
};
A.knowledgePage = el => {
  S.ui.knowledgeOffset = Math.max(0, Number(el.dataset.offset) || 0);
  render();
  document.querySelector('.knowledge-main')?.scrollTo(0, 0);
};
A.newKnowledgeFolder = el => {
  if (S.ui.currentUser?.role === 'viewer' || knowledgeEditBlocked()) return;
  const owner = S.ui.currentUser?.id,
    workspace = D().ws?.id;
  const requestedParent = el?.dataset?.parent ?? S.ui.knowledgeFolder;
  const parentId = knowledgeCollections().folders.some(folder => folder.id === requestedParent) ? requestedParent : null;
  openModal({
    type: 'prompt',
    title: 'New knowledge folder',
    label: 'Folder name',
    value: '',
    run: value => {
      if (knowledgeEditBlocked() || owner !== S.ui.currentUser?.id || workspace !== D().ws?.id) return;
      const name = value.trim();
      if (!name) return;
      mutate(() => {
        const { folders } = knowledgeCollections();
        if (parentId && !folders.some(folder => folder.id === parentId)) return toast('The destination folder no longer exists.', { kind: 'err' });
        if (folders.some(folder => (folder.parentId || null) === parentId && folder.name.toLowerCase() === name.toLowerCase()))
          return toast('A folder with this name already exists here.', { kind: 'err' });
        const folder = { id: uid('kf'), name, parentId, createdAt: new Date().toISOString() };
        folders.push(folder);
        S.ui.knowledgeFolder = folder.id;
        S.ui.knowledgeRevealFolder = folder.id;
        S.ui.knowledgeFolderCardQuery = '';
        S.ui.knowledgeFolderCardOffset = 0;
        S.ui.knowledgeMobileFolders = false;
      });
    },
  });
};
A.deleteKnowledgeNote = el => {
  const note = knowledgeCollections().notes.find(item => item.id === el.dataset.id);
  if (!note) return;
  confirmDlg({
    title: 'Delete note?',
    body: `<b>${esc(note.title)}</b> will be moved to trash.`,
    ok: 'Move to trash',
    danger: true,
    run: async () => {
      if (note.bodyPending) return (await import('../features/knowledge-trash.js')).knowledgeTrashOperation([note.id]);
      return mutate(() => {
        moveToTrash('note', note.title, { note: structuredClone(note) });
        D().knowledgeNotes = knowledgeCollections().notes.filter(item => item.id !== note.id);
        S.ui.knowledgeActive = D().knowledgeNotes[0]?.id || null;
        if (S.ui.knowledgeDrawer === note.id) S.ui.knowledgeDrawer = null;
      });
    },
  });
};
IN.knowledgeQuery = el => {
  S.ui.knowledgeOffset = 0;
  S.ui.knowledgeQuery = el.value;
  render();
  requestAnimationFrame(() => {
    const input = document.querySelector('[data-in="knowledgeQuery"]');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });
};
IN.knowledgeFolder = el => {
  S.ui.knowledgeFolder = el.value;
  S.ui.knowledgeActive = null;
  S.ui.knowledgeLimit = 200;
  S.ui.knowledgeTag = '';
  render();
};
IN.knowledgeFolderQuery = el => {
  S.ui.knowledgeFolderQuery = el.value;
  S.ui.knowledgeFolderNavOffset = 0;
  S.ui.knowledgeRevealFolder = null;
  render();
  requestAnimationFrame(() => {
    const input = document.querySelector('[data-in="knowledgeFolderQuery"]');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });
};
IN.knowledgeSort = el => {
  S.ui.knowledgeOffset = 0;
  S.ui.knowledgeSort = el.value === 'title' ? 'title' : 'updated';
  S.ui.knowledgeActive = null;
  render();
};
IN.knowledgeTag = el => {
  S.ui.knowledgeOffset = 0;
  S.ui.knowledgeTag = el.value || '';
  S.ui.knowledgeActive = null;
  S.ui.knowledgeLimit = 200;
  render();
};
A.setKnowledgeTag = el => {
  S.ui.knowledgeTag = el.dataset.tag || '';
  S.ui.knowledgeActive = null;
  S.ui.knowledgeLimit = 200;
  render();
};
A.renameKnowledgeFolder = el => {
  if (S.ui.currentUser?.role === 'viewer' || knowledgeEditBlocked()) return;
  const owner = S.ui.currentUser?.id,
    workspace = D().ws?.id;
  const folder = knowledgeCollections().folders.find(item => item.id === el.dataset.folder);
  if (!folder) return;
  openModal({
    type: 'prompt',
    title: 'Rename knowledge folder',
    label: 'Folder name',
    value: folder.name,
    run: value => {
      if (knowledgeEditBlocked() || owner !== S.ui.currentUser?.id || workspace !== D().ws?.id) return;
      const name = value.trim();
      const current = knowledgeCollections().folders.find(item => item.id === folder.id);
      if (!current) return toast('This folder changed. Reopen its actions.', { kind: 'info' });
      if (!name || name === current.name) return;
      mutate(() => {
        const result = renameKnowledgeFolderData(knowledgeCollections().folders, current.id, name);
        if (!result.ok) toast('A folder with this name already exists here.', { kind: 'err' });
      });
    },
  });
};
A.deleteKnowledgeFolder = el => {
  if (S.ui.currentUser?.role === 'viewer' || knowledgeEditBlocked()) return;
  const owner = S.ui.currentUser?.id,
    workspace = D().ws?.id;
  const { folders, notes } = knowledgeCollections();
  const folder = folders.find(item => item.id === el.dataset.folder);
  if (!folder) return;
  const childCount = folders.filter(item => item.parentId === folder.id).length;
  const noteCount = notes.filter(note => note.folderId === folder.id).length;
  confirmDlg({
    title: 'Delete knowledge folder?',
    body: `<b>${esc(folder.name)}</b> will be removed. ${noteCount || childCount ? 'Notes and subfolders will move to its parent.' : ''}`,
    ok: 'Delete folder',
    danger: true,
    run: () => {
      if (knowledgeEditBlocked() || owner !== S.ui.currentUser?.id || workspace !== D().ws?.id) return;
      mutate(() => {
        const result = deleteKnowledgeFolderData(D(), folder.id, D().me);
        if (!result.ok)
          return toast(
            result.reason === 'collision' ? 'Rename conflicting subfolders before deleting this folder.' : 'This folder changed. Reopen its actions.',
            { kind: 'err' },
          );
        if (S.ui.knowledgeFolder === folder.id) S.ui.knowledgeFolder = result.parentId || 'all';
        S.ui.knowledgeFolderCardOffset = 0;
        S.ui.knowledgeActive = null;
      });
    },
  });
};
IN.knowledgeField = el => {
  if (S.ui.atomicOperation || S.ui.currentUser?.role === 'viewer' || knowledgeEditBlocked()) return;
  const note = knowledgeCollections().notes.find(item => item.id === el.dataset.id);
  if (!note) return;
  bindWikiReferences(D().knowledgeNotes);
  const field = el.dataset.field;
  const before = field === 'tags' ? (note.tags || []).join(', ') : note[field] || '';
  if (before === el.value) return;
  // Preserve recognized legacy provenance on an actual edit, before changing
  // its corroborating fields. Reading alone never migrates notes.
  if (!note.sourceFormat && knowledgeDisplayParts(note).metadata) note.sourceFormat = 'markdown';
  if (field === 'tags')
    note.tags = [
      ...new Set(
        el.value
          .split(',')
          .map(value => value.trim())
          .filter(Boolean),
      ),
    ];
  else note[field] = el.value || (field === 'folderId' ? null : '');
  if (field === 'formatted_markdown') note.wikilinks = extractWikiLinks(note.formatted_markdown);
  if (field === 'formatted_markdown') bindWikiReferences(D().knowledgeNotes);
  note.updatedAt = new Date().toISOString();
  note.updatedBy = D().me;
  S.ui.knowledgeDirty = true;
  save();
  updateKnowledgeSaveStatus();
  if (el.matches('select')) render();
};
BLUR.knowledgeField = el => {
  IN.knowledgeField(el);
  // WebKit may leave focus on body between pointerdown and click. Replacing the
  // editor on blur cancels that click. Closing the reader renders the updated list.
};

/* ---------- shared bookmarks ---------- */
async function hydrateRelatedFiles(keys) {
  const ids = keys.filter(key => key.startsWith('file:') && !resolveGraphEntity(D(), key)).map(key => key.slice(5));
  if (!ids.length) return true;
  const session = getSessionGeneration();
  const route = JSON.stringify([S.ui.route, S.ui.params]),
    modal = S.ui.modals.at(-1);
  try {
    await (await import('../features/file-catalog-demand.js')).ensureFileIdentities(ids);
    return session === getSessionGeneration() && route === JSON.stringify([S.ui.route, S.ui.params]) && modal === S.ui.modals.at(-1);
  } catch {
    if (session === getSessionGeneration()) toast('Unable to load files. Check connection and retry.');
    return false;
  }
}
A.addRelationPicker = async el => {
  const key = el.dataset.key;
  if (!(await hydrateRelatedFiles([key]))) return;
  if (!entityAllowed(D(), key, graphOptions(), true)) return;
  openModal({ type: 'relations', source: key, query: '', kind: '', relationType: 'related' });
};
A.resolveWikiReference = el => {
  if (!entityAllowed(D(), el.dataset.key, graphOptions(), true)) return;
  openModal({ type: 'relations', source: el.dataset.key, query: '', kind: 'note', relationType: 'source', wikiLabel: el.dataset.label });
};
IN.relationQuery = el => {
  S.ui.modals.at(-1).query = el.value;
  render();
};
IN.relationKind = el => {
  S.ui.modals.at(-1).kind = el.value;
  render();
};
IN.relationType = el => {
  S.ui.modals.at(-1).relationType = el.value;
};
A.createRelation = async el => {
  const modal = S.ui.modals.at(-1);
  if (modal?.type !== 'relations' || !Object.hasOwn(RELATION_TYPES, modal.relationType)) return;
  if (modal.inline) {
    if (!(await hydrateRelatedFiles([el.dataset.key])) || S.ui.modals.at(-1) !== modal) return;
    return (await import('../features/knowledge-inline.js')).insertInlineTarget(modal, el.dataset.key);
  }
  const from = modal.source,
    to = el.dataset.key;
  if (!(await hydrateRelatedFiles([from, to])) || S.ui.modals.at(-1) !== modal) return;
  if (from === to || ![from, to].every(key => entityAllowed(D(), key, graphOptions(), true))) return;
  if (modal.wikiLabel && (!from.startsWith('note:') || !to.startsWith('note:'))) return;
  mutate(() => {
    if (modal.wikiLabel) {
      const note = resolveGraphEntity(D(), from).item;
      bindWikiReferences(D().knowledgeNotes);
      const reference = note.wikiRefs?.find(ref => ref.label === modal.wikiLabel);
      if (reference) reference.target = resolveGraphEntity(D(), to).id;
      S.ui.modals.pop();
      return;
    }
    D().relations ||= [];
    if (!D().relations.some(edge => !edge.deletedAt && edge.from === from && edge.to === to && edge.type === modal.relationType))
      D().relations.push({ id: uid('rel'), from, to, type: modal.relationType, createdBy: D().me, createdAt: new Date().toISOString() });
    S.ui.modals.pop();
  });
};
A.removeRelation = async el => {
  let edge = D().relations?.find(item => item.id === el.dataset.id);
  if (!edge || !(await hydrateRelatedFiles([edge.from, edge.to]))) return;
  edge = D().relations?.find(item => item.id === el.dataset.id);
  if (!edge || ![edge.from, edge.to].every(key => entityAllowed(D(), key, graphOptions(), true))) return;
  mutate(() => {
    edge.deletedAt = new Date().toISOString();
  });
};
A.openRelatedEntity = async el => {
  const key = el.dataset.key;
  const opener = focusKey(el.isConnected ? el : document.activeElement);
  if (!(await hydrateRelatedFiles([key]))) return;
  if (!entityAllowed(D(), key, graphOptions())) return;
  const entity = resolveGraphEntity(D(), key);
  S.ui.modals = [];
  S.ui.drawer = null;
  if (entity.kind === 'note') {
    S.ui.knowledgeDrawerOpener = opener;
    A.goKnowledgeNote({ dataset: { id: entity.id } });
  } else if (entity.kind === 'bookmark') A.goBookmark({ dataset: { id: entity.id } });
  else if (entity.kind === 'file') A.previewFile({ dataset: { id: entity.id } });
  else if (entity.kind === 'task') {
    S.ui.drawerOpener = opener;
    A.openTask({ dataset: { id: entity.id } });
  } else if (entity.kind === 'whiteboard') go('whiteboard', { id: entity.id });
  else go('project', { id: entity.id });
};
A.showGraph = async el => (await import('../features/graph-actions.js')).showGraph(el);
A.searchInGraph = async () => (await import('../features/graph-actions.js')).searchInGraph();
A.exportGraph = async () => (await import('../features/graph-export.js')).exportGraph();
A.newBookmark = () => {
  S.ui.bookmarkEditing = null;
  S.ui.bookmarkDraft = emptyBookmarkDraft(S.ui.bookmarkFolder !== 'all' && S.ui.bookmarkFolder !== 'root' ? S.ui.bookmarkFolder : '');
  S.ui.bookmarkForm = true;
  render();
  requestAnimationFrame(() => document.getElementById('bookmark-url')?.focus());
};
A.closeBookmarkForm = () => {
  S.ui.bookmarkForm = false;
  S.ui.bookmarkEditing = null;
  S.ui.bookmarkDraft = emptyBookmarkDraft();
  render();
};
A.editBookmark = el => {
  const link = bookmarkCollections().links.find(item => item.id === el.dataset.id);
  if (!link || S.ui.currentUser?.role === 'viewer') return;
  S.ui.bookmarkEditing = link.id;
  S.ui.bookmarkDraft = {
    url: link.url || '',
    title: link.title || '',
    description: link.description || '',
    folder: link.folder || '',
    tags: (link.tags || []).join(', '),
    importance: link.importance || 'medium',
    excerpt: link.excerpt || '',
    readingStatus: link.readingStatus || (link.is_read ? 'done' : 'unread'),
  };
  S.ui.bookmarkForm = true;
  render();
  requestAnimationFrame(() => document.getElementById('bookmark-title')?.focus());
};
A.saveBookmark = () => {
  if (S.ui.currentUser?.role === 'viewer') return;
  if (S.ui.bookmarkEditing && !bookmarkCollections().links.some(link => link.id === S.ui.bookmarkEditing)) {
    toast('This bookmark no longer exists. Refresh the list and try again.', { kind: 'error' });
    return;
  }
  const draft = S.ui.bookmarkDraft;
  const parsed = normalizedBookmarkUrl(draft.url);
  if (!parsed) {
    toast('Enter a valid HTTP or HTTPS URL.', { kind: 'error' });
    document.getElementById('bookmark-url')?.focus();
    return;
  }
  if (bookmarkCollections().links.some(link => link.id !== S.ui.bookmarkEditing && bookmarkUrlKey(link.url) === bookmarkUrlKey(parsed.toString()))) {
    toast(
      isRussian()
        ? 'Этот адрес уже есть в закладках. Найдите и измените существующую запись.'
        : 'This URL is already bookmarked. Find and edit the existing item.',
      { kind: 'err' },
    );
    return;
  }
  const tags = [
    ...new Set(
      String(draft.tags || '')
        .split(',')
        .map(value => value.trim().toLowerCase().replace(/^#/, ''))
        .filter(Boolean),
    ),
  ];
  mutate(() => {
    const { links } = bookmarkCollections();
    const now = new Date().toISOString();
    const values = {
      url: parsed.toString(),
      title: draft.title.trim() || parsed.hostname.replace(/^www\./, ''),
      description: draft.description.trim(),
      excerpt: String(draft.excerpt || '').slice(0, 8000),
      readingStatus: ['unread', 'reading', 'done'].includes(draft.readingStatus) ? draft.readingStatus : 'unread',
      site_name: parsed.hostname.replace(/^www\./, ''),
      preview_image: '',
      favicon_url: '',
      folder: draft.folder || '',
      importance: IMPORTANCE_LEVELS.has(draft.importance) ? draft.importance : 'medium',
      tags,
      updated_at: now,
    };
    const existing = links.find(item => item.id === S.ui.bookmarkEditing);
    if (existing) Object.assign(existing, values, { is_read: values.readingStatus === 'done' });
    else
      links.unshift({
        id: uid('ln'),
        ...values,
        is_archived: false,
        is_read: draft.readingStatus === 'done',
        health_status: 'unknown',
        created_at: now,
      });
    S.ui.bookmarkForm = false;
    S.ui.bookmarkEditing = null;
    S.ui.bookmarkDraft = emptyBookmarkDraft();
    Object.assign(S.ui, savedBookmarkView(existing || { ...values, is_archived: false }, S.ui.bookmarkFolder));
  });
};
A.newBookmarkFolder = () => {
  if (S.ui.currentUser?.role === 'viewer') return;
  openModal({
    type: 'prompt',
    title: 'New bookmark folder',
    label: 'Folder name',
    value: '',
    run: value => {
      const name = value.trim();
      if (!name) return;
      mutate(() => {
        const { folders } = bookmarkCollections();
        const existing = folders.find(folder => folder.name.toLowerCase() === name.toLowerCase());
        if (existing) {
          S.ui.bookmarkFolder = existing.id;
          return;
        }
        const palette = ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#EC4899'];
        const folder = { id: uid('lf'), name, parent_id: null, color: palette[folders.length % palette.length], created_at: new Date().toISOString() };
        folders.push(folder);
        S.ui.bookmarkFolder = folder.id;
      });
    },
  });
};
A.toggleBookmarkRead = el => {
  mutate(() => {
    const link = bookmarkCollections().links.find(item => item.id === el.dataset.id);
    if (link) {
      link.is_read = !link.is_read;
      link.readingStatus = link.is_read ? 'done' : 'unread';
      link.updated_at = new Date().toISOString();
    }
  });
};
A.toggleBookmarkArchive = el => {
  mutate(() => {
    const link = bookmarkCollections().links.find(item => item.id === el.dataset.id);
    if (link) {
      link.is_archived = !link.is_archived;
      link.updated_at = new Date().toISOString();
    }
  });
};
A.copyBookmark = el => {
  const link = bookmarkCollections().links.find(item => item.id === el.dataset.id);
  if (link) copy(link.url, 'Link copied');
};
A.goBookmark = el => {
  const link = bookmarkCollections().links.find(item => item.id === el.dataset.id);
  if (!link) return;
  S.ui.bookmarkQuery = link.title || link.url;
  S.ui.bookmarkFolder = 'all';
  S.ui.bookmarkScope = link.is_archived ? 'archived' : 'active';
  go('bookmarks');
};
A.deleteBookmark = el => {
  const link = bookmarkCollections().links.find(item => item.id === el.dataset.id);
  if (!link) return;
  confirmDlg({
    title: 'Delete bookmark?',
    body: `<b>${esc(link.title)}</b> will be moved to trash.`,
    ok: 'Move to trash',
    danger: true,
    run: () =>
      mutate(() => {
        moveToTrash('bookmark', link.title, { link: structuredClone(link) });
        D().links = bookmarkCollections().links.filter(item => item.id !== link.id);
      }),
  });
};
IN.bookmarkQuery = el => {
  S.ui.bookmarkQuery = el.value;
  render();
  requestAnimationFrame(() => {
    const input = document.querySelector('[data-in="bookmarkQuery"]');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });
};
IN.bookmarkFolder = el => {
  S.ui.bookmarkFolder = el.value;
  render();
};
IN.bookmarkDraft = el => {
  S.ui.bookmarkDraft[el.dataset.field] = el.value;
};
