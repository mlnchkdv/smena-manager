import { A, IN, confirmDlg } from '../actions/actions.js';
import { S, D, visibleProjects } from '../core/store.js';
import { mediaBackupRequest, getSessionGeneration } from '../core/api.js';
import { refreshWorkspaceFromServer } from '../core/bootstrap.js';
import { render } from '../shell/render.js';
import { openModal } from '../overlays/modals.js';
import { esc } from '../core/utils.js';
import { isRussian } from '../core/i18n.js';
import { fsize } from '../ui/helpers.js';
import { canEditProject } from '../shared/project-access.js';
import { mediaBackupError } from '../shared/media-backup-errors.js';
import { fileFolders, fileFolderPath } from '../shared/file-organization.js';
const q = (en, ru) => (isRussian() ? ru : en);
export async function openMediaBackups() {
  const modal = { type: 'knowledgeTool', ids: [...(S.ui.fileSelection || [])], generation: getSessionGeneration(), jobs: [], busy: false, render: view };
  openModal(modal);
  await update(modal);
}
const current = m => S.ui.modals.includes(m) && m.generation === getSessionGeneration();
async function update(m) {
  try {
    const result = await mediaBackupRequest();
    if (current(m)) {
      m.jobs = result.jobs;
      m.error = '';
    }
  } catch (error) {
    m.error = mediaBackupError(error, isRussian());
  }
  if (current(m)) render();
}
function retentionOptions(days) {
  return [0, 7, 30, 90]
    .map(
      value =>
        `<option value="${value}" ${Number(days || 0) === value ? 'selected' : ''}>${value ? q(`Archive after ${value} days`, `В архив через ${value} дней`) : q('Keep active', 'Оставить активной')}</option>`,
    )
    .join('');
}
function view(m, H) {
  if (m.restore) return restoreView(m, H);
  if (m.inventory) return inventoryView(m, H);
  if (m.edit) return settingsView(m, H);
  const canWrite = S.ui.currentUser?.role !== 'viewer';
  const jobs = m.jobs.filter(job => !!job.archived === !!m.showArchive);
  const active = m.jobs.filter(job => !job.archived && job.mine).length;
  return (
    H(q('Independent file copies', 'Независимые копии файлов')) +
    `<div class="modal-b" translate="no"><p class="hint">${q('Separate verified binaries in the same Drive account. Archiving retains the copies and their storage usage. Only explicit removal deletes copies; restored files remain intact.', 'Отдельные проверенные копии в том же Google-аккаунте. Архивирование сохраняет копии и занятое место. Только явное удаление удаляет копии; восстановленные файлы сохраняются.')}</p>
    <p class="hint">${q('Active sets for you', 'Ваших активных наборов')}: ${active}/4 · ${q('Workspace active limit: 16 · retained limit: 64', 'Лимит активных в пространстве: 16 · всего сохранённых: 64')}</p>
    ${m.ids.length && canWrite ? `<label class="field"><span class="label">${q('Copy name', 'Название копии')}</span><input class="input" maxlength="120" value="${esc(m.copyLabel || '')}" data-in="mediaCopyField" data-field="copyLabel" ${m.busy ? 'disabled' : ''}></label><label class="field"><span class="label">${q('Automatic archive', 'Автоматическое архивирование')}</span><select class="select" data-in="mediaCopyField" data-field="retentionDays" ${m.busy ? 'disabled' : ''}>${retentionOptions(m.retentionDays)}</select></label><button class="btn btn-secondary btn-sm" data-a="createMediaBackup" ${m.busy || active >= 4 ? 'disabled' : ''}>${q('Copy selected files', 'Скопировать выбранные файлы')} (${m.ids.length})</button>` : `<p class="hint">${q('Select files in the file catalog to create a copy.', 'Для создания копии выберите файлы в каталоге.')}</p>`}
    ${m.error ? `<p class="err" role="alert">${esc(m.error)}</p>` : ''}${m.busy ? `<p role="status">${esc(m.progress || q('Processing…', 'Выполняем…'))}</p>` : ''}
    <div class="row wrap"><button class="btn btn-ghost btn-sm" data-a="mediaCopyTab" data-archive="false" aria-pressed="${!m.showArchive}">${q('Active', 'Активные')}</button><button class="btn btn-ghost btn-sm" data-a="mediaCopyTab" data-archive="true" aria-pressed="${!!m.showArchive}">${q('Archive', 'Архив')}</button></div>
    ${
      jobs
        .map(
          job => `<article class="panel" style="padding:12px;margin-block:8px"><h3>${esc(job.label || q('File copy', 'Копия файлов'))}</h3><p class="hint">${esc(new Date(job.createdAt).toLocaleString(isRussian() ? 'ru-RU' : 'en-US'))} · ${job.done}/${job.files} · ${fsize(job.bytes)}${job.expiresAt ? ` · ${q('Archive', 'В архив')}: ${esc(new Date(job.expiresAt).toLocaleDateString(isRussian() ? 'ru-RU' : 'en-US'))}` : ''}${!job.mine ? ` · ${q('Workspace copy', 'Копия пространства')}` : ''}</p>
    <div class="row wrap">${job.available ? `<button class="btn btn-secondary btn-sm" data-a="viewMediaInventory" data-id="${esc(job.id)}" ${m.busy ? 'disabled' : ''}>${q('Contents', 'Состав')}</button>${job.ready ? `<button class="btn btn-ghost btn-sm" data-a="downloadMediaManifest" data-id="${esc(job.id)}" ${m.busy ? 'disabled' : ''}>${q('Manifest', 'Манифест')}</button><button class="btn btn-secondary btn-sm" data-a="restoreMediaBackup" data-id="${esc(job.id)}" ${m.busy || !canWrite ? 'disabled' : ''}>${q('Restore files', 'Восстановить файлы')}</button>` : `<button class="btn btn-secondary btn-sm" data-a="resumeMediaBackup" data-id="${esc(job.id)}" ${m.busy || job.archived || !canWrite ? 'disabled' : ''}>${q('Continue copying', 'Продолжить копирование')}</button>`}` : `<span class="hint">${job.deleting ? q('Deletion started', 'Удаление началось') : q('Source access is unavailable', 'Нет доступа к исходным проектам')}</span>`}
    ${canWrite ? `<button class="btn btn-ghost btn-sm" data-a="editMediaCopy" data-id="${esc(job.id)}" ${m.busy || job.deleting ? 'disabled' : ''}>${q('Settings', 'Настройки')}</button><button class="btn btn-ghost btn-sm" data-a="archiveMediaCopy" data-id="${esc(job.id)}" data-archive="${!job.archived}" ${m.busy || job.deleting ? 'disabled' : ''}>${job.archived ? q('Return from archive', 'Вернуть из архива') : q('Archive', 'В архив')}</button>${job.archived ? `<button class="btn btn-danger-ghost btn-sm" data-a="deleteMediaCopy" data-id="${esc(job.id)}" ${m.busy ? 'disabled' : ''}>${job.deleting ? q('Continue removal', 'Продолжить удаление') : q('Remove copy set…', 'Удалить набор копий…')}</button>` : ''}` : ''}</div></article>`,
        )
        .join('') || `<p class="hint">${q('No sets in this view.', 'В этом списке нет наборов.')}</p>`
    }</div>`
  );
}
function inventoryView(m, H) {
  const item = m.inventory;
  return (
    H(q('Copy contents', 'Состав копии')) +
    `<div class="modal-b" translate="no"><p>${esc(item.label)}</p><p>${item.entries.length} · ${fsize(item.entries.reduce((sum, entry) => sum + entry.bytes, 0))}</p><ul>${item.entries
      .slice(0, item.limit || 50)
      .map(
        entry =>
          `<li>${esc(entry.name)} · ${fsize(entry.bytes)} · ${entry.copied ? q('Copied', 'Скопирован') : q('Pending', 'Ожидает')}<details><summary>${q('Checksum', 'Контрольная сумма')}</summary><code>${esc(entry.checksum || '—')}</code></details></li>`,
      )
      .join(
        '',
      )}</ul>${item.entries.length > (item.limit || 50) ? `<button class="btn btn-secondary btn-sm" data-a="moreMediaInventory">${q('Show more', 'Показать ещё')}</button>` : ''}</div><div class="modal-f"><button class="btn btn-secondary" data-a="backMediaCopies">${q('Back', 'Назад')}</button></div>`
  );
}
function settingsView(m, H) {
  return (
    H(q('Copy settings', 'Настройки копии')) +
    `<div class="modal-b" translate="no"><label class="field"><span class="label">${q('Name', 'Название')}</span><input class="input" maxlength="120" data-in="mediaCopyField" data-field="label" value="${esc(m.edit.label)}"></label><label class="field"><span class="label">${q('Automatic archive', 'Автоматическое архивирование')}</span><select class="select" data-in="mediaCopyField" data-field="retentionDays">${retentionOptions(m.edit.retentionDays)}</select></label><p class="hint">${q('Expiry archives the set; it never silently deletes binaries.', 'По истечении срока набор попадёт в архив. Файлы не удаляются автоматически.')}</p>${m.error ? `<p class="err" role="alert">${esc(m.error)}</p>` : ''}</div><div class="modal-f"><button class="btn btn-secondary" data-a="backMediaCopies" ${m.busy ? 'disabled' : ''}>${q('Cancel', 'Отмена')}</button><button class="btn btn-primary" data-a="saveMediaCopySettings" ${m.busy ? 'disabled' : ''}>${q('Save', 'Сохранить')}</button></div>`
  );
}
function restoreView(m, H) {
  const r = m.restore,
    plan = r.plan;
  const targets = visibleProjects().filter(project => canEditProject(project, D().me, S.ui.currentUser?.role));
  const project = targets.find(project => project.id === r.project);
  const pending = plan?.entries.filter(entry => !entry.registered) || [];
  return (
    H(q('Review file restoration', 'Проверка восстановления файлов')) +
    `<div class="modal-b" translate="no"><p>${q('Copies will be registered as new files in the chosen destination. Existing files will not be overwritten.', 'Копии станут новыми файлами в выбранном месте. Существующие файлы не будут перезаписаны.')}</p>
    <label class="field"><span class="label">${q('Destination project', 'Проект назначения')}</span><select class="select" data-in="mediaRestoreDestination" data-field="project" ${m.busy ? 'disabled' : ''}><option value="">${q('Choose a project…', 'Выберите проект…')}</option>${targets.map(p => `<option value="${esc(p.id)}" ${p.id === r.project ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
    <label class="field"><span class="label">${q('Destination folder', 'Папка назначения')}</span><select class="select" data-in="mediaRestoreDestination" data-field="folderId" ${m.busy || !project ? 'disabled' : ''}><option value="">${q('Project root', 'Корень проекта')}</option>${fileFolders(
      project,
    )
      .filter(folder => !folder.archived)
      .map(
        folder =>
          `<option value="${esc(folder.id)}" ${folder.id === r.folderId ? 'selected' : ''}>${esc(
            fileFolderPath(project, folder.id)
              .map(f => f.name)
              .join(' / '),
          )}</option>`,
      )
      .join('')}</select></label>
    ${m.error ? `<p class="err" role="alert">${esc(m.error)}</p>` : ''}${m.busy ? `<p role="status">${esc(m.progress || q('Checking…', 'Проверяем…'))}</p>` : ''}
    ${plan ? `<p>${q('Source copy', 'Исходная копия')}: ${esc(new Date(plan.createdAt).toLocaleString(isRussian() ? 'ru-RU' : 'en-US'))}</p><p role="status">${q('Files to process', 'Файлов к обработке')}: ${pending.length} · ${fsize(plan.capacity.bytes)} · ${q('Verified registrations', 'Подтверждённых восстановлений')}: ${plan.entries.length - pending.length}</p><p class="hint">${plan.capacity.availableBytes === null ? q('Drive quota is unavailable. Space will be checked again while restoring.', 'Квота Google Диска недоступна. Место будет проверяться при восстановлении.') : `${q('Available Drive space', 'Доступно на Google Диске')}: ${fsize(plan.capacity.availableBytes)}`}</p>${plan.capacity.sufficient === false ? `<p class="err" role="alert">${q('Not enough space for the remaining files.', 'Недостаточно места для оставшихся файлов.')}</p>` : ''}<ul>${plan.entries.map(entry => `<li><span>${esc(entry.name)}</span> · ${fsize(entry.bytes)} · ${entry.registered ? q('Registered', 'Восстановлен') : q('Pending', 'Ожидает')}<details><summary>${q('Checksum', 'Контрольная сумма')}</summary><code>${esc(entry.checksum || '—')}</code></details></li>`).join('')}</ul>` : ''}</div>
    <div class="modal-f"><button class="btn btn-secondary" data-a="backMediaCopies" ${m.busy ? 'disabled' : ''}>${q('Back', 'Назад')}</button><button class="btn btn-secondary" data-a="reviewMediaRestore" ${m.busy || !project ? 'disabled' : ''}>${q('Review destination and space', 'Проверить назначение и место')}</button>${plan ? `<button class="btn btn-primary" data-a="confirmMediaRestore" ${m.busy || !pending.length || plan.capacity.sufficient === false ? 'disabled' : ''}>${q('Restore reviewed files', 'Восстановить проверенные файлы')}</button>` : ''}</div>`
  );
}
async function operation(fn) {
  const m = S.ui.modals.at(-1);
  if (!current(m) || m.render !== view || m.busy) return;
  m.busy = true;
  m.error = '';
  render();
  try {
    await fn(m);
  } catch (error) {
    if (current(m)) m.error = mediaBackupError(error, isRussian());
  } finally {
    if (current(m)) {
      m.busy = false;
      const error = m.error;
      await update(m);
      m.error = error;
      render();
    }
  }
}
async function advance(m, id) {
  for (;;) {
    if (!current(m)) return;
    const { job } = await mediaBackupRequest(`/${encodeURIComponent(id)}/advance`, {});
    if (!current(m)) return;
    m.progress = `${job.done}/${job.files}`;
    render();
    if (job.ready || document.hidden) return;
  }
}
A.createMediaBackup = () =>
  operation(async m => {
    const { job } = await mediaBackupRequest('', {
      ids: m.ids,
      label: m.copyLabel || `${q('File copy', 'Копия файлов')} ${new Date().toLocaleDateString(isRussian() ? 'ru-RU' : 'en-US')}`,
      retentionDays: Number(m.retentionDays || 0),
    });
    await advance(m, job.id);
  });
A.resumeMediaBackup = el => operation(m => advance(m, el.dataset.id));
A.downloadMediaManifest = el =>
  operation(async m => {
    const manifest = await mediaBackupRequest(`/${encodeURIComponent(el.dataset.id)}/manifest`);
    if (!current(m)) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `smena-media-${el.dataset.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });
A.restoreMediaBackup = el => {
  const m = S.ui.modals.at(-1);
  if (!current(m) || m.busy || !m.jobs.some(job => job.id === el.dataset.id)) return;
  m.restore = { id: el.dataset.id, project: '', folderId: null, plan: null };
  m.error = m.progress = '';
  render();
};
IN.mediaRestoreDestination = el => {
  const m = S.ui.modals.at(-1);
  if (!current(m) || m.busy || !m.restore || !['project', 'folderId'].includes(el.dataset.field)) return;
  m.restore[el.dataset.field] = el.value || null;
  if (el.dataset.field === 'project') m.restore.folderId = null;
  m.restore.plan = null;
  m.error = '';
  render();
};
A.backMediaCopies = () => {
  const m = S.ui.modals.at(-1);
  if (current(m) && !m.busy) {
    m.restore = m.inventory = m.edit = null;
    m.error = '';
    render();
  }
};
A.reviewMediaRestore = () =>
  operation(async m => {
    if (!m.restore?.project) return;
    const { id, project, folderId } = m.restore;
    const plan = await mediaBackupRequest(`/${encodeURIComponent(id)}/restore-plan`, { project, folderId });
    if (current(m)) m.restore.plan = plan;
  });
A.confirmMediaRestore = () =>
  operation(async m => {
    const r = m.restore,
      plan = r?.plan;
    if (!plan || plan.capacity.sufficient === false) return;
    const pending = plan.entries.filter(entry => !entry.registered);
    for (const [step, entry] of pending.entries()) {
      if (!current(m)) break;
      await mediaBackupRequest(`/${encodeURIComponent(r.id)}/restore`, {
        project: r.project,
        folderId: r.folderId,
        index: entry.index,
        reviewKey: plan.reviewKey,
      });
      entry.registered = true;
      m.progress = `${step + 1}/${pending.length}`;
      if (current(m)) render();
    }
    if (current(m)) {
      await refreshWorkspaceFromServer();
      r.plan = await mediaBackupRequest(`/${encodeURIComponent(r.id)}/restore-plan`, { project: r.project, folderId: r.folderId });
    }
  });

IN.mediaCopyField = el => {
  const m = S.ui.modals.at(-1);
  if (!current(m) || m.busy || !['label', 'copyLabel', 'retentionDays'].includes(el.dataset.field)) return;
  (m.edit || m)[el.dataset.field] = el.value;
};
A.mediaCopyTab = el => {
  const m = S.ui.modals.at(-1);
  if (current(m) && !m.busy) {
    m.showArchive = el.dataset.archive === 'true';
    render();
  }
};
A.viewMediaInventory = el =>
  operation(async m => {
    const item = await mediaBackupRequest(`/${encodeURIComponent(el.dataset.id)}/inventory`);
    if (current(m)) m.inventory = item;
  });
A.moreMediaInventory = () => {
  const m = S.ui.modals.at(-1);
  if (current(m) && m.inventory) {
    m.inventory.limit = (m.inventory.limit || 50) + 50;
    render();
  }
};
A.editMediaCopy = el => {
  const m = S.ui.modals.at(-1),
    job = m?.jobs?.find(job => job.id === el.dataset.id);
  if (!current(m) || m.busy || !job) return;
  m.edit = { id: job.id, label: job.label || q('File copy', 'Копия файлов'), retentionDays: job.retentionDays || 0 };
  m.error = '';
  render();
};
A.saveMediaCopySettings = () =>
  operation(async m => {
    if (!m.edit) return;
    await mediaBackupRequest(`/${encodeURIComponent(m.edit.id)}/settings`, { label: m.edit.label, retentionDays: Number(m.edit.retentionDays) });
    if (current(m)) m.edit = null;
  });
A.archiveMediaCopy = el =>
  operation(async () => {
    await mediaBackupRequest(`/${encodeURIComponent(el.dataset.id)}/settings`, { archived: el.dataset.archive === 'true' });
  });
A.deleteMediaCopy = el => {
  const m = S.ui.modals.at(-1),
    job = m?.jobs?.find(job => job.id === el.dataset.id);
  if (!current(m) || m.busy || !job?.archived) return;
  confirmDlg({
    title: q('Remove this copy set?', 'Удалить этот набор копий?'),
    typeName: q('Remove', 'Удалить'),
    body: `<p translate="no">${esc(job.label || q('File copy', 'Копия файлов'))}</p><p translate="no">${q('The independent copies and manifest will be removed. In Google Drive they go to its Trash; local-storage copies are deleted. There is no undo in this app. Original and restored files are not removed.', 'Независимые копии и манифест будут удалены. На Google Диске они попадут в его корзину; локальные копии удаляются. Отмены в приложении нет. Исходные и восстановленные файлы сохраняются.')}</p>`,
    ok: q('Remove copy set', 'Удалить набор копий'),
    run: () =>
      operation(async m => {
        for (let index = job.removed || 0; index <= job.files && current(m); index++) {
          await mediaBackupRequest(`/${encodeURIComponent(job.id)}/purge`, { index, confirmation: job.id });
          m.progress = `${index + 1}/${job.files + 1}`;
          if (current(m)) render();
        }
      }),
  });
};
