import { S, proj } from '../core/store.js';
import { esc } from '../core/utils.js';
import { isRussian, t } from '../core/i18n.js';
import { ic } from '../core/icons.js';
import { fsize } from './helpers.js';
const q = (en, ru) => (isRussian() ? ru : en);

export function uploadsHtml() {
  const jobs = S.ui.uploads || [];
  if (!jobs.length) return '';
  const active = jobs.filter(job => ['uploading', 'verifying', 'queued', 'waiting-network', 'retrying'].includes(job.phase));
  const waiting = jobs.filter(job => ['paused', 'failed'].includes(job.phase));
  const reselect = jobs.some(job => job.phase === 'needs-file');
  const complete = jobs.filter(job => job.phase === 'done').length;
  const total = jobs.reduce((sum, job) => sum + job.bytes, 0),
    sent = jobs.reduce((sum, job) => sum + (job.phase === 'done' ? job.bytes : job.accepted || 0), 0);
  const pages = Math.ceil(jobs.length / 20),
    page = Math.min(pages - 1, Math.max(0, S.ui.uploadQueuePage || 0));
  const labels = {
    queued: q('Queued', 'В очереди'),
    uploading: q('Uploading', 'Загрузка'),
    verifying: q('Saving to catalog…', 'Сохранение в каталоге…'),
    'waiting-network': q('Waiting for connection · resumes automatically', 'Ожидаем сеть · продолжим автоматически'),
    retrying: q('Connection interrupted · retrying automatically', 'Связь прервалась · повторим автоматически'),
    paused: q('Paused', 'Пауза'),
    failed: q('Needs attention', 'Требует внимания'),
    done: q('Uploaded', 'Загружено'),
    cancelled: q('Cancelled', 'Отменено'),
    'needs-file': q('Choose the source file to continue', 'Выберите исходный файл для продолжения'),
  };
  return `<section class="file-upload-queue" translate="no" aria-label="${q('Upload queue', 'Очередь загрузки')}"><header><div class="grow min0"><strong>${q('Uploads', 'Загрузки')}</strong><span class="hint" role="status">${complete} / ${jobs.length} · ${fsize(total)}</span></div><div class="row">${active.length && S.ui.filePolicy?.directUploadEnabled ? `<button class="ibtn" data-a="pauseUploads" aria-label="${q('Pause all uploads', 'Приостановить все загрузки')}" title="${q('Pause all', 'Приостановить все')}">${ic('pause', 15)}</button>` : ''}${waiting.length ? `<button class="ibtn" data-a="resumeUploads" aria-label="${q('Resume uploads', 'Продолжить загрузки')}" title="${q('Resume', 'Продолжить')}">${ic('play', 15)}</button>` : ''}${jobs.some(job => ['done', 'cancelled'].includes(job.phase)) ? `<button class="ibtn" data-a="clearFinishedUploads" aria-label="${q('Clear finished uploads', 'Убрать завершённые загрузки')}" title="${q('Clear finished', 'Убрать завершённые')}">${ic('list-checks', 15)}</button>` : ''}${jobs.some(job => !['done', 'cancelled'].includes(job.phase)) && S.ui.filePolicy?.directUploadEnabled ? `<details class="ui-menu file-upload-tools"><summary class="ibtn" aria-label="${q('Upload tools', 'Инструменты загрузки')}">${ic('ellipsis', 15)}</summary><div><button class="btn btn-ghost btn-sm" data-a="reloadUploadQueue">${ic('refresh-cw', 15)}${q('Save queue and reload', 'Сохранить очередь и обновить')}</button><p class="hint">${q('Uploads will pause. Choose the same source files after reloading.', 'Загрузки приостановятся. После обновления выберите те же исходные файлы.')}</p></div></details>` : ''}</div></header><div class="prog" role="progressbar" aria-label="${q('Total upload progress', 'Общий прогресс загрузки')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${total ? Math.floor((sent / total) * 100) : 0}" data-upload-total-progress style="--p:${total ? sent / total : 0}"><i style="--p:inherit"></i></div>${reselect ? `<input type="file" id="file-upload-reselect" multiple hidden><button class="btn btn-secondary btn-sm" data-a="reselectUploadFiles">${ic('folder-open', 15)}${q('Choose original files', 'Выбрать исходные файлы')}</button>` : ''}<details class="file-upload-list" ${S.ui.uploadQueueExpanded !== false ? 'open' : ''}><summary>${q('Files and progress', 'Файлы и прогресс')} · ${jobs.length}</summary><div class="file-upload-rows">${jobs
    .slice(page * 20, (page + 1) * 20)
    .map(job => {
      const retry = ['paused', 'failed'].includes(job.phase),
        restart = ['UPLOAD_SESSION_EXPIRED', 'UPLOAD_TICKET_EXPIRED'].includes(job.code);
      return `<article class="file-upload-row"><div class="min0"><strong class="trunc" title="${esc(job.name)}">${esc(job.name)}</strong><small>${esc(proj(job.project)?.name || job.project)} · ${fsize(job.bytes)}</small><div class="row"><span class="hint">${job.sourceChecking ? q('Checking source contents…', 'Проверяем содержимое исходного файла…') : labels[job.phase] || ''}</span><span class="sp"></span><span class="hint num" data-upload-percent="${job.id}">${job.pct || 0}%</span></div>${!['done', 'cancelled'].includes(job.phase) ? `<div class="prog" data-upload-bar="${job.id}" role="progressbar" aria-label="${esc(job.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${job.pct || 0}" style="--p:${(job.pct || 0) / 100}"><i style="--p:inherit"></i></div>` : ''}${job.phase === 'failed' ? `<p class="err">${restart ? q('Session expired. Retrying starts this file again.', 'Сеанс истёк. Повтор начнёт этот файл заново.') : esc(t(job.error || 'Upload failed.'))}</p>` : ''}</div><div class="file-upload-row-actions">${['queued', 'uploading', 'verifying', 'waiting-network', 'retrying'].includes(job.phase) && S.ui.filePolicy?.directUploadEnabled ? `<button class="ibtn" data-a="pauseUpload" data-id="${job.id}" aria-label="${esc(q('Pause: ', 'Пауза: ') + job.name)}">${ic('pause', 14)}</button>` : ''}${retry && (job.file || job.session?.uploaded?.id) ? `<button class="ibtn" data-a="retryUpload" data-id="${job.id}" aria-label="${esc((restart ? q('Start again: ', 'Начать заново: ') : q('Resume: ', 'Продолжить: ')) + job.name)}">${ic(restart ? 'rotate-cw' : 'play', 14)}</button>` : ''}${!['done', 'cancelled'].includes(job.phase) ? `<button class="ibtn" data-a="cancelUpload" data-id="${job.id}" aria-label="${esc(q('Cancel: ', 'Отменить: ') + job.name)}">${ic('x', 14)}</button>` : ''}</div></article>`;
    })
    .join(
      '',
    )}</div><details><summary>${q('Transfer details', 'Сведения о передаче')}</summary><p class="hint" data-upload-estimate>${q('Estimating…', 'Оцениваем…')}</p></details>${pages > 1 ? `<div class="row"><button class="ibtn" data-a="uploadQueuePage" data-page="${page - 1}" ${page === 0 ? 'disabled' : ''} aria-label="${q('Previous upload page', 'Предыдущая страница загрузок')}">${ic('chevron-left', 15)}</button><span class="hint">${page + 1} / ${pages}</span><button class="ibtn" data-a="uploadQueuePage" data-page="${page + 1}" ${page + 1 >= pages ? 'disabled' : ''} aria-label="${q('Next upload page', 'Следующая страница загрузок')}">${ic('chevron-right', 15)}</button></div>` : ''}<p class="hint">${q('Keep the browser active for transfers. The queue is saved on this device for up to seven days; after reopening, choose the same source files. Signing out clears checkpoints. Background transfer depends on your OS; file contents are not cached.', 'Для передачи браузер должен быть активен. Очередь хранится на устройстве до семи дней; после повторного открытия выберите те же исходные файлы. Выход очищает очередь. Работа в фоне зависит от ОС; содержимое файлов не кэшируется.')}</p></details></section>`;
}
