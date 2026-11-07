import { A, IN } from '../actions/actions.js';
import { S, D, save } from '../core/store.js';
import { getSessionGeneration, knowledgeImportRequest } from '../core/api.js';
import { workspaceSyncIsClean, queueWorkspaceSync } from '../core/workspace-sync.js';
import { refreshWorkspaceFromServer } from '../core/bootstrap.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';
import { isRussian } from '../core/i18n.js';
import { esc } from '../core/utils.js';
import { prepareKnowledgeImportManifest, readImportSource } from '../shared/knowledge-import-manifest.js';
import { knowledgeImportReport } from '../shared/knowledge-import-report.js';
import '../styles/knowledge-import-queue.css';
const T = (en, ru) => (isRussian() ? ru : en);
let activeImport = null;
const abandonPreviousScope = () => {
  for (const modal of S.ui.modals) if (modal.knowledgeImportQueue && modal.owner !== getSessionGeneration()) modal.abort?.abort();
  S.ui.modals = S.ui.modals.filter(modal => !modal.knowledgeImportQueue || modal.owner === getSessionGeneration());
  if (activeImport && activeImport.owner !== getSessionGeneration()) {
    activeImport.stopping = true;
    activeImport = null;
    S.ui.atomicOperation = false;
  }
};
window.addEventListener('smena:upload-scope-change', abandonPreviousScope);
window.addEventListener('smena:session-account-changed', abandonPreviousScope);
const current = () => {
  const m = S.ui.modals.at(-1);
  return m?.knowledgeImportQueue && m.owner === getSessionGeneration() ? m : null;
};
const request = async (suffix, payload) => (await knowledgeImportRequest(suffix, payload)).job;
const messages = error =>
  ({
    BACKUP_PREPARATION_INTEGRITY: T(
      'Recovery preparation stopped because an object could not be verified. Progress is retained; check storage before retrying.',
      'Подготовка копии остановлена: объект не прошёл проверку. Прогресс сохранён; проверьте хранилище перед повтором.',
    ),
    KNOWLEDGE_IMPORT_BACKUP_PENDING: T(
      'Continue preparing the recovery copy before importing files.',
      'Продолжите подготовку резервной копии перед импортом файлов.',
    ),
    KNOWLEDGE_IMPORT_SOURCE_CHANGED: T(
      'This source file changed. Choose the original file used to start this import.',
      'Исходный файл изменился. Выберите исходную версию, с которой начат импорт.',
    ),
    KNOWLEDGE_IMPORT_FOLDER_CHANGED: T(
      'The destination folder was removed. Saved notes are retained. Choose a new destination for a new queue.',
      'Папка назначения удалена. Сохранённые заметки остаются; для новой очереди выберите другую папку.',
    ),
    KNOWLEDGE_IMPORT_LIMIT: T(
      'Three unfinished queues are already active. Resume or stop one before starting another.',
      'Уже есть три незавершённые очереди. Продолжите или остановите одну перед созданием новой.',
    ),
    KNOWLEDGE_IMPORT_PAUSED: T('The queue is paused. Continue when you are ready.', 'Очередь приостановлена. Продолжите, когда будете готовы.'),
    KNOWLEDGE_IMPORT_BACKUP_FAILED: T(
      'The recovery copy could not be created. No new import was started; check storage and retry.',
      'Не удалось создать копию восстановления. Новый импорт не начат; проверьте хранилище и повторите.',
    ),
    originals: T(
      'Reselect every pending original file. Saved files do not need to be selected again.',
      'Выберите все ожидающие исходные файлы. Уже сохранённые файлы выбирать повторно не нужно.',
    ),
    'Invalid note filename.': T('Invalid note filename.', 'Недопустимое имя файла заметки.'),
    'Each note file must be smaller than 2 MiB.': T('Each note file must be smaller than 2 MiB.', 'Каждый файл заметки должен быть меньше 2 MiB.'),
    'The decoded note exceeds the request limit.': T('The decoded note exceeds the request limit.', 'Текст заметки превышает лимит одного запроса.'),
    'Select no more than 256 MiB of note files.': T('Select no more than 256 MiB of note files.', 'Выберите не более 256 MiB файлов заметок.'),
    'Only TXT, MD and Markdown files are supported.': T('Only TXT, MD and Markdown files are supported.', 'Поддерживаются только TXT, MD и Markdown.'),
    'The note file is empty.': T('The note file is empty.', 'Файл заметки пуст.'),
    'This file is not a text note.': T('This file is not a text note.', 'Файл не является текстовой заметкой.'),
    'Select up to 1,000 note files.': T('Select up to 1,000 note files.', 'Выберите от 1 до 1 000 файлов заметок.'),
    'Duplicate selected file.': T('This identical file was selected more than once.', 'Один и тот же файл выбран несколько раз.'),
  })[error.code || error.message] ||
  (error.status === 429
    ? T(
        'The service is rate limited. Saved progress is retained; wait before continuing.',
        'Сервис ограничил частоту запросов. Прогресс сохранён; подождите перед продолжением.',
      )
    : error.status === 503
      ? T(
          'Storage is temporarily unavailable. Saved progress is retained; continue later.',
          'Хранилище временно недоступно. Прогресс сохранён; продолжите позже.',
        )
      : '') ||
  T(
    'Unable to continue. Saved notes are retained; reopen the queue to retry.',
    'Не удалось продолжить. Сохранённые заметки остаются в базе; откройте очередь для повтора.',
  );
