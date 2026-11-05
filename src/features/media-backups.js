import { A, IN } from '../actions/actions.js';
import { S, D, visibleProjects } from '../core/store.js';
import { mediaBackupRequest, getSessionGeneration } from '../core/api.js';
import { refreshWorkspaceFromServer } from '../core/bootstrap.js';
import { render } from '../shell/render.js';
import { openModal } from '../overlays/modals.js';
import { esc, fmtTimestamp } from '../core/utils.js';
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
function view(m, H) {
  if (m.restore) return restoreView(m, H);
  const targets = visibleProjects().filter(project => canEditProject(project, D().me, S.ui.currentUser?.role));
  return (
    H(q('Independent file copies', 'Независимые копии файлов')) +
    `<div class="modal-b" translate="no"><p class="hint">${q('Separate binary copies in Drive with verified size/checksum and a manifest. They use additional space and remain in the same Google account. They are not a full workspace backup. Up to four copies per account; preparation continues only while this tab runs.', 'Отдельные бинарные копии в Drive с проверкой размера и контрольной суммы, а также манифестом. Они занимают дополнительное место и остаются в том же Google-аккаунте. Это не полная копия пространства. До четырёх копий на аккаунт; подготовка продолжается, пока работает вкладка.')}</p><button class="btn btn-secondary btn-sm" data-a="createMediaBackup" ${!m.ids.length || m.busy ? 'disabled' : ''}>${q('Copy selected files', 'Скопировать выбранные файлы')} (${m.ids.length})</button>${m.error ? `<p class="err" role="alert">${esc(m.error)}</p>` : ''}${m.busy ? `<p role="status">${esc(m.progress || q('Preparing…', 'Подготовка…'))}</p>` : ''}${m.jobs.map(job => `<article class="panel" style="padding:12px;margin-block:8px"><p>${fmtTimestamp(job.createdAt, true)} · ${job.done}/${job.files} · ${fsize(job.bytes)}</p><div class="row wrap">${job.ready ? `<button class="btn btn-secondary btn-sm" data-a="downloadMediaManifest" data-id="${esc(job.id)}" ${m.busy ? 'disabled' : ''}>${q('Download manifest', 'Скачать манифест')}</button><button class="btn btn-secondary btn-sm" data-a="restoreMediaBackup" data-id="${esc(job.id)}" ${m.busy || !targets.length ? 'disabled' : ''}>${q('Restore copies', 'Восстановить копии')}</button>` : `<button class="btn btn-secondary btn-sm" data-a="resumeMediaBackup" data-id="${esc(job.id)}" ${m.busy ? 'disabled' : ''}>${q('Continue copying', 'Продолжить копирование')}</button>`}</div></article>`).join('')}</div>`
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
    ${plan ? `<p>${q('Source copy', 'Исходная копия')}: ${esc(new Date(plan.createdAt).toLocaleString(isRussian() ? 'ru-RU' : 'en-US'))}</p><p role="status">${q('New files', 'Новых файлов')}: ${pending.length} · ${fsize(plan.capacity.bytes)} · ${q('Already registered', 'Уже восстановлено')}: ${plan.entries.length - pending.length}</p><p class="hint">${plan.capacity.availableBytes === null ? q('Drive quota is unavailable. Space will be checked again while restoring.', 'Квота Google Диска недоступна. Место будет проверяться при восстановлении.') : `${q('Available Drive space', 'Доступно на Google Диске')}: ${fsize(plan.capacity.availableBytes)}`}</p>${plan.capacity.sufficient === false ? `<p class="err" role="alert">${q('Not enough space for the remaining files.', 'Недостаточно места для оставшихся файлов.')}</p>` : ''}<ul>${plan.entries.map(entry => `<li><span>${esc(entry.name)}</span> · ${fsize(entry.bytes)} · ${entry.registered ? q('Registered', 'Восстановлен') : q('Pending', 'Ожидает')}<details><summary>${q('Checksum', 'Контрольная сумма')}</summary><code>${esc(entry.checksum || '—')}</code></details></li>`).join('')}</ul>` : ''}</div>
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
    const { job } = await mediaBackupRequest('', { ids: m.ids });
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
    m.restore = null;
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
