import { A, IN } from '../actions/actions.js';
import { D, S, flushLocalSave } from '../core/store.js';
import { mutate, toast } from '../ui/toast.js';
import { moveKnowledgeFolder } from '../shared/knowledge-tools.js';
import { render } from '../shell/render.js';
import { openModal } from '../overlays/modals.js';
import { uid } from '../core/utils.js';
import { saveKnowledgePreferences } from '../core/knowledge-preferences.js';
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
document.addEventListener('dragstart', event => {
  const target = event.target.closest?.('[data-knowledge-drag]');
  if (!target || S.ui.currentUser?.role === 'viewer') return;
  dragged = { id: target.dataset.id || target.dataset.folder, kind: target.dataset.knowledgeDrag };
  event.dataTransfer.setData('application/x-smena-knowledge', JSON.stringify(dragged));
  event.dataTransfer.effectAllowed = 'move';
});
document.addEventListener('dragend', () => {
  dragged = null;
});
document.addEventListener('dragover', event => {
  if (dragged && event.target.closest?.('[data-a="setKnowledgeFolder"]')) event.preventDefault();
});
document.addEventListener('drop', event => {
  const target = event.target.closest?.('[data-a="setKnowledgeFolder"]');
  if (!target || !dragged) return;
  event.preventDefault();
  const parent = target.dataset.folder;
  if (['favorites', 'all'].includes(parent)) return;
  const item = dragged;
  dragged = null;
  mutate(() => {
    if (item.kind === 'folder') {
      if (!moveKnowledgeFolder(D().knowledgeFolders, item.id, parent === 'root' ? null : parent))
        toast('Cannot move a folder into itself or a descendant.', { kind: 'err' });
    } else {
      const note = D().knowledgeNotes.find(note => note.id === item.id);
      if (note) {
        note.folderId = parent === 'root' ? null : parent;
        note.updatedAt = new Date().toISOString();
        note.updatedBy = D().me;
      }
    }
  });
});
