import { A, IN, confirmDlg, moveToTrash, importKnowledgeFiles } from '../actions/actions.js';
import { D, S, flushLocalSave } from '../core/store.js';
import { mutate, toast } from '../ui/toast.js';
import { moveKnowledgeFolder, moveKnowledgeFolders, folderDescendants } from '../shared/knowledge-tools.js';
import { render } from '../shell/render.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { moveKnowledgeNotes } from '../shared/knowledge-note-move.js';
import { toggleKnowledgePageSelection } from '../shared/knowledge-selection.js';
import { uid, esc } from '../core/utils.js';
import { saveKnowledgePreferences } from '../core/knowledge-preferences.js';
import { historyContent, knowledgeVersionChanges, KNOWLEDGE_VERSION_FIELDS } from '../shared/knowledge-history.js';
import { workspaceSyncIsClean } from '../core/workspace-sync.js';
import { knowledgeFolderOverlay } from '../shared/knowledge-layout.js';
import { knowledgePreviewNavigation } from '../shared/knowledge-preview-navigation.js';
import { knowledgeHeadingSlug } from '../shared/knowledge-markdown.js';
A.knowledgeAnchor = (el, event) => {
  event?.preventDefault();
  const content = el.closest('.knowledge-quick-content');
  let target = content?.querySelector(`[data-knowledge-heading="${CSS.escape(el.dataset.anchor || '')}"]`);
  const title = content?.closest('.knowledge-quick-preview')?.querySelector('.knowledge-reader-title');
  if (!target && title && knowledgeHeadingSlug(title.textContent) === el.dataset.anchor) {
    target = title;
    target.tabIndex = -1;
  }
  if (!target) return toast('Section not found in this note.', { kind: 'info' });
  target.scrollIntoView({ block: 'start', behavior: 'auto' });
  target.focus({ preventScroll: true });
};
const canRestoreKnowledge = () => {
  if (workspaceSyncIsClean(S.data)) return true;
  flushLocalSave();
  toast('Wait until all changes are saved before restoring a version.', { kind: 'info' });
  return false;
};
A.restoreKnowledgeVersion = el => {
  if (S.ui.currentUser?.role === 'viewer' || knowledgeEditBlocked() || !canRestoreKnowledge()) return;
  const note = D().knowledgeNotes.find(note => note.id === el.dataset.id);
  const version = note?.history?.find(version => version.id === el.dataset.version);
  if (!version) return;
  const changes = knowledgeVersionChanges(note, version, D().knowledgeFolders);
  if (!changes.fields.length) return toast('No changes to restore.', { kind: 'info' });
  const base = JSON.stringify(historyContent(note, D().knowledgeFolders));
  const target = JSON.stringify(changes.restored);
  confirmDlg({
    title: 'Restore this note version?',
    body: `<span translate="no">${esc(version.title)}</span><br><span>The current content will become a previous version after synchronization.</span><br><b>Fields to restore</b>: ${changes.fields.map(field => esc(t(KNOWLEDGE_VERSION_FIELDS[field]))).join(', ')}${changes.missingFolder ? '<br><strong>The original folder no longer exists. This version will be restored without a folder.</strong>' : ''}`,
    ok: 'Restore version',
    run: () => {
      if (S.ui.currentUser?.role === 'viewer' || knowledgeEditBlocked() || !canRestoreKnowledge()) return;
      // A refresh may have replaced the document while confirmation was open.
      const current = D().knowledgeNotes.find(item => item.id === note.id);
      const saved = current?.history?.find(item => item.id === version.id);
      if (!saved) return toast('This version is no longer available. Reopen version history.', { kind: 'info' });
      if (JSON.stringify(historyContent(current, D().knowledgeFolders)) !== base || JSON.stringify(historyContent(saved, D().knowledgeFolders)) !== target)
        return toast('The note changed. Reopen version history before restoring.', { kind: 'info' });
      mutate(() => {
        Object.assign(current, historyContent(saved, D().knowledgeFolders), {
          updatedAt: new Date().toISOString(),
          updatedBy: D().me,
          restoreFromVersion: saved.id,
        });
      });
    },
  });
};
for (const name of ['openKnowledgeNote', 'previewKnowledgeNote', 'goKnowledgeNote']) {
  const original = A[name];
  A[name] = (...args) => {
    const opener = args[0];
    const grid = name === 'openKnowledgeNote' && opener?.matches?.('.knowledge-preview-open') && opener.closest('.knowledge-preview-grid');
    const results = name === 'goKnowledgeNote' && opener?.closest?.('.search-page');
    S.ui.knowledgePreviewContext =
      grid || results
        ? {
            owner: S.ui.currentUser?.id,
            workspace: D().ws.id || D().ws.url,
            ids: [...(grid || results).querySelectorAll(grid ? '.knowledge-preview-card[data-id]' : '[data-a="goKnowledgeNote"][data-id]')]
              .map(card => card.dataset.id)
              .slice(0, 60),
          }
        : null;
    original(...args);
    const id = S.ui.knowledgeDrawer;
    if (id) {
      S.ui.knowledgeRecent = [id, ...(S.ui.knowledgeRecent || []).filter(item => item !== id)].slice(0, 50);
      saveKnowledgePreferences();
    }
  };
}
A.stepKnowledgePreview = el => {
  if (S.ui.knowledgeDrawerView === 'edit') return;
  const direction = el.dataset.direction;
  if (!['previous', 'next'].includes(direction)) return;
  const navigation = knowledgePreviewNavigation(S.ui.knowledgePreviewContext, {
    owner: S.ui.currentUser?.id,
    workspace: D().ws.id || D().ws.url,
    notes: D().knowledgeNotes,
    activeId: S.ui.knowledgeDrawer,
  });
  const id = navigation?.[direction];
  if (!id) return;
  S.ui.knowledgeDrawer = id;
  S.ui.knowledgeRecent = [id, ...(S.ui.knowledgeRecent || []).filter(item => item !== id)].slice(0, 50);
  saveKnowledgePreferences();
  render();
  // At a page boundary the pressed arrow becomes disabled. Keep focus in the
  // reader instead of falling back to the background or scrolling the results.
  const target = document.querySelector(`.knowledge-preview-pager [data-direction="${direction}"]:not([disabled])`);
  (target || document.querySelector('.knowledge-preview-position'))?.focus({ preventScroll: true });
};
IN.knowledgeSelect = el => {
  const card = el.closest('.knowledge-preview-card');
  const top = card?.getBoundingClientRect().top;
  const set = new Set(S.ui.knowledgeSelection || []);
  el.checked ? set.add(el.dataset.id) : set.delete(el.dataset.id);
  S.ui.knowledgeSelection = [...set];
  render();
  // Selection adds folder-receive buttons above the list. Keep the clicked card
  // in place as well as preserving the scroller's offset across rerenders.
  const current = document.querySelector(`.knowledge-preview-card[data-id="${CSS.escape(el.dataset.id)}"]`);
  const scroller = current?.closest('.knowledge-main');
  if (scroller && top != null) {
    const align = () => {
      if (!current.isConnected) return stop();
      scroller.scrollTop += current.getBoundingClientRect().top - top;
    };
    // Revealing folder-receive actions can settle their grid sizing on the next
    // frame. Follow that bounded reflow, but never fight a new user interaction.
    const observer = new ResizeObserver(align);
    const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
    const stop = () => {
      observer.disconnect();
      events.forEach(type => scroller.removeEventListener(type, stop, true));
    };
    align();
    observer.observe(current.parentElement);
    events.forEach(type => scroller.addEventListener(type, stop, { once: true, capture: true, passive: true }));
    setTimeout(stop, 300);
  }
};
A.organizeKnowledgeFolders = () => {
  S.ui.knowledgeOrganize = !S.ui.knowledgeOrganize;
  S.ui.knowledgeFolderSelection = [];
  render();
};
IN.knowledgeFolderSelect = el => {
  const selected = new Set(S.ui.knowledgeFolderSelection || []);
  el.checked ? selected.add(el.dataset.id) : selected.delete(el.dataset.id);
  S.ui.knowledgeFolderSelection = [...selected];
  render();
};
IN.knowledgeBulkFolderMove = el => {
  if (knowledgeEditBlocked()) return;
  mutate(() => {
    if (moveKnowledgeFolders(D().knowledgeFolders, S.ui.knowledgeFolderSelection || [], el.value === 'root' ? null : el.value))
      S.ui.knowledgeFolderSelection = [];
    else toast('Cannot move a folder into itself or a descendant.', { kind: 'err' });
  });
};
A.selectKnowledgePage = el => {
  const known = new Set(D().knowledgeNotes.map(note => note.id));
  S.ui.knowledgeSelection = toggleKnowledgePageSelection(
    (S.ui.knowledgeSelection || []).filter(id => known.has(id)),
    (el.dataset.ids || '').split(',').filter(id => known.has(id)),
  );
  render();
  (document.querySelector('.knowledge-bulk [data-a="selectKnowledgePage"]') || document.getElementById('knowledge-selection-start'))?.focus({
    preventScroll: true,
  });
};
A.clearKnowledgeSelection = () => {
  S.ui.knowledgeSelection = [];
  render();
  document.getElementById('knowledge-selection-start')?.focus({ preventScroll: true });
};
IN.knowledgeBulkMove = el => {
  if (knowledgeEditBlocked()) return;
  const folder = el.value === 'root' ? null : el.value;
  if (folder && !D().knowledgeFolders.some(item => item.id === folder)) return;
  mutate(() => {
    const ids = new Set(S.ui.knowledgeSelection || []);
    D().knowledgeNotes.forEach(note => {
      if (ids.has(note.id)) {
        note.folderId = folder;
        note.updatedAt = new Date().toISOString();
        note.updatedBy = D().me;
      }
    });
    S.ui.knowledgeSelection = [];
  });
};
const moveModal = () => (S.ui.modals.at(-1)?.type === 'knowledgeMove' ? S.ui.modals.at(-1) : null);
A.moveKnowledgeNote = el => {
  if (knowledgeEditBlocked() || S.ui.currentUser?.role === 'viewer') return;
  const ids = [...new Set(el.dataset.id ? [el.dataset.id] : S.ui.knowledgeSelection || [])];
  const selected = new Set(ids);
  const notes = D().knowledgeNotes.filter(note => selected.has(note.id));
  if (!notes.length) return;
  const initial = el.dataset.folder || notes[0].folderId;
  openModal({
    type: 'knowledgeMove',
    ids: notes.map(note => note.id),
    folder: D().knowledgeFolders.some(folder => folder.id === initial) ? initial : null,
    query: '',
    offset: 0,
    owner: S.ui.currentUser?.id,
    workspace: D().ws?.id,
  });
};
A.browseKnowledgeMove = el => {
  const m = moveModal();
  if (!m) return;
  if (el.dataset.folder && !D().knowledgeFolders.some(folder => folder.id === el.dataset.folder)) return;
  Object.assign(m, { folder: el.dataset.folder || null, query: '', offset: 0 });
  render();
};
IN.knowledgeMoveQuery = el => {
  const m = moveModal();
  if (!m) return;
  Object.assign(m, { query: el.value, offset: 0 });
  render();
};
A.pageKnowledgeMove = el => {
  const m = moveModal();
  if (!m) return;
  m.offset = Math.max(0, Number(el.dataset.offset) || 0);
  render();
  document.querySelector('.knowledge-move-dialog .modal-b')?.scrollTo(0, 0);
};
A.confirmKnowledgeMove = () => {
  const m = moveModal();
  if (!m || knowledgeEditBlocked() || m.owner !== S.ui.currentUser?.id || m.workspace !== D().ws?.id) return;
  let result;
  if (
    !mutate(() => {
      result = moveKnowledgeNotes(D().knowledgeNotes, D().knowledgeFolders, m.ids, m.folder, D().me);
    })
  )
    return;
  if (!result.ok) return toast('The notes or destination changed. Reopen the move dialog.', { kind: 'err' });
  const movedIds = new Set(m.ids);
  S.ui.knowledgeSelection = (S.ui.knowledgeSelection || []).filter(id => !movedIds.has(id));
  closeModal();
  if (result.moved) toast('Notes moved', { action: 'Open destination', onAction: () => A.setKnowledgeFolder({ dataset: { folder: m.folder || 'root' } }) });
};
A.trashKnowledgeSelection = () => {
  if (knowledgeEditBlocked()) return;
  const ids = new Set(S.ui.knowledgeSelection || []);
  if (!ids.size) return;
  confirmDlg({
    title: 'Move selected notes to trash?',
    body: 'Selected notes can be restored from trash.',
    ok: 'Move to trash',
    danger: true,
    run: () =>
      mutate(() => {
        D()
          .knowledgeNotes.filter(note => ids.has(note.id))
          .forEach(note => moveToTrash('note', note.title, { note: structuredClone(note) }));
        D().knowledgeNotes = D().knowledgeNotes.filter(note => !ids.has(note.id));
        S.ui.knowledgeSelection = [];
      }),
  });
};
A.toggleKnowledgeMobileFolders = () => {
  S.ui.knowledgeMobileFolders = !S.ui.knowledgeMobileFolders;
  S.ui.knowledgeFolderNavOpen = true;
  render();
  if (S.ui.knowledgeMobileFolders) document.querySelector('.knowledge-sidebar .knowledge-mobile-folder-button')?.focus({ preventScroll: true });
  else document.querySelector('.knowledge-content .knowledge-mobile-folder-button')?.focus();
};
let compactKnowledge = knowledgeFolderOverlay(window.innerWidth, S.ui.collapsed, document.querySelector('.main')?.clientWidth || undefined);
window.addEventListener('resize', () => {
  const compact = knowledgeFolderOverlay(window.innerWidth, S.ui.collapsed, document.querySelector('.main')?.clientWidth || undefined);
  const changed = compact !== compactKnowledge;
  compactKnowledge = compact;
  if ((S.ui.knowledgeMobileFolders && !compact) || (changed && S.ui.route === 'knowledge')) {
    S.ui.knowledgeMobileFolders = false;
    S.ui.knowledgeFolderCardOffset = 0;
    render();
  }
});
document.addEventListener('focusin', event => {
  if (event.target.id === 'knowledge-body' && event.target.closest('.knowledge-editor')?.clientWidth > 700 && S.ui.knowledgeEditorPane === 'preview') {
    S.ui.knowledgeEditorPane = 'source';
    S.ui.knowledgeEditorPreview = true;
  }
});
A.filterKnowledgePreviewTag = el => {
  S.ui.knowledgeDrawer = null;
  S.ui.knowledgeFolder = 'all';
  S.ui.knowledgeTag = el.dataset.tag;
  S.ui.knowledgeOffset = 0;
  render();
};
A.showKnowledgeProperties = () => {
  S.ui.knowledgeEditorPane = 'source';
  render();
  const properties = document.querySelector('.knowledge-properties');
  if (!properties) return;
  properties.open = true;
  properties.scrollIntoView({ block: 'nearest' });
  properties.querySelector('summary')?.focus({ preventScroll: true });
  document.querySelector('.knowledge-note-actions')?.removeAttribute('open');
};
import { knowledgeLivePreview } from '../ui/knowledge-live-preview.js';
import { translateElement, t } from '../core/i18n.js';
import { knowledgeEditBlocked } from '../ui/knowledge-save-status.js';
import { captureKnowledgeEditorPosition, restoreKnowledgeEditorPosition } from '../ui/knowledge-editor-position.js';
A.setKnowledgeEditorPane = el => {
  const pane = el.dataset.pane;
  if (!['source', 'preview'].includes(pane)) return;
  captureKnowledgeEditorPosition();
  S.ui.knowledgeEditorPane = pane;
  render();
  restoreKnowledgeEditorPosition(pane);
};
A.toggleKnowledgeEditorPreview = () => {
  if ((document.querySelector('.knowledge-editor')?.clientWidth || innerWidth) <= 700 || matchMedia('(max-height: 500px)').matches) {
    A.setKnowledgeEditorPane({ dataset: { pane: S.ui.knowledgeEditorPane === 'preview' ? 'source' : 'preview' } });
    return;
  }
  S.ui.knowledgeEditorPreview = !S.ui.knowledgeEditorPreview;
  if (!S.ui.knowledgeEditorPreview) S.ui.knowledgeEditorPane = 'source';
  render();
};
window.addEventListener('resize', () => {
  const editor = document.querySelector('.knowledge-editor');
  if (
    (editor?.clientWidth <= 700 || matchMedia('(max-height: 500px)').matches) &&
    document.activeElement?.id === 'knowledge-body' &&
    S.ui.knowledgeEditorPane === 'preview'
  ) {
    captureKnowledgeEditorPosition();
    S.ui.knowledgeEditorPane = 'source';
    render();
    restoreKnowledgeEditorPosition('source');
  }
});
A.formatKnowledge = el => {
  const input = document.getElementById('knowledge-body');
  if (!input || input.disabled || knowledgeEditBlocked()) return;
  const selected = input.value.slice(input.selectionStart, input.selectionEnd);
  const formats = {
    bold: ['**', '**'],
    heading: ['\n## ', ''],
    list: ['\n- ', ''],
    check: ['\n- [ ] ', ''],
    code: ['\n```\n', '\n```'],
    link: ['[', '](https://)'],
  };
  const [before, after] = formats[el.dataset.format] || ['', ''];
  const start = input.selectionStart;
  input.setRangeText(before + selected + after, start, input.selectionEnd, 'end');
  IN.knowledgeField(input);
  input.focus();
  input.setSelectionRange(start + before.length, start + before.length + selected.length);
};
document.addEventListener('input', event => {
  if (event.target.id !== 'knowledge-body') return;
  const preview = document.querySelector('.knowledge-live-preview');
  const note = D().knowledgeNotes.find(note => note.id === event.target.dataset.id);
  if (preview && note) {
    preview.innerHTML = knowledgeLivePreview({ ...note, formatted_markdown: event.target.value });
    translateElement(preview);
  }
});
window.addEventListener('beforeunload', event => {
  if (S.ui.knowledgeDirty && S.ui.currentUser && !workspaceSyncIsClean(D())) {
    event.preventDefault();
    event.returnValue = '';
  }
});
window.addEventListener('pagehide', () => {
  if (S.ui.knowledgeDirty && S.ui.currentUser) flushLocalSave();
});

