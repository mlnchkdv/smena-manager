import { A, IN, confirmDlg, moveToTrash, importKnowledgeFiles } from '../actions/actions.js';
import { D, S, flushLocalSave } from '../core/store.js';
import { mutate, toast } from '../ui/toast.js';
import { moveKnowledgeFolder, moveKnowledgeFolders, folderDescendants } from '../shared/knowledge-tools.js';
import { render } from '../shell/render.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { moveKnowledgeNotes } from '../shared/knowledge-note-move.js';
import { uid } from '../core/utils.js';
import { saveKnowledgePreferences } from '../core/knowledge-preferences.js';
import { historyContent } from '../shared/knowledge-history.js';
import { workspaceSyncIsClean } from '../core/workspace-sync.js';
const canRestoreKnowledge = () => {
  if (workspaceSyncIsClean(S.data)) return true;
  flushLocalSave();
  toast('Wait until all changes are saved before restoring a version.', { kind: 'info' });
  return false;
};
A.restoreKnowledgeVersion = el => {
  if (knowledgeEditBlocked() || !canRestoreKnowledge()) return;
  const note = D().knowledgeNotes.find(note => note.id === el.dataset.id);
  const version = note?.history?.find(version => version.id === el.dataset.version);
  if (!version) return;
  confirmDlg({
    title: 'Restore this note version?',
    body: 'The current content will become a previous version after synchronization.',
    ok: 'Restore version',
    run: () => {
      if (knowledgeEditBlocked() || !canRestoreKnowledge()) return;
      // A refresh may have replaced the document while confirmation was open.
      const current = D().knowledgeNotes.find(item => item.id === note.id);
      const saved = current?.history?.find(item => item.id === version.id);
      if (!saved) return toast('This version is no longer available. Reopen version history.', { kind: 'info' });
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
    original(...args);
    const id = S.ui.knowledgeDrawer;
    if (id) {
      S.ui.knowledgeRecent = [id, ...(S.ui.knowledgeRecent || []).filter(item => item !== id)].slice(0, 50);
      saveKnowledgePreferences();
    }
  };
}
IN.knowledgeSelect = el => {
  const set = new Set(S.ui.knowledgeSelection || []);
  el.checked ? set.add(el.dataset.id) : set.delete(el.dataset.id);
  S.ui.knowledgeSelection = [...set];
  render();
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
  S.ui.knowledgeSelection = (el.dataset.ids || '').split(',').filter(Boolean);
  render();
};
A.clearKnowledgeSelection = () => {
  S.ui.knowledgeSelection = [];
  render();
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
  const notes = D().knowledgeNotes.filter(note => ids.includes(note.id));
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
  S.ui.knowledgeSelection = (S.ui.knowledgeSelection || []).filter(id => !m.ids.includes(id));
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
  if (S.ui.knowledgeMobileFolders) document.querySelector('[data-in="knowledgeFolderQuery"]')?.focus();
  else document.querySelector('.knowledge-content .knowledge-mobile-folder-button')?.focus();
};
let compactKnowledge = window.innerWidth <= 640;
window.addEventListener('resize', () => {
  const compact = window.innerWidth <= 640;
  const changed = compact !== compactKnowledge;
  compactKnowledge = compact;
  if ((S.ui.knowledgeMobileFolders && !compact) || (changed && S.ui.route === 'knowledge')) {
    S.ui.knowledgeMobileFolders = false;
    S.ui.knowledgeFolderCardOffset = 0;
    render();
  }
});
A.filterKnowledgePreviewTag = el => {
  S.ui.knowledgeDrawer = null;
  S.ui.knowledgeFolder = 'all';
  S.ui.knowledgeTag = el.dataset.tag;
  S.ui.knowledgeOffset = 0;
  render();
};
import { renderKnowledgeMarkdown } from '../shared/knowledge-markdown.js';
import { knowledgeEditBlocked } from '../ui/knowledge-save-status.js';
A.toggleKnowledgeEditorPreview = () => {
  S.ui.knowledgeEditorPreview = !S.ui.knowledgeEditorPreview;
  render();
};
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
  if (preview) preview.innerHTML = renderKnowledgeMarkdown(event.target.value);
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
IN.knowledgeFolderCardQuery = el => {
  S.ui.knowledgeFolderCardQuery = el.value;
  S.ui.knowledgeFolderCardOffset = 0;
  render();
};
A.knowledgeFolderCardPage = el => {
  S.ui.knowledgeFolderCardOffset = Math.max(0, Number(el.dataset.offset) || 0);
  render();
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
