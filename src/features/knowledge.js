import { IN } from '../actions/actions.js';
import { D, S } from '../core/store.js';
import { mutate, toast } from '../ui/toast.js';
import { moveKnowledgeFolder } from '../shared/knowledge-tools.js';

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