A.saveKnowledgeView = () =>
  openModal({
    type: 'prompt',
    title: 'Save search',
    label: 'Name',
    value: S.ui.knowledgeQuery || '',
    run: name => {
      if (!name.trim()) return;
      const views = (S.ui.knowledgeSavedViews ||= []);
      if (views.length >= 20) return toast('You can save up to 20 searches.', { kind: 'info' });
      views.push({
        id: uid('kv'),
        name: name.trim().slice(0, 80),
        folder: S.ui.knowledgeFolder,
        query: S.ui.knowledgeQuery,
        tag: S.ui.knowledgeTag,
        sort: S.ui.knowledgeSort,
      });
      saveKnowledgePreferences();
      render();
    },
  });
A.applyKnowledgeView = el => {
  const view = S.ui.knowledgeSavedViews?.find(view => view.id === el.dataset.id);
  if (!view) return;
  Object.assign(S.ui, { knowledgeFolder: view.folder, knowledgeQuery: view.query, knowledgeTag: view.tag, knowledgeSort: view.sort, knowledgeOffset: 0 });
  S.ui.knowledgeFolderCardQuery = '';
  S.ui.knowledgeFolderCardOffset = 0;
  S.ui.knowledgeRevealFolder = view.folder;
  render();
};
A.removeKnowledgeView = el => {
  S.ui.knowledgeSavedViews = S.ui.knowledgeSavedViews.filter(view => view.id !== el.dataset.id);
  saveKnowledgePreferences();
  render();
};

