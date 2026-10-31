import { canEditProject } from '../shared/project-access.js';
import { A, handleFiles } from '../actions/actions.js';
import { D, S, flushLocalSave, visibleProjects } from '../core/store.js';
import { getActiveWorkspace, getSessionGeneration, downloadWorkspaceFile } from '../core/api.js';
import { offlineItems, putOffline, removeOffline, OFFLINE_OWNER } from '../core/offline-library.js';
import { offlineEditPlan } from '../shared/offline-knowledge.js';
import { entityAllowed } from '../shared/relations.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { mutate, toast } from '../ui/toast.js';
import { esc } from '../core/utils.js';
import { kc } from '../ui/knowledge-types.js';
import { retryWorkspaceSync, workspaceSyncIsClean } from '../core/workspace-sync.js';
async function shell(owner, generation) {
  const registration = await navigator.serviceWorker.register('/sw.js');
  const worker = registration.installing || registration.waiting;
  if (worker && worker.state !== 'activated')
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        worker.removeEventListener('statechange', check);
        reject(Error(kc('Offline setup timed out. Retry.', 'Истекло время подготовки офлайн-доступа. Повторите.')));
      }, 15000);
      function check() {
        if (worker.state === 'activated') {
          clearTimeout(timeout);
          worker.removeEventListener('statechange', check);
          resolve();
        } else if (worker.state === 'redundant') {
          clearTimeout(timeout);
          worker.removeEventListener('statechange', check);
          reject(Error('Offline worker unavailable.'));
        }
      }
      worker.addEventListener('statechange', check);
      check();
    });
  await navigator.serviceWorker.ready;
  if (generation !== getSessionGeneration() || owner !== S.ui.currentUser?.id) throw Error('Account changed.');
  localStorage.setItem(OFFLINE_OWNER, owner);
}
export async function pinKnowledgeNote(el) {
  const note = D().knowledgeNotes.find(n => n.id === el.dataset.id),
    generation = getSessionGeneration(),
    owner = S.ui.currentUser?.id;
  if (!note) return;
  try {
    await shell(owner, generation);
    await putOffline({
      owner: S.ui.currentUser.id,
      workspace: getActiveWorkspace(),
      workspaceName: D().ws.name,
      kind: 'note',
      id: note.id,
      title: note.title,
      base: structuredClone(note),
      body: note.formatted_markdown,
      pending: false,
      projects: visibleProjects()
        .filter(p => canEditProject(p, D().me, S.ui.currentUser?.role))
        .map(p => ({ id: p.id, name: p.name })),
    });
    toast(kc('Available in the offline library on this device.', 'Доступно в офлайн-библиотеке на этом устройстве.'));
  } catch (error) {
    toast(error.message, { kind: 'err' });
  }
}
export async function pinKnowledgeFile(el) {
  const file = D().files.find(f => f.id === el.dataset.id),
    generation = getSessionGeneration(),
    owner = S.ui.currentUser?.id;
  if (!file || !entityAllowed(D(), `file:${file.id}`, { role: S.ui.currentUser?.role, memberId: D().me })) return;
  try {
    const { blob } = await downloadWorkspaceFile(file.id, false, { maxBytes: 20 * 1024 * 1024 });
    if (generation !== getSessionGeneration()) return;
    await shell(owner, generation);
    await putOffline({
      owner: S.ui.currentUser.id,
      workspace: getActiveWorkspace(),
      workspaceName: D().ws.name,
      kind: 'file',
      id: file.id,
      title: file.name,
      blob,
    });
    toast(kc('File saved for offline use on this device.', 'Файл сохранён для офлайн-доступа на устройстве.'));
  } catch (error) {
    toast(error.message, { kind: 'err' });
  }
}
export async function reviewOfflineChanges() {
  const entries = await offlineItems(S.ui.currentUser.id),
    plan = offlineEditPlan(entries, D(), S.ui.currentUser.id, getActiveWorkspace());
  const uploads = entries.filter(e => e.kind === 'upload' && e.workspace === getActiveWorkspace());
  openModal({
    type: 'knowledgeTool',
    plan,
    uploads,
    render: (m, H) =>
      `${H(kc('Offline library', 'Офлайн-библиотека'))}<div class="modal-b" translate="no"><a class="btn btn-secondary" href="/offline.html" target="_blank" rel="noopener">${kc('Open local copies', 'Открыть локальные копии')}</a><p class="hint">${kc('Copies are stored on this device. Signing out clears them. Files are downloaded only when you keep them offline.', 'Копии хранятся на устройстве и очищаются при выходе. Файлы скачиваются только при выборе офлайн-доступа.')}</p><p>${kc('Ready to sync', 'Готово к синхронизации')}: ${m.plan.ready.length} · ${kc('Conflicts', 'Конфликты')}: ${m.plan.conflicts.length}</p><p>${kc('Queued uploads', 'Очередь загрузок')}: ${uploads.length}</p>${uploads.map(e => `<p>${esc(e.title)} — ${e.state === 'queued' ? kc('Ready', 'Готово') : kc('Verify the Files section before retrying; no automatic resend.', 'Проверьте раздел файлов перед повтором; автоматической повторной отправки нет.')}</p>`).join('')}${m.plan.conflicts.map(e => `<p class="err">${esc(e.title)} — ${kc('Source changed or deleted. Export your local text and compare it before editing.', 'Источник изменён или удалён. Скачайте локальный текст и сравните перед правкой.')}</p>`).join('')}</div><div class="modal-f" translate="no">${S.ui.currentUser?.role !== 'viewer' && uploads.some(e => e.state === 'queued') ? `<button class="btn btn-secondary" data-a="sendOfflineFiles">${kc('Upload queued files', 'Отправить файлы из очереди')}</button>` : ''}<button class="btn btn-secondary" data-a="closeModal">${kc('Close', 'Закрыть')}</button>${S.ui.currentUser?.role !== 'viewer' ? `<button class="btn btn-primary" data-a="applyOfflineKnowledge" ${!plan.ready.length ? 'disabled' : ''}>${kc('Apply compatible edits', 'Применить совместимые правки')}</button>` : ''}</div>`,
  });
}
A.applyOfflineKnowledge = async () => {
  if (S.ui.currentUser?.role === 'viewer' || S.ui.atomicOperation || !workspaceSyncIsClean(D())) return;
  const originalModal = S.ui.modals.at(-1);
  const owner = S.ui.currentUser.id,
    workspace = getActiveWorkspace(),
    generation = getSessionGeneration(),
    entries = await offlineItems(owner),
    plan = offlineEditPlan(entries, D(), owner, workspace);
  if (!plan.ready.length) return;
  if (
    !mutate(() => {
      for (const entry of plan.ready) {
        const note = D().knowledgeNotes.find(n => n.id === entry.id);
        note.formatted_markdown = entry.body;
        note.updatedAt = new Date().toISOString();
        note.updatedBy = D().me;
      }
    })
  )
    return;
  flushLocalSave();
  await retryWorkspaceSync();
  if (generation !== getSessionGeneration() || !workspaceSyncIsClean(D()))
    return toast(kc('Changes remain queued until synchronization is confirmed.', 'Правки останутся в очереди до подтверждения синхронизации.'), {
      kind: 'info',
    });
  for (const entry of plan.ready) await putOffline({ ...entry, base: structuredClone(D().knowledgeNotes.find(n => n.id === entry.id)), pending: false });
  if (S.ui.modals.at(-1) === originalModal) closeModal();
  toast(kc('Offline edits synchronized.', 'Офлайн-правки синхронизированы.'));
};
A.removeOfflineNote = async el => {
  const records = await offlineItems(S.ui.currentUser.id);
  const item = records.find(r => r.workspace === getActiveWorkspace() && r.id === el.dataset.id);
  if (item) await removeOffline(item);
};

