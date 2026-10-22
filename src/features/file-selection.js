import { A, confirmDlg, moveToTrash, restore, snapshot } from '../actions/actions.js';
import { D, S, canSee, proj, task } from '../core/store.js';
import { esc } from '../core/utils.js';
import { render } from '../shell/render.js';
import { mutate, toast } from '../ui/toast.js';
import { fileBatchTargets } from '../shared/file-organization.js';
import { detachTaskFile } from '../shared/file-identity.js';

A.toggleFileSelection = el => {
  const file = D().files.find(file => file.id === el.dataset.id);
  if (!file || !canSee(proj(file.project))) return;
  const selected = new Set(S.ui.fileSelection || []);
  if (!selected.delete(file.id)) {
    if (selected.size >= 500) return toast('Select up to 500 files at a time.', { kind: 'info' });
    selected.add(file.id);
  }
  S.ui.fileSelection = [...selected];
  render();
};
A.selectFilePage = el => {
  const ids = (el.dataset.ids || '').split(',').filter(id => D().files.some(file => file.id === id && canSee(proj(file.project))));
  const selected = new Set(S.ui.fileSelection || []);
  if (ids.every(id => selected.has(id))) ids.forEach(id => selected.delete(id));
  else
    for (const id of ids) {
      if (selected.size >= 500 && !selected.has(id)) {
        toast('Select up to 500 files at a time.', { kind: 'info' });
        break;
      }
      selected.add(id);
    }
  S.ui.fileSelection = [...selected];
  render();
};
A.selectFileResults = A.selectFilePage;
A.clearFileSelection = () => {
  S.ui.fileSelection = [];
  render();
};
A.trashSelectedFiles = () => {
  const ids = [...(S.ui.fileSelection || [])];
  let files;
  try {
    files = fileBatchTargets(D(), ids, S.ui.currentUser?.role, true);
  } catch (error) {
    return toast(error.message, { kind: 'err' });
  }
  const owner = S.ui.currentUser?.id;
  const workspace = D().ws?.id || D().ws?.url;
  confirmDlg({
    title: 'Move selected files to trash?',
    body: `<p><span>Selected files</span>: <b>${files.length}</b></p><ul class="file-batch-preview">${files
      .slice(0, 12)
      .map(file => `<li translate="no">${esc(file.name)}</li>`)
      .join(
        '',
      )}</ul>${files.length > 12 ? `<p>+${files.length - 12}</p>` : ''}<p>Files can be restored from the workspace trash. Task attachments will be removed too.</p>`,
    ok: 'Move to trash',
    danger: true,
    run: () => {
      if (owner !== S.ui.currentUser?.id || workspace !== (D().ws?.id || D().ws?.url)) return;
      const snap = snapshot();
      try {
        if (
          !mutate(() => {
            // Recheck the complete batch before detaching a single task attachment.
            const current = fileBatchTargets(D(), ids, S.ui.currentUser?.role, true);
            for (const file of current) {
              const attachment = detachTaskFile(file.task ? task(file.task) : null, file);
              moveToTrash('file', file.name, { file: structuredClone(file), attachment: attachment ? structuredClone(attachment) : null });
            }
            const selected = new Set(ids);
            D().files = D().files.filter(file => !selected.has(file.id));
          })
        )
          return;
        S.ui.fileSelection = [];
        toast('Files moved to trash.', { action: 'Undo', onAction: () => restore(snap) });
      } catch (error) {
        toast(error.message, { kind: 'err' });
      }
    },
  });
};