IN.knowledgeMoveFolder = el =>
  mutate(() => {
    if (!moveKnowledgeFolder(D().knowledgeFolders, el.dataset.id, el.value)) toast('Cannot move a folder into itself or a descendant.', { kind: 'err' });
  });

let dragged = null;

A.chooseKnowledgeFiles = () => document.getElementById('knowledge-import-files')?.click();
A.toggleKnowledgeFolderCards = () => {
  S.ui.knowledgeShowFolders = S.ui.knowledgeShowFolders === false;
  saveKnowledgePreferences();
  render();
};
IN.knowledgeFolderLayout = el => {
  S.ui.knowledgeFolderLayout = el.value === 'inline' ? 'inline' : 'block';
  saveKnowledgePreferences();
  render();
};
A.focusKnowledgeNotes = () => {
  const note = document.querySelector('.knowledge-preview-open');
  if (!note) return;
  note.focus({ preventScroll: true });
  note.scrollIntoView({ block: 'start', inline: 'nearest' });
};
IN.knowledgeFolderCardQuery = el => {
  S.ui.knowledgeFolderCardQuery = el.value;
  S.ui.knowledgeFolderCardOffset = 0;
  render();
};
A.clearKnowledgeFolderCardQuery = () => {
  S.ui.knowledgeFolderCardQuery = '';
  S.ui.knowledgeFolderCardOffset = 0;
  render();
  (document.getElementById('knowledge-subfolder-search') || document.querySelector('.knowledge-folder-card'))?.focus();
};
A.knowledgeFolderCardPage = el => {
  S.ui.knowledgeFolderCardOffset = Math.max(0, Number(el.dataset.offset) || 0);
  render();
  const firstFolder = document.querySelector('.knowledge-folder-card');
  firstFolder?.focus({ preventScroll: true });
  firstFolder?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
};
A.knowledgeFolderNavPage = el => {
  S.ui.knowledgeFolderNavOffset = Math.max(0, Number(el.dataset.offset) || 0);
  S.ui.knowledgeRevealFolder = null;
  render();
  document.querySelector('.knowledge-folders')?.scrollTo(0, 0);
};
const isFileDrag = event => [...(event.dataTransfer?.types || [])].includes('Files');
// Capture external files before the generic task-attachment handlers.
document.addEventListener(
  'dragover',
  event => {
    const shell = event.target.closest?.('.knowledge-shell');
    if (!shell || !isFileDrag(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!['admin', 'editor'].includes(S.ui.currentUser?.role)) return;
    event.dataTransfer.dropEffect = 'copy';
    shell.classList.add('knowledge-file-over');
  },
  true,
);
document.addEventListener('dragleave', event => {
  const shell = event.target.closest?.('.knowledge-shell');
  if (shell && !shell.contains(event.relatedTarget)) shell.classList.remove('knowledge-file-over');
});
document.addEventListener(
  'drop',
  event => {
    const shell = event.target.closest?.('.knowledge-shell');
    if (!shell || !isFileDrag(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    shell.classList.remove('knowledge-file-over');
    const folder = event.target.closest?.('[data-a="setKnowledgeFolder"]')?.dataset.folder || S.ui.knowledgeFolder;
    void importKnowledgeFiles(Array.from(event.dataTransfer.files), folder);
  },
  true,
);
document.addEventListener('dragstart', event => {
  const target = event.target.closest?.('[data-knowledge-drag]');
  if (!target) return;
  if (S.ui.currentUser?.role === 'viewer' || knowledgeEditBlocked() || S.ui.atomicOperation) return event.preventDefault();
  const id = target.dataset.id || target.dataset.folder;
  const kind = target.dataset.knowledgeDrag;
  const ids = kind === 'note' && S.ui.knowledgeSelection?.includes(id) ? [...S.ui.knowledgeSelection] : [id];
  dragged = {
    id,
    ids,
    kind,
    owner: S.ui.currentUser?.id,
    workspace: D().ws?.id,
    excluded: kind === 'folder' ? folderDescendants(id, D().knowledgeFolders) : new Set(),
  };
  event.dataTransfer.setData('application/x-smena-knowledge', JSON.stringify({ id, kind }));
  event.dataTransfer.effectAllowed = 'move';
});
const clearKnowledgeDropMarks = () => document.querySelectorAll('.knowledge-drop-target').forEach(el => el.classList.remove('knowledge-drop-target'));
document.addEventListener('dragend', () => {
  dragged = null;
  clearKnowledgeDropMarks();
});
document.addEventListener('dragover', event => {
  if (!dragged) return;
  const target = event.target.closest?.('[data-a="setKnowledgeFolder"]');
  clearKnowledgeDropMarks();
  if (!target) return;
  const parent = target.dataset.folder;
  const valid = parent === 'root' || D().knowledgeFolders.some(folder => folder.id === parent);
  if (!valid || dragged.excluded.has(parent)) {
    event.dataTransfer.dropEffect = 'none';
    return;
  }
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  target.classList.add('knowledge-drop-target');
});
document.addEventListener('dragleave', event => {
  const target = event.target.closest?.('.knowledge-drop-target');
  if (target && !target.contains(event.relatedTarget)) target.classList.remove('knowledge-drop-target');
});
document.addEventListener('drop', event => {
  const target = event.target.closest?.('[data-a="setKnowledgeFolder"]');
  if (!target || !dragged) return;
  event.preventDefault();
  const parent = target.dataset.folder;
  if (parent !== 'root' && !D().knowledgeFolders.some(folder => folder.id === parent)) return;
  const item = dragged;
  dragged = null;
  clearKnowledgeDropMarks();
  if (knowledgeEditBlocked() || item.owner !== S.ui.currentUser?.id || item.workspace !== D().ws?.id) return;
  let moved = false;
  mutate(() => {
    if (item.kind === 'folder') {
      if (!moveKnowledgeFolder(D().knowledgeFolders, item.id, parent === 'root' ? null : parent))
        toast('Cannot move a folder into itself or a descendant.', { kind: 'err' });
    } else {
      const result = moveKnowledgeNotes(D().knowledgeNotes, D().knowledgeFolders, item.ids, parent === 'root' ? null : parent, D().me);
      moved = result.ok && result.moved > 0;
      if (!result.ok) toast('The notes or destination changed. Reopen the move dialog.', { kind: 'err' });
      if (result.ok) S.ui.knowledgeSelection = (S.ui.knowledgeSelection || []).filter(id => !item.ids.includes(id));
    }
  });
  if (moved) toast('Notes moved', { action: 'Open destination', onAction: () => A.setKnowledgeFolder({ dataset: { folder: parent } }) });
});