A.sendOfflineFiles = async () => {
  const originalModal = S.ui.modals.at(-1);
  if (S.ui.currentUser?.role === 'viewer' || S.ui.atomicOperation || !workspaceSyncIsClean(D())) return;
  const owner = S.ui.currentUser.id,
    workspace = getActiveWorkspace(),
    generation = getSessionGeneration();
  const items = (await offlineItems(owner)).filter(item => item.workspace === workspace && item.kind === 'upload' && item.state === 'queued');
  for (const item of items) {
    if (generation !== getSessionGeneration()) return;
    await putOffline({ ...item, state: 'sending' });
    if (generation !== getSessionGeneration()) return;
    const files = await handleFiles([new File([item.blob], item.title, { type: item.blob.type })], { project: item.project });
    if (generation !== getSessionGeneration()) return;
    if (files?.length) await removeOffline(item);
    else await putOffline({ ...item, state: 'verify' });
  }
  if (S.ui.modals.at(-1) === originalModal) {
    closeModal();
    await reviewOfflineChanges();
  }
};
export async function pinBookmark(el) {
  const link = D().links.find(l => l.id === el.dataset.id);
  if (!link) return;
  const owner = S.ui.currentUser.id,
    generation = getSessionGeneration();
  try {
    await shell(owner, generation);
    await putOffline({
      owner,
      workspace: getActiveWorkspace(),
      workspaceName: D().ws.name,
      kind: 'bookmark',
      id: link.id,
      title: link.title,
      body: `[${link.title}](${link.url})\n\n${link.excerpt || ''}\n\n${link.description || ''}`,
    });
    toast(kc('Bookmark kept offline.', 'Закладка сохранена офлайн.'));
  } catch (error) {
    toast(error.message, { kind: 'err' });
  }
}

let applying = false;
for (const name of ['applyOfflineKnowledge', 'sendOfflineFiles']) {
  const run = A[name];
  A[name] = async (...args) => {
    if (applying) return;
    applying = true;
    try {
      return await run(...args);
    } finally {
      applying = false;
    }
  };
}