function form(m, H) {
  const job = m.job,
    entries = job?.entries || m.review?.entries || [],
    done = entries.filter(e => e.status).length;
  const rows = entries.slice(0, 30),
    errors = m.review?.errors || [];
  const label =
    job?.state === 'complete'
      ? T('Import complete', 'Импорт завершён')
      : job?.state === 'canceled'
        ? T('Import stopped', 'Импорт остановлен')
        : T('Import notes', 'Импорт заметок');
  const finished = ['complete', 'canceled'].includes(job?.state);
  if (finished)
    return `${H(label)}<div class="modal-b knowledge-import-queue" translate="no"><p role="status">${T('Saved', 'Сохранено')}: ${entries.filter(e => e.status === 'imported').length} · ${T('Skipped', 'Пропущено')}: ${entries.filter(e => e.status === 'skipped').length} / ${entries.length}</p><p class="hint">${m.busy ? T('Refreshing the catalog…', 'Обновление каталога…') : T('Notes are saved in the selected folder.', 'Заметки сохранены в выбранной папке.')}</p>${m.error ? `<p class="err" role="alert">${esc(m.error)}</p>` : ''}</div><div class="modal-f" translate="no"><button class="btn btn-primary" data-a="closeModal">${T('Close', 'Закрыть')}</button></div>`;
  return `${H(label)}<div class="modal-b knowledge-import-queue" translate="no"><p class="hint">${T('TXT/MD · up to 1,000 files · 256 MiB total · 2 MiB per file.', 'TXT/MD · до 1 000 файлов · всего 256 MiB · 2 MiB на файл.')}</p><p>${T('Destination', 'Папка')}: <strong>${esc(m.folderName)}</strong></p><p class="hint">${T('A recovery backup is created before import. Closing or pausing stops after the current request. Reselect the original files to resume after reload.', 'Перед импортом создаётся резервная копия. Закрытие или пауза останавливают очередь после текущего запроса. После обновления страницы выберите исходные файлы повторно.')}</p>
 ${m.reading ? `<p role="status">${T('Checking files', 'Проверка файлов')}: ${m.progress || 0}</p>` : ''}
 ${m.notice ? `<p class="hint" role="status">${esc(m.notice)}</p>` : ''}
 ${m.error ? `<p class="err" role="alert">${esc(m.error)}</p>` : ''}
 ${!job && entries.length ? `<label>${T('Matching title in this folder', 'Совпадение названия в этой папке')}<select class="select" data-in="knowledgeQueuePolicy"><option value="copy" ${m.policy === 'copy' ? 'selected' : ''}>${T('Import a separate copy', 'Импортировать отдельную копию')}</option><option value="skip" ${m.policy === 'skip' ? 'selected' : ''}>${T('Skip', 'Пропустить')}</option></select></label>` : ''}
 ${entries.length ? `${job?.backupProgress ? `<p class="hint" role="status">${T('Preparing recovery copy · verified objects', 'Подготовка резервной копии · проверено объектов')}: ${job.backupProgress.copied}</p>` : ''}<p role="status">${T('Saved or skipped', 'Сохранено или пропущено')}: ${done} / ${entries.length}</p><progress max="${entries.length}" value="${done}" aria-label="${T('Import progress', 'Ход импорта')}"></progress><ul class="knowledge-import-entries">${rows.map(e => `<li><span translate="no">${esc(e.name)}</span><span>${e.status === 'imported' ? T('Saved', 'Сохранено') : e.status === 'skipped' ? T('Skipped', 'Пропущено') : T('Pending', 'Ожидает')}</span></li>`).join('')}</ul>${entries.length > 30 ? `<p class="hint">${T('Showing the first 30 filenames; progress includes every file.', 'Показаны первые 30 имён; прогресс учитывает все файлы.')}</p>` : ''}` : ''}
 ${
   errors.length
     ? `<details><summary>${T('Files excluded', 'Исключённые файлы')}: ${errors.length}</summary><ul>${errors
         .slice(0, 30)
         .map(e => `<li><span translate="no">${esc(e.name)}</span> · ${esc(messages({ message: e.error }))}</li>`)
         .join('')}</ul></details>`
     : ''
 }
 ${entries.length || errors.length ? `<button class="btn btn-ghost btn-sm" data-a="downloadKnowledgeImportReport">${T('Download full report', 'Скачать полный отчёт')}</button>` : ''}
 ${!m.busy && !m.reading ? `<button class="btn btn-secondary" data-a="chooseKnowledgeQueueFiles" ${m.jobsLoading ? 'disabled' : ''}>${m.jobsLoading ? T('Loading queues…', 'Загрузка очередей…') : T('Choose original files', 'Выбрать исходные файлы')}</button><input type="file" id="knowledge-queue-files" accept=".txt,.md,.markdown" multiple hidden data-in="knowledgeQueueFiles" ${m.jobsLoading ? 'disabled' : ''}>` : ''}
 ${
   !job && (m.jobs || []).some(j => ['preparing', 'running', 'paused'].includes(j.state))
     ? `<section><h3>${T('Unfinished imports', 'Незавершённые импорты')}</h3>${m.jobs
         .filter(j => ['preparing', 'running', 'paused'].includes(j.state))
         .map(
           j =>
             `<button class="btn btn-secondary" data-a="resumeKnowledgeQueue" data-id="${esc(j.id)}">${T('Continue', 'Продолжить')} · ${j.entries.filter(e => e.status).length} / ${j.entries.length}</button>`,
         )
         .join('')}</section>`
     : ''
 }
 </div><div class="modal-f" translate="no">${m.busy ? `<button class="btn btn-secondary" data-a="pauseKnowledgeQueue" ${m.stopping ? 'disabled' : ''}>${job?.backupProgress ? T('Pause after this step', 'Пауза после этого шага') : T('Pause after this file', 'Пауза после этого файла')}</button>` : `${job && !['complete', 'canceled'].includes(job.state) ? `<button class="btn btn-ghost" data-a="cancelKnowledgeQueue">${T('Stop import', 'Остановить импорт')}</button>` : ''}<button class="btn btn-secondary" data-a="closeModal">${T('Close', 'Закрыть')}</button>`}<button class="btn btn-primary" data-a="runKnowledgeQueue" ${m.busy || m.reading || !entries.length || (!m.review?.handles?.size && !job?.backupProgress) || ['complete', 'canceled'].includes(job?.state) ? 'disabled' : ''}>${job ? T('Continue import', 'Продолжить импорт') : T('Start import', 'Начать импорт')}</button></div>`;
}
async function review(m, files) {
  m.reading = true;
  m.error = '';
  m.notice = '';
  m.abort = new AbortController();
  render();
  try {
    const reviewed = await prepareKnowledgeImportManifest(files, {
      signal: m.abort.signal,
      onProgress: n => {
        if (current() !== m) m.abort.abort();
        if (current() === m) {
          m.progress = n;
          if (n % 10 === 0) render();
        }
      },
    });
    if (current() !== m) return;
    if (m.job) {
      const pending = m.job.entries.filter(e => !e.status);
      if (pending.some(e => !reviewed.handles.has(e.key))) throw Error('originals');
    }
    m.review = reviewed;
  } catch (error) {
    if (current() === m) m.error = messages(error);
  } finally {
    if (current() === m) {
      m.reading = false;
      render();
    }
  }
}
export async function openKnowledgeImportQueue(files, folderId = S.ui.knowledgeFolder) {
  if (S.ui.currentUser?.role === 'viewer') return;
  const folder = D().knowledgeFolders?.find(f => f.id === folderId);
  openModal({
    type: 'knowledgeTool',
    knowledgeImportQueue: true,
    owner: getSessionGeneration(),
    folderId: folder?.id || null,
    folderName: folder?.name || T('No folder', 'Без папки'),
    policy: 'copy',
    jobsLoading: !files?.length,
    onClose: () => m.abort?.abort(),
    requestClose: () => {
      m.stopping = true;
      m.closeRequested = true;
      render();
    },
    render: form,
  });
  const m = current();
  if (files?.length) return review(m, files);
  try {
    m.jobs = (await knowledgeImportRequest()).jobs;
  } catch (error) {
    if (current() === m) m.error = messages(error);
  } finally {
    m.jobsLoading = false;
    if (current() === m) render();
  }
}
A.chooseKnowledgeQueueFiles = () => document.getElementById('knowledge-queue-files')?.click();
A.downloadKnowledgeImportReport = () => {
  const m = current();
  if (!m) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(knowledgeImportReport(m.job, m.review, m.failedEntry || m.preparationFailure), null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'smena-note-import-report.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
IN.knowledgeQueueFiles = el => {
  const m = current(),
    files = [...el.files];
  el.value = '';
  if (m && files.length) return review(m, files);
};
IN.knowledgeQueuePolicy = el => {
  const m = current();
  if (m && !m.job) m.policy = el.value;
};
A.resumeKnowledgeQueue = el => {
  const m = current(),
    job = m?.jobs?.find(j => j.id === el.dataset.id);
  if (!job) return;
  m.job = job;
  m.folderId = job.folderId;
  m.folderName = D().knowledgeFolders?.find(f => f.id === job.folderId)?.name || T('No folder', 'Без папки');
  m.review = null;
  render();
};
A.pauseKnowledgeQueue = () => {
  const m = current();
  if (m) {
    m.stopping = true;
    render();
  }
};
A.cancelKnowledgeQueue = async () => {
  const m = current();
  if (m?.job && !m.busy) {
    try {
      m.job = await request('/' + m.job.id, { state: 'canceled' });
    } catch (error) {
      m.error = messages(error);
    }
    if (current() === m) render();
  }
};
A.runKnowledgeQueue = async () => {
  const m = current();
  if (!m || m.busy || m.reading || (!m.review?.handles?.size && !m.job?.backupProgress) || S.ui.atomicOperation) return;
  m.busy = true;
  m.preparationFailure = null;
  m.stopping = false;
  m.error = '';
  m.notice = '';
  activeImport = m;
  S.ui.atomicOperation = true;
  render();
  try {
    if (!workspaceSyncIsClean(S.data)) {
      save();
      await queueWorkspaceSync(S.data);
      if (!workspaceSyncIsClean(S.data)) throw Error('unsaved');
    }
    if (current() !== m) return;
    if (!m.job)
      m.job = await request('', {
        clientId: (m.clientId ||= crypto.randomUUID()),
        entries: m.review.entries,
        folderId: m.folderId,
        policy: m.policy,
        preparedBackup: true,
      });
    else m.job = await request('/' + m.job.id, { state: 'running' });
    while (m.job.state === 'preparing' && current() === m && !m.stopping) {
      m.job = await request('/' + m.job.id + '/prepare', {});
      if (current() === m) render();
    }
    if (!m.stopping && m.job.state === 'running' && !m.review?.handles?.size) {
      m.notice = T(
        'Recovery copy ready. Choose the original files to continue importing.',
        'Резервная копия готова. Выберите исходные файлы, чтобы продолжить импорт.',
      );
      return;
    }
    for (const entry of m.job.entries.filter(e => !e.status)) {
      if (current() !== m || m.stopping) break;
      const file = m.review.handles.get(entry.key);
      if (!file) throw Error('originals');
      const source = await readImportSource(file);
      if (current() !== m || m.stopping) break;
      m.failedEntry = { key: entry.key };
      m.job = await request('/' + m.job.id + '/entries', { key: entry.key, source });
      m.failedEntry = null;
      if (current() === m) render();
    }
    if (current() === m && m.stopping && m.job.state !== 'complete') m.job = await request('/' + m.job.id, { state: 'paused' });
  } catch (error) {
    if (m.failedEntry) m.failedEntry.code = error.code || 'REQUEST_FAILED';
    else if (m.job?.backupProgress) m.preparationFailure = { phase: 'preparation', code: error.code || 'REQUEST_FAILED' };
    if (current() === m) m.error = messages(error);
  } finally {
    if (m.owner === getSessionGeneration()) {
      if (m.job)
        await refreshWorkspaceFromServer({ force: true }).catch(() => {
          m.error = T('Saved progress is retained. Reload to refresh the catalog.', 'Прогресс сохранён. Обновите страницу, чтобы загрузить каталог.');
        });
      if (activeImport === m) {
        activeImport = null;
        S.ui.atomicOperation = false;
      }
      m.busy = false;
      if (m.job?.state === 'complete') m.review?.handles.clear();
      if (current() === m && m.closeRequested) closeModal();
      render();
    }
  }
};
