/* =====================================================================
   ACTIONS · ARCHIVE: restore and purge
   ===================================================================== */
import { esc } from '../core/utils.js';
import { D, S, logAct, task } from '../core/store.js';
import { mutate, toast } from '../ui/toast.js';
import { A, confirmDlg, deleteTasks } from './actions.js';
import { purgeWorkspaceTrash } from '../core/api.js';
import { applyWorkspaceSnapshot } from '../core/bootstrap.js';
import { queueWorkspaceSync } from '../core/workspace-sync.js';
import { render } from '../shell/render.js';

A.restoreTask = el => {
  const t = task(el.dataset.id);
  if (
    mutate(() => {
      t.archived = false;
      t.archivedAt = null;
      logAct('restored', t);
    })
  )
    toast(`Restored “${t.title}”`, { action: 'Open', onAction: () => A.openTask({ dataset: { id: t.id } }) });
};
A.purgeTask = el => {
  const t = task(el.dataset.id);
  confirmDlg({
    title: 'Delete task permanently?',
    body: `<b>${esc(t.title)}</b>, its subtasks, comments, and attachments will be deleted for everyone. This can't be undone.`,
    ok: 'Delete permanently',
    danger: true,
    run: () => {
      if (mutate(() => deleteTasks([t.id], false))) toast(`Deleted “${t.title}”`);
    },
  });
};

function restoreTrash(item) {
  const data = item.data || {};
  if (item.kind === 'project') {
    if (D().projects.some(project => project.id === data.project?.id)) return false;
    D().projects.push(data.project);
    const index = Math.max(0, Math.min(Number(data.orderIndex ?? D().projOrder.length), D().projOrder.length));
    D().projOrder.splice(index, 0, data.project.id);
    D().tasks.push(...(data.tasks || []));
    D().comments.push(...(data.comments || []));
    D().files.push(...(data.files || []));
  } else if (item.kind === 'task') {
    if (!D().projects.some(project => project.id === data.task?.project) || D().tasks.some(existing => existing.id === data.task?.id)) return false;
    D().tasks.push(data.task);
    D().comments.push(...(data.comments || []));
    D().files.push(...(data.files || []));
    for (const id of data.dependentTaskIds || []) {
      const dependent = D().tasks.find(existing => existing.id === id);
      if (dependent && !dependent.deps.includes(data.task.id)) dependent.deps.push(data.task.id);
    }
  } else if (item.kind === 'note') {
    if (D().knowledgeNotes.some(note => note.id === data.note?.id)) return false;
    D().knowledgeNotes.push(data.note);
  } else if (item.kind === 'bookmark') {
    if (D().links.some(link => link.id === data.link?.id)) return false;
    D().links.push(data.link);
  } else if (item.kind === 'file') {
    if (!D().projects.some(project => project.id === data.file?.project) || D().files.some(file => file.id === data.file?.id)) return false;
    D().files.push(data.file);
    const parentTask = data.file.task ? D().tasks.find(existing => existing.id === data.file.task) : null;
    if (parentTask && data.attachment) parentTask.attachments.push(data.attachment);
  } else return false;
  D().trash = D().trash.filter(entry => entry.id !== item.id);
  return true;
}

A.restoreTrash = el => {
  const item = (D().trash || []).find(entry => entry.id === el.dataset.id);
  if (!item) return;
  let restored = false;
  const changed = mutate(() => {
    restored = restoreTrash(item);
  });
  if (changed && restored) toast(`«${item.name}» восстановлено.`);
  else if (changed) toast('Не удалось восстановить элемент: его родительский проект удалён или идентификатор уже занят.', { kind: 'err', ms: 7000 });
};

A.purgeTrash = el => {
  const item = (D().trash || []).find(entry => entry.id === el.dataset.id);
  if (!item) return;
  confirmDlg({
    title: 'Удалить безвозвратно?',
    body: `<b>${esc(item.name)}</b> будет окончательно удалён${item.kind === 'file' || item.data?.files?.length ? ' вместе с файлами в Google Drive' : ''}.`,
    ok: 'Удалить навсегда',
    danger: true,
    run: async () => {
      try {
        await queueWorkspaceSync(D());
        const result = await purgeWorkspaceTrash(item.id, S.ui.workspaceRevision);
        applyWorkspaceSnapshot(result.data);
        render();
        toast(`«${item.name}» удалено безвозвратно.`);
      } catch (error) {
        toast(error.message || 'Не удалось очистить элемент корзины.', { kind: 'err', ms: 8000 });
      }
    },
  });
};
