import { A } from '../actions/actions.js';
import { S, D, visibleProjects } from '../core/store.js';
import { mediaBackupRequest, getSessionGeneration } from '../core/api.js';
import { refreshWorkspaceFromServer } from '../core/bootstrap.js';
import { render } from '../shell/render.js';
import { openModal } from '../overlays/modals.js';
import { esc, fmtTimestamp } from '../core/utils.js';
import { isRussian } from '../core/i18n.js';
import { fsize } from '../ui/helpers.js';
import { canEditProject } from '../shared/project-access.js';
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
    m.error = error.message;
  }
  if (current(m)) render();
}
function view(m, H) {
  const targets = visibleProjects().filter(project => canEditProject(project, D().me, S.ui.currentUser?.role));
  return (
    H(q('Independent file copies', 'Независимые копии файлов')) +
    `<div class="modal-b" translate="no"><p class="hint">${q('Separate binary copies in Drive with verified size/checksum and a manifest. They use additional space and remain in the same Google account. They are not a full workspace backup. Up to four copies per account; preparation continues only while this tab runs.', 'Отдельные бинарные копии в Drive с проверкой размера/checksum и манифестом. Они занимают дополнительное место и остаются в том же Google-аккаунте. Это не полная копия пространства. До четырёх копий на аккаунт; подготовка продолжается, пока работает вкладка.')}</p><button class="btn btn-secondary btn-sm" data-a="createMediaBackup" ${!m.ids.length || m.busy ? 'disabled' : ''}>${q('Copy selected files', 'Скопировать выбранные файлы')} (${m.ids.length})</button>${m.error ? `<p class="err" role="alert">${esc(m.error)}</p>` : ''}${m.busy ? `<p role="status">${esc(m.progress || q('Preparing…', 'Подготовка…'))}</p>` : ''}<label class="field"><span class="label">${q('Restore into project (new files)', 'Восстановить в проект (новые файлы)')}</span><select class="select" id="media-backup-project">${targets.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label>${m.jobs.map(job => `<article class="panel" style="padding:12px;margin-block:8px"><p>${fmtTimestamp(job.createdAt, true)} · ${job.done}/${job.files} · ${fsize(job.bytes)}</p><div class="row wrap">${job.ready ? `<button class="btn btn-secondary btn-sm" data-a="downloadMediaManifest" data-id="${esc(job.id)}" ${m.busy ? 'disabled' : ''}>${q('Download manifest', 'Скачать манифест')}</button><button class="btn btn-secondary btn-sm" data-a="restoreMediaBackup" data-id="${esc(job.id)}" ${m.busy || !targets.length ? 'disabled' : ''}>${q('Restore copies', 'Восстановить копии')}</button>` : `<button class="btn btn-secondary btn-sm" data-a="resumeMediaBackup" data-id="${esc(job.id)}" ${m.busy ? 'disabled' : ''}>${q('Continue copying', 'Продолжить копирование')}</button>`}</div></article>`).join('')}</div>`
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
    if (current(m)) m.error = error.message;
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
  const project = document.getElementById('media-backup-project')?.value;
  return operation(async m => {
    const job = m.jobs.find(job => job.id === el.dataset.id);
    if (!job || !project) return;
    for (let index = 0; index < job.files && current(m); index++) {
      await mediaBackupRequest(`/${encodeURIComponent(job.id)}/restore`, { project, index });
      m.progress = `${index + 1}/${job.files}`;
      if (current(m)) render();
    }
    if (current(m)) await refreshWorkspaceFromServer();
  });
};
