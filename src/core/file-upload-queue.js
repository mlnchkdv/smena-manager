import { A, IN } from '../actions/actions.js';
import { D, S, proj, save } from './store.js';
import { uid } from './utils.js';
import { fileType } from '../ui/helpers.js';
import { isRussian, locale } from './i18n.js';
import { countLabel } from '../shared/count-label.js';
import { fileFolderPath } from '../shared/file-organization.js';
import { assertFileFolder } from '../shared/file-organization.js';
import { uploadDestination, restartUploadDestination } from '../shared/upload-destination.js';
import { render } from '../shell/render.js';
import { toast } from '../ui/toast.js';
import { canEditProject } from '../shared/project-access.js';
import { createUploadQueue, unfinishedUpload, uploadFileKey } from '../shared/upload-queue.js';
import { createUploadOwner, fullUploadFingerprint, readUploadFallback } from '../shared/upload-journal.js';
import { recoverUploadSource, uploadSourceActions } from '../shared/upload-sources.js';
import { uploadDirectFile } from './direct-upload-session.js';
import { uploadJournal, canPersistUploadHandles } from './upload-journal.js';
import { uploadResumeForecast } from '../shared/upload-resume-forecast.js';
import { getSessionGeneration, getSessionToken, uploadWorkspaceFile, SESSION_STORAGE_KEY } from './api.js';
import { queueWorkspaceSync, retryWorkspaceSync, workspaceSyncIsClean } from './workspace-sync.js';
import { applyExternalCoreSnapshot } from './bootstrap.js';
import { openModal, closeModal, fileModalRenderers } from '../overlays/modals.js';
import { preflightUpload } from './api.js';
import { esc } from './utils.js';
import { uploadsHtml } from '../ui/file-uploads.js';
import { sampleUploadRate, uploadEstimate } from '../shared/upload-rate.js';
import { fsize } from '../ui/helpers.js';
import { planFileImport } from '../shared/file-import-plan.js';
import { listWindow } from '../shared/list-window.js';
import { ic } from './icons.js';
import { disclosureOpen } from '../ui/disclosure.js';

fileModalRenderers.uploadQueue = (_modal, H) =>
  H(text('Uploads', 'Загрузки')) + `<div class="modal-b">${uploadsHtml() || text('No pending uploads.', 'Нет ожидающих загрузок.')}</div>`;
export function openUploadQueue() {
  restoreUploadQueue();
  if (!S.ui.modals.some(modal => modal.type === 'uploadQueue')) openModal({ type: 'uploadQueue' });
}
const uploadQueueLimit = 500;
const uploadSlots = () => Math.max(0, uploadQueueLimit - engine.jobs.filter(unfinishedUpload).length);
const uploadReviewReady = m =>
  m.capacity && m.resume && !m.checkingTarget && !m.targetError && m.entries.length && m.entries.length <= uploadSlots() && m.capacity.sufficient !== false;
function uploadTargetStatus(m) {
  const slots = uploadSlots();
  const availability = `<p class="hint" role="status">${text(`Queue spaces available: ${slots} of ${uploadQueueLimit}`, `Свободных мест в очереди: ${slots} из ${uploadQueueLimit}`)}</p>`;
  if (m.entries.length > slots)
    return (
      availability +
      `<p class="alert danger" role="alert">${text('Remove files from this batch to fit the available spaces.', 'Уберите лишние файлы из партии, чтобы она поместилась в очередь.')}</p>`
    );
  if (m.checkingTarget)
    return (
      availability +
      `<p role="status">${text('Checking destination…', 'Проверяем назначение…')}</p><button class="btn btn-secondary" data-a="stopUploadReviewTarget">${text('Stop check', 'Остановить проверку')}</button>`
    );
  if (m.targetError) {
    const messages = {
      timeout: text('The check took too long.', 'Проверка заняла слишком много времени.'),
      stopped: text('Destination check stopped.', 'Проверка назначения остановлена.'),
      destination: text(
        'This destination is no longer available. Choose a different project or folder.',
        'Место загрузки недоступно. Выберите другой проект или папку.',
      ),
      storage: text('Storage is unavailable. Try again shortly.', 'Хранилище недоступно. Повторите через некоторое время.'),
      space: text('Not enough space for this batch.', 'Недостаточно места для этой партии.'),
      invalid: text('The server could not verify the selected files.', 'Серверу не удалось проверить выбранные файлы.'),
    };
    return (
      availability +
      `<p class="alert danger" role="alert">${messages[m.targetError]} ${text('Your files are still selected.', 'Выбор файлов сохранён.')}</p><button class="btn btn-secondary" data-a="retryUploadReviewTarget">${text('Retry destination check', 'Повторить проверку места загрузки')}</button>`
    );
  }
  if (m.capacity?.sufficient === false)
    return (
      availability +
      `<p class="alert danger" role="alert">${text('Not enough space for this batch.', 'Недостаточно места для этой партии.')}</p><button class="btn btn-secondary" data-a="retryUploadReviewTarget">${text('Check free space again', 'Проверить место ещё раз')}</button>`
    );
  if (!m.capacity && m.entries.length)
    return (
      availability + `<button class="btn btn-secondary" data-a="retryUploadReviewTarget">${text('Check destination', 'Проверить место загрузки')}</button>`
    );
  return (
    availability +
    (m.capacity?.availableBytes === null
      ? `<p class="alert info" role="status">${text('Free space is unknown. Uploading may fail if storage is full.', 'Свободное место неизвестно. Загрузка может прерваться при заполнении хранилища.')}</p>`
      : '')
  );
}
function uploadReviewList(m, rejected = false) {
  const type = rejected ? 'rejected' : 'selected';
  const page = listWindow(rejected ? m.rejected : m.entries, m.reviewPages[type], 25);
  if (rejected && !page.total) return '';
  const label = rejected ? text('Skipped files', 'Пропущенные файлы') : text('Files and paths', 'Файлы и пути');
  if (!page.total) return `<p role="status">${text('No files selected for upload.', 'Для загрузки не выбраны файлы.')}</p>`;
  const errors = {
    duplicate: text('Already in the queue or this batch', 'Уже в очереди или в этой партии'),
    empty: text('Empty file', 'Пустой файл'),
    size: text('Exceeds the size limit', 'Превышает ограничение по размеру'),
    format: text('This format is blocked', 'Формат запрещён'),
  };
  const resume = {
    automatic: text('Resume if access is retained', 'Продолжится при сохранённом доступе'),
    permission: text('Permission needed', 'Нужно разрешение'),
    reselect: text('Select original again', 'Выбрать оригинал снова'),
  };
  const pager =
    page.pages > 1
      ? `<nav class="row wrap" aria-label="${esc(label)}"><button class="btn btn-secondary btn-sm" data-a="uploadReviewPage" data-list="${type}" data-step="-1" ${page.page ? '' : 'disabled'}>${text('Previous', 'Назад')}</button><span role="status" class="num">${page.page + 1} / ${page.pages}</span><button class="btn btn-secondary btn-sm" data-a="uploadReviewPage" data-list="${type}" data-step="1" ${page.page + 1 < page.pages ? '' : 'disabled'}>${text('Next', 'Далее')}</button></nav>`
      : '';
  const disclosure = `upload-review:${m.batchId}:${type}`;
  return `<details data-ui-disclosure="${esc(disclosure)}" ${disclosureOpen(disclosure) || (rejected && !m.entries.length) ? 'open' : ''}><summary>${label} · ${page.total}</summary><ul class="upload-review-list">${page.items.map(job => `<li><div><strong>${esc(m.preserve ? job.relativePath || job.name : job.name)}</strong><small>${rejected ? errors[job.reason] : [fsize(job.bytes), resume[job.resumeForecast]].filter(Boolean).join(' · ')}</small></div>${rejected ? '' : `<button class="ibtn" data-a="removeUploadReviewFile" data-id="${esc(job.id)}" aria-label="${esc(text('Remove from batch', 'Убрать из партии') + ' · ' + job.name)}">${ic('x', 15)}</button>`}</li>`).join('')}</ul>${pager}</details>`;
}
fileModalRenderers.uploadReview = (m, H) => {
  const path = [proj(m.ctx.project)?.name || '', ...fileFolderPath(proj(m.ctx.project), m.ctx.folderId).map(folder => folder.name)].join(' / ');
  const bytes = m.entries.reduce((sum, entry) => sum + entry.bytes, 0);
  const duplicates = m.entries.length - new Set(m.entries.map(job => (m.preserve ? job.relativePath : job.name).toLocaleLowerCase())).size;
  return (
    H(text('Review upload', 'Проверка загрузки')) +
    `<div class="modal-b" translate="no" ${m.starting ? 'inert' : ''}><p><strong>${countLabel(m.entries.length, 'file', locale())} · ${fsize(bytes)}</strong></p><p class="file-upload-destination">${text('Upload to', 'Загрузить в')}: <strong>${esc(path)}</strong></p><label class="field upload-review-target">${text('Project and folder', 'Проект и папка')}<select class="select" data-in="uploadReviewTarget" ${m.ctx.task ? 'disabled' : ''}>${D()
      .projects.filter(project => !project.archived && canEditProject(project, D().me, S.ui.currentUser?.role))
      .flatMap(project =>
        [
          { id: '', name: project.name },
          ...(project.fileFolders || [])
            .filter(folder => !folder.archived)
            .map(folder => ({ id: folder.id, name: [project.name, ...fileFolderPath(project, folder.id).map(f => f.name)].join(' / ') })),
        ].map(
          folder =>
            `<option value="${esc(JSON.stringify([project.id, folder.id]))}" ${m.ctx.project === project.id && (m.ctx.folderId || '') === folder.id ? 'selected' : ''}>${esc(folder.name)}</option>`,
        ),
      )
      .join(
        '',
      )}</select></label>${m.ctx.task ? `<p class="hint">${text('Task attachments stay in their task project.', 'Вложения задачи сохраняются в её проекте.')}</p>` : ''}
 ${uploadTargetStatus(m)}
 ${m.lastRemoved ? `<button class="btn btn-secondary" data-a="undoUploadReviewRemoval">${text('Undo removal', 'Отменить удаление')} · ${esc(m.lastRemoved.entry.name)}</button>` : ''}
 ${m.entries.some(job => job.relativePath?.includes('/')) ? `<button class="btn btn-secondary btn-sm" data-a="toggleUploadStructure" aria-pressed="${!!m.preserve}">${m.preserve ? text('Keep folder structure', 'Сохранить структуру папок') : text('Put all files in one folder', 'Все файлы в одну папку')}</button>` : ''}
 ${duplicates ? `<p class="alert info">${text('Repeated paths in this batch', 'Повторяющиеся пути в партии')}: ${duplicates}. ${text('Each file will be kept separately.', 'Каждый файл будет сохранён отдельно.')}</p>` : ''}
 ${!m.entries.length ? '' : m.resume ? `<section class="bookmark-page-notice" aria-label="${text('Resume after reopening', 'Возобновление после открытия браузера')}"><strong>${text('After reopening the browser', 'После повторного открытия браузера')}</strong><p>${text('Can resume if file access remains granted', 'Могут продолжиться при сохранённом доступе к файлу')}: ${m.resume.automatic} · ${text('Need file access permission', 'Потребуется разрешение доступа')}: ${m.resume.permission} · ${text('Need the original file selected again', 'Потребуется повторный выбор оригинала')}: ${m.resume.reselect}</p>${m.resume.permission ? `<button class="btn btn-secondary btn-sm" data-a="authorizeUploadReviewSources">${text('Allow source access', 'Разрешить доступ к исходникам')}</button>` : ''}<p class="hint">${text('Keep this tab open for uninterrupted uploading. Automatic resume depends on browser support and retained read permission; mobile systems may stop background work. Confirmed chunks are reused after source verification.', 'Для непрерывной загрузки держите вкладку открытой. Автовозобновление зависит от браузера и сохранённого разрешения чтения; мобильная система может остановить работу в фоне. Подтверждённые части используются после проверки оригинала.')}</p></section>` : `<p role="status">${text('Checking how uploads can resume…', 'Проверяем возможность возобновления…')}</p>`}
 ${uploadReviewList(m)}
 ${uploadReviewList(m, true)}
 <details><summary>${text('Storage and matching names', 'Хранилище и совпадение имён')}</summary>${m.capacity?.availableBytes != null ? `<p>${text('Estimated available', 'Оценка свободного места')}: ${fsize(m.capacity.availableBytes)}</p>` : ''}<p class="hint">${text('Quota is checked now and can change. Trash and retained copies may still use physical space.', 'Квота проверена сейчас и может измениться. Корзина и удерживаемые копии могут занимать физическое место.')}</p><p class="hint">${text('Matching file names create separate files; existing contents are never overwritten. Folder names at the same level are reused.', 'Совпадающие имена создают отдельные файлы, существующее содержимое не заменяется. Папки с тем же именем на одном уровне используются повторно.')}</p></details></div><div class="modal-f">${m.startError ? `<p role="alert">${esc(m.startError)}</p>` : ''}<button class="btn btn-secondary" data-a="closeModal" ${m.starting ? 'disabled' : ''}>${text('Cancel', 'Отмена')}</button><button class="btn btn-primary" data-a="confirmUploadReview" ${!m.starting && uploadReviewReady(m) ? '' : 'disabled'}>${m.starting ? text('Preparing…', 'Подготавливаем…') : m.startError ? text('Retry', 'Повторить') : text('Start upload', 'Начать загрузку')}</button></div>`
  );
};
A.confirmUploadReview = async () => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'uploadReview' || m.starting || !uploadReviewReady(m) || !currentUploadReview(m)) return;
  m.starting = true;
  m.startError = '';
  render();
  try {
    if (!(await owner.acquire()))
      throw new Error(
        text(
          'The queue is busy in another tab. Return here and retry when it is free.',
          'Очередь занята в другой вкладке. Когда она освободится, нажмите «Повторить».',
        ),
      );
    if (!currentUploadReview(m)) return;
    if (m.entries.length > uploadSlots()) throw new Error(text('The queue changed. Review the batch again.', 'Очередь изменилась. Проверьте партию ещё раз.'));
    const project = proj(m.ctx.project);
    if (!canEditProject(project, D().me, S.ui.currentUser?.role)) throw new Error(text('Project access changed.', 'Доступ к проекту изменился.'));
    const plan = planFileImport(project, m.entries, m.ctx.folderId, m.preserve, () => uid('folder'));
    if (plan.added) {
      project.fileFolders = plan.folders;
      save();
    }
    if (m.preserve) {
      await queueWorkspaceSync(S.data);
      await retryWorkspaceSync();
      if (!currentUploadReview(m)) return;
      if (!workspaceSyncIsClean(S.data))
        throw new Error(
          text('Could not save the folders. Your selection is ready to retry.', 'Не удалось сохранить папки. Можно повторить с теми же файлами.'),
        );
    }
    m.entries.forEach((job, index) => {
      job.project = m.ctx.project;
      job.folderId = plan.paths[index];
      job.destinationPath = uploadDestination(job, project).path;
    });
    m.starting = false;
    m.resolve(true);
    closeModal();
  } catch (error) {
    m.startError = error.message;
    if (currentUploadReview(m) && owner?.held && !engine.jobs.some(unfinishedUpload)) {
      owner.close();
      owner = createUploadOwner({ locks: navigator.locks, scope });
    }
  } finally {
    m.starting = false;
    if (currentUploadReview(m)) render();
  }
};
A.uploadReviewPage = el => {
  const m = S.ui.modals.at(-1);
  const list = el.dataset.list;
  if (m?.type !== 'uploadReview' || !['rejected', 'selected'].includes(list)) return;
  m.reviewPages[list] += Number(el.dataset.step);
  render();
};
A.removeUploadReviewFile = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'uploadReview' || !currentUploadReview(m)) return;
  const index = m.entries.findIndex(entry => entry.id === el.dataset.id);
  if (index < 0) return;
  m.lastRemoved = { entry: m.entries.splice(index, 1)[0], index };
  const page = listWindow(m.entries, m.reviewPages.selected, 25);
  m.reviewPages.selected = page.page;
  if (m.resume) m.resume = summarizeUploadReviewSources(m.entries);
  void checkUploadReviewTarget(m);
  const root = document.querySelector('.modal .upload-review-list');
  (
    root?.querySelectorAll('[data-a="removeUploadReviewFile"]')[Math.min(index % 25, page.items.length - 1)] ||
    document.querySelector('.modal [data-a="undoUploadReviewRemoval"]')
  )?.focus({ preventScroll: true });
};
A.undoUploadReviewRemoval = () => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'uploadReview' || !m.lastRemoved || !currentUploadReview(m)) return;
  const { entry, index } = m.lastRemoved;
  m.lastRemoved = null;
  m.entries.splice(index, 0, entry);
  m.reviewPages.selected = Math.floor(index / 25);
  if (m.resume) m.resume = summarizeUploadReviewSources(m.entries);
  void checkUploadReviewTarget(m);
  const remove = document.querySelector(`.modal [data-a="removeUploadReviewFile"][data-id="${CSS.escape(entry.id)}"]`);
  if (remove) {
    remove.closest('details').open = true;
    remove.focus();
  }
};
A.authorizeUploadReviewSources = async () => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'uploadReview') return;
  const requests = m.entries
    .filter(entry => entry.resumeForecast === 'permission' && entry.sourceHandle)
    .map(entry => {
      try {
        return entry.sourceHandle.requestPermission({ mode: 'read' });
      } catch {
        return null;
      }
    });
  await Promise.allSettled(requests);
  await uploadResumeForecast([...m.entries], { persistHandles: m.persistHandles });
  if (currentUploadReview(m)) {
    m.resume = summarizeUploadReviewSources(m.entries);
    render();
  }
};
const currentUploadReview = m => m.generation === getSessionGeneration() && S.ui.modals.includes(m) && valid();
const summarizeUploadReviewSources = entries =>
  entries.reduce(
    (counts, entry) => {
      counts[entry.resumeForecast || 'reselect']++;
      return counts;
    },
    { automatic: 0, permission: 0, reselect: 0 },
  );
async function prepareUploadReviewSources(m) {
  const entries = [...m.entries];
  m.persistHandles = await canPersistUploadHandles(entries);
  await uploadResumeForecast(entries, { persistHandles: m.persistHandles });
  if (currentUploadReview(m)) {
    m.resume = summarizeUploadReviewSources(m.entries);
    render();
  }
}
async function checkUploadReviewTarget(m) {
  m.targetCheck?.abort();
  if (!m.entries.length || m.entries.length > uploadSlots()) {
    m.targetCheck = null;
    m.checkingTarget = false;
    m.targetError = false;
    m.capacity = null;
    render();
    return;
  }
  const check = (m.targetCheck = new AbortController());
  const current = () => currentUploadReview(m) && m.targetCheck === check;
  m.checkingTarget = true;
  m.targetError = false;
  m.capacity = null;
  render();
  const deadline = setTimeout(() => check.abort('timeout'), 15000);
  try {
    const { project, task, folderId } = m.ctx;
    const capacity = await preflightUpload(
      {
        project,
        task,
        folderId,
        files: m.entries.map(job => ({ name: job.name, size: job.bytes, type: job.mimeType })),
        reservedBytes: engine.jobs.filter(unfinishedUpload).reduce((sum, job) => sum + Math.max(0, job.bytes - (job.accepted || 0)), 0),
      },
      check.signal,
    );
    check.signal.throwIfAborted();
    if (current()) m.capacity = capacity;
  } catch (error) {
    if (current()) {
      m.targetError = check.signal.aborted
        ? check.signal.reason
        : error.status === 507
          ? 'space'
          : error.code === 'FILE_TARGET_UNAVAILABLE' || error.code === 'FILE_FORBIDDEN' || [403, 404].includes(error.status)
            ? 'destination'
            : error.status === 400
              ? 'invalid'
              : 'storage';
    }
  } finally {
    clearTimeout(deadline);
    if (current()) {
      m.targetCheck = null;
      m.checkingTarget = false;
      render();
      if (check.signal.aborted && S.ui.modals.at(-1) === m) document.querySelector('.modal [data-a="retryUploadReviewTarget"]')?.focus({ preventScroll: true });
    }
  }
}
IN.uploadReviewTarget = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'uploadReview' || m.ctx.task) return;
  const [project, folderId] = JSON.parse(el.value);
  if (!canEditProject(proj(project), D().me, S.ui.currentUser?.role)) return;
  m.ctx = { ...m.ctx, project, folderId: folderId || null };
  return checkUploadReviewTarget(m);
};
A.retryUploadReviewTarget = () => {
  const m = S.ui.modals.at(-1);
  if (m?.type === 'uploadReview' && !m.checkingTarget) return checkUploadReviewTarget(m);
};
A.stopUploadReviewTarget = () => {
  const m = S.ui.modals.at(-1);
  if (m?.type === 'uploadReview') m.targetCheck?.abort('stopped');
};
A.toggleUploadStructure = () => {
  const m = S.ui.modals.at(-1);
  if (m?.type === 'uploadReview') {
    m.preserve = !m.preserve;
    render();
  }
};

const prefix = 'smena.uploads.v1:';
const text = (en, ru) => (isRussian() ? ru : en);
let engine,
  scope = '',
  generation,
  storageWarning = false,
  persistTimer,
  allowReload = false,
  completed = false,
  owner,
  restoring = Promise.resolve();
const key = () => JSON.stringify([S.ui.currentUser?.id, S.ui.activeWorkspace || 'default']);
const valid = () => scope === key() && generation === getSessionGeneration() && Boolean(getSessionToken());
function schedulePersist() {
  if (!persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persist();
    }, 1000);
}
function persist() {
  if (!valid() || !owner?.held) return Promise.resolve();
  const capturedScope = scope,
    capturedOwner = owner;
  let pending;
  try {
    pending = engine.jobs.filter(unfinishedUpload).map(job => ({
      id: job.id,
      name: job.name,
      bytes: job.bytes,
      lastModified: job.lastModified,
      relativePath: job.relativePath,
      mimeType: job.mimeType,
      type: job.type,
      project: job.project,
      task: job.task,
      folderId: job.folderId,
      batchId: job.batchId,
      destinationPath: job.destinationPath,
      createdAt: job.createdAt,
      checkpointAt: Date.now(),
      restorePhase: job.phase === 'needs-file' ? job.restorePhase : job.phase,
      fingerprint: job.fingerprint,
      sourceHandle: job.sourceHandle,
      accepted: job.accepted,
      pct: job.bytes ? Math.min(99, Math.floor(((job.accepted || 0) / job.bytes) * 100)) : 0,
      session: job.session
        ? {
            uploadUrl: job.session.uploadUrl,
            ticket: job.session.ticket,
            chunkSizeBytes: job.session.chunkSizeBytes,
            ...(job.session.uploaded?.id ? { uploaded: { id: job.session.uploaded.id } } : {}),
          }
        : null,
    }));
  } catch {
    return Promise.resolve();
  }
  // Synchronous fallback survives a reload even if the last IndexedDB write
  // was interrupted. New browser sessions use the encrypted durable journal.
  try {
    if (pending.length)
      sessionStorage.setItem(
        prefix + capturedScope,
        JSON.stringify(pending, (name, value) => (name === 'sourceHandle' ? undefined : value)),
      );
    else sessionStorage.removeItem(prefix + capturedScope);
  } catch {
    /* The durable journal can still succeed. */
  }
  return uploadJournal
    .save(capturedScope, pending, () => valid() && scope === capturedScope && owner === capturedOwner && capturedOwner.held)
    .catch(() => {
      if (!storageWarning)
        toast(text('This browser cannot save upload checkpoints. Keep this tab open.', 'Браузер не может сохранять очередь. Не закрывайте эту вкладку.'), {
          kind: 'info',
        });
      storageWarning = true;
    });
}
const changed = () => {
  if (valid()) {
    S.ui.uploads = engine.jobs;
    if (engine.jobs.length && !engine.jobs.some(unfinishedUpload)) {
      if (!completed) {
        S.ui.uploadQueueExpanded = false;
        const count = engine.jobs.filter(job => job.phase === 'done').length;
        if (count) toast(text(`Uploaded files: ${count}.`, `Загружено файлов: ${count}.`));
        completed = true;
      }
    } else completed = false;
    schedulePersist();
    render();
    if (!engine.jobs.some(unfinishedUpload) && owner?.held) {
      const capturedOwner = owner;
      void persist().then(() => {
        if (valid() && owner === capturedOwner && !engine.jobs.some(unfinishedUpload)) {
          capturedOwner.close();
          owner = createUploadOwner({ locks: navigator.locks, scope });
        }
      });
    }
  }
};
function paintProgress(job) {
  if (!valid()) return;
  job.rateSample = sampleUploadRate(job.rateSample, job.accepted || 0, Date.now());
  const estimate = uploadEstimate(engine.jobs);
  document.querySelectorAll('[data-upload-estimate]').forEach(el => {
    el.textContent =
      estimate.rate > 0
        ? `${fsize(estimate.rate)}/${text('s', 'с')}${estimate.seconds !== null ? ` · ~${Math.max(1, Math.ceil(estimate.seconds / 60))} ${text('min', 'мин')}` : ''}`
        : text('Estimating…', 'Оцениваем…');
  });
  document.querySelectorAll(`[data-upload-bar="${job.id}"]`).forEach(bar => {
    bar.style.setProperty('--p', job.pct / 100);
    bar.setAttribute('aria-valuenow', job.pct);
  });
  document.querySelectorAll(`[data-upload-percent="${job.id}"]`).forEach(label => {
    label.textContent = job.pct + '%';
  });
  const total = engine.jobs.reduce((sum, item) => sum + item.bytes, 0);
  const sent = engine.jobs.reduce((sum, item) => sum + (item.phase === 'done' ? item.bytes : Math.min(item.bytes, item.accepted || 0)), 0);
  document.querySelectorAll('[data-upload-total-progress]').forEach(el => {
    el.style.setProperty('--p', total ? sent / total : 0);
    el.setAttribute('aria-valuenow', total ? Math.floor((sent / total) * 100) : 0);
  });
}
async function run(job, signal) {
  job.rateSample = null;
  const startedScope = scope,
    startedGeneration = generation;
  const current = () => valid() && startedScope === scope && startedGeneration === generation;
  if (!valid()) throw new Error('The signed-in account changed. Sign in again.');
  if (!(await owner.acquire()))
    throw Object.assign(
      new Error(
        text(
          'This upload queue is open in another tab, or this browser cannot coordinate uploads. Close the other queue or use an updated browser.',
          'Очередь открыта в другой вкладке либо браузер не поддерживает координацию. Закройте другую очередь или обновите браузер.',
        ),
      ),
      { code: 'UPLOAD_OWNER_BUSY' },
    );
  if (!current() || signal.aborted) throw new Error('Upload cancelled.');
  if (!canEditProject(proj(job.project), D().me, S.ui.currentUser?.role)) throw new Error('You do not have access to this project.');
  if (!job.session?.uploaded?.id && !job.fingerprint?.startsWith('sha256-v2:')) {
    // Legacy samples did not cover the middle of a file. Do not resume their
    // provider session using unverified bytes after migrating the checkpoint.
    job.session = null;
    job.accepted = 0;
    job.pct = 0;
    job.sourceChecking = true;
    changed();
    try {
      job.fingerprint = await fullUploadFingerprint(job.file, signal);
    } finally {
      job.sourceChecking = false;
      changed();
    }
    await persist();
  }
  if (!current() || signal.aborted) throw new Error('Upload cancelled.');
  await retryWorkspaceSync();
  if (!current() || signal.aborted) throw new Error('Upload cancelled.');
  // Revalidate after synchronization, before creating/sending a provider session.
  assertFileFolder(proj(job.project), job.folderId);
  const base = structuredClone(S.data);
  const direct = S.ui.filePolicy?.directUploadEnabled === true;
  const apply = result => {
    if (!current()) throw new Error('The signed-in account changed. Sign in again.');
    applyExternalCoreSnapshot(result.data, base);
    save();
  };
  const result = await uploadWorkspaceFile(
    job.file || { name: job.name, size: job.bytes, type: job.mimeType },
    {
      revision: S.ui.workspaceRevision,
      project: job.project,
      task: job.task,
      folderId: job.folderId,
      direct,
      directTransfer: uploadDirectFile,
      signal,
      checkpoint: job.session,
      onCheckpoint: session => {
        job.session = session;
        return persist();
      },
      onAccepted: bytes => {
        job.accepted = bytes;
        schedulePersist();
      },
      onRegistered: apply,
      onVerifying: () => {
        job.phase = 'verifying';
        changed();
      },
    },
    (pct, bytes) => {
      job.pct = pct;
      if (!direct) job.accepted = bytes || Math.round((job.bytes * pct) / 100);
      paintProgress(job);
    },
  );
  if (!current()) throw new Error('The signed-in account changed. Sign in again.');
  if (!direct) apply(result);
  return result.file;
}
export function restoreUploadQueue() {
  if (!S.ui.currentUser || !getSessionToken() || (scope === key() && generation === getSessionGeneration())) return;
  if (engine) engine.batch(() => engine.jobs.forEach(job => engine.cancel(job)));
  owner?.close();
  scope = key();
  generation = getSessionGeneration();
  engine = createUploadQueue({
    run,
    changed,
    concurrency: S.ui.filePolicy?.directUploadEnabled ? 2 : 1,
    recoverNetwork: S.ui.filePolicy?.directUploadEnabled === true,
    online: navigator.onLine !== false,
  });
  owner = createUploadOwner({ locks: navigator.locks, scope });
  S.ui.uploads = engine.jobs;
  const restoredEngine = engine,
    restoredScope = scope,
    restoredGeneration = generation;
  restoring = (async () => {
    try {
      let saved;
      try {
        saved = await uploadJournal.read(restoredScope);
      } catch {
        /* Session-only fallback. */
      }
      const fallback = readUploadFallback(() => sessionStorage.getItem(prefix + restoredScope));
      const sourceHandles = new Map((Array.isArray(saved) ? saved : []).filter(job => job?.sourceHandle).map(job => [job.id, job.sourceHandle]));
      if (!Array.isArray(saved) || !saved.length || (Array.isArray(fallback) && (fallback[0]?.checkpointAt || 0) > (saved[0]?.checkpointAt || 0)))
        saved = Array.isArray(fallback)
          ? fallback.map(job => ({ ...job, ...(sourceHandles.has(job.id) ? { sourceHandle: sourceHandles.get(job.id) } : {}) }))
          : [];
      const entries = Array.isArray(saved)
        ? saved
            .filter(
              job =>
                job &&
                typeof job.id === 'string' &&
                typeof job.name === 'string' &&
                typeof job.project === 'string' &&
                Number.isSafeInteger(job.bytes) &&
                job.bytes > 0 &&
                job.createdAt > Date.now() - 7 * 24 * 60 * 60 * 1000,
            )
            .slice(0, 500)
        : [];
      if (!valid() || scope !== restoredScope || generation !== restoredGeneration || engine !== restoredEngine) return;
      if (entries.length) {
        S.ui.uploadQueueExpanded = true;
        void engine.add(entries, { restored: true });
        // Catalog registration needs only the trusted provider ID, not access
        // to the original bytes again. The server still verifies ownership.
        engine.batch(() =>
          engine.jobs
            .filter(job => job.session?.uploaded?.id)
            .forEach(job => {
              if (job.restorePhase === 'paused') job.phase = 'paused';
              else engine.resume(job);
            }),
        );
        // Ownership is acquired before attaching or persisting restored files;
        // another open tab must never replay this queue concurrently.
        if (entries.some(job => job.sourceHandle)) void restoreSources();
      }
    } catch {
      /* An invalid checkpoint never prevents loading the workspace. */
    }
  })();
}
export async function enqueueFiles(files, ctx) {
  restoreUploadQueue();
  await restoring;
  if (!files?.length || !valid()) return [];
  if (!canEditProject(proj(ctx.project), D().me, S.ui.currentUser?.role)) {
    toast(text('You do not have access to this project.', 'Нет доступа к этому проекту.'), { kind: 'err' });
    return [];
  }
  const policy = S.ui.filePolicy || {},
    maximum = policy.maxFileSizeBytes || 100 * 1024 ** 2;
  const batchId = uid('batch');
  const entries = [],
    existing = new Set(
      engine.jobs
        .filter(unfinishedUpload)
        .map(job =>
          JSON.stringify([
            job.project,
            job.task || null,
            job.folderId || null,
            uploadFileKey({ name: job.name, size: job.bytes, lastModified: job.lastModified }),
            job.relativePath || job.name,
          ]),
        ),
    );
  const rejected = [];
  for (const file of files) {
    const identity = JSON.stringify([ctx.project, ctx.task || null, ctx.folderId || null, uploadFileKey(file), file.webkitRelativePath || file.name]);
    const reason = existing.has(identity)
      ? 'duplicate'
      : !file.size
        ? 'empty'
        : file.size > maximum
          ? 'size'
          : policy.blockedExtensions?.includes(file.name.split('.').pop().toLowerCase())
            ? 'format'
            : '';
    if (reason) {
      rejected.push({ name: file.name, relativePath: file.webkitRelativePath || file.name, reason });
      continue;
    }
    existing.add(identity);
    entries.push({
      id: uid('u'),
      file,
      sourceHandle: ctx.sourceHandles?.get(file),
      name: file.name,
      relativePath: file.webkitRelativePath || file.name,
      bytes: file.size,
      mimeType: file.type,
      lastModified: file.lastModified,
      type: fileType(file.name),
      project: ctx.project,
      task: ctx.task || null,
      folderId: ctx.folderId || null,
      batchId,
      createdAt: Date.now(),
    });
  }
  try {
    const before = generation;
    const accepted = await new Promise(resolve => {
      const review = {
        type: 'uploadReview',
        allowAtomicClose: true,
        generation: before,
        ctx,
        entries,
        rejected,
        batchId,
        reviewPages: { selected: 0, rejected: 0 },
        checkingTarget: Boolean(entries.length),
        preserve: entries.some(job => job.relativePath.includes('/')),
        resolve,
        beforeClose: () => !review.starting,
        onClose: () => {
          review.targetCheck?.abort();
          resolve(false);
        },
      };
      openModal(review);
      if (entries.length) {
        void checkUploadReviewTarget(review);
        void prepareUploadReviewSources(review);
      }
    });
    if (!accepted || !valid() || generation !== before) return [];
  } catch (error) {
    toast(error.message, { kind: 'err' });
    return [];
  }
  engine.clear();
  S.ui.uploadQueueExpanded = true;
  S.ui.uploadQueuePage = 0;
  return (await engine.add(entries)).filter(Boolean);
}
const itemFor = el => valid() && engine.jobs.find(job => job.id === el.dataset.id);
A.pauseUpload = el => {
  const job = itemFor(el);
  if (job && S.ui.filePolicy?.directUploadEnabled) engine.pause(job);
};
A.retryUpload = el => {
  const job = itemFor(el);
  if (!job) return;
  if (['UPLOAD_SESSION_EXPIRED', 'UPLOAD_TICKET_EXPIRED'].includes(job.code)) {
    job.session = null;
    job.accepted = 0;
    job.pct = 0;
  }
  engine.resume(job);
};
A.chooseUploadDestination = async el => {
  const job = itemFor(el);
  if (!job || job.running || !['paused', 'failed', 'needs-file'].includes(job.phase)) return;
  const targetEngine = engine,
    targetOwner = owner,
    before = generation;
  if (!(await targetOwner.acquire()) || !valid() || targetEngine !== engine || before !== generation) return;
  if (!job.file) {
    job.phase = 'needs-file';
    job.restorePhase = 'paused';
    changed();
    toast(text('Choose the original file first, then choose a destination.', 'Сначала выберите исходный файл, затем папку назначения.'), { kind: 'info' });
    return;
  }
  const { openFileFolderBrowser } = await import('../features/file-folder-browser.js');
  if (!valid() || targetEngine !== engine || before !== generation) return;
  openFileFolderBrowser(job.project, folderId => {
    if (!valid() || targetEngine !== engine || before !== generation) return;
    openModal({
      type: 'confirm',
      title: text('Restart in another folder?', 'Начать заново в другой папке?'),
      body: esc(
        text(
          'This file will transfer from the beginning to the chosen folder. The previous upload session will not be reused. Other files stay unchanged.',
          'Этот файл будет передан заново в выбранную папку. Прежний сеанс передачи использоваться не будет. Остальные файлы не изменятся.',
        ),
      ),
      ok: text('Restart upload', 'Начать заново'),
      icon: 'folder-input',
      awaitRun: true,
      busyLabel: text('Preparing upload…', 'Подготовка загрузки…'),
      failureMessage: text(
        'Could not change destination. Check file access and permissions, then try again.',
        'Не удалось сменить папку. Проверьте доступ к файлу и проекту и повторите.',
      ),
      run: async () => {
        if (!valid() || targetEngine !== engine || targetOwner !== owner || before !== generation) return;
        await retryWorkspaceSync();
        if (!valid() || targetEngine !== engine || before !== generation) return;
        if (!canEditProject(proj(job.project), D().me, S.ui.currentUser?.role))
          throw new Error(text('You do not have access to this project.', 'Нет доступа к этому проекту.'));
        restartUploadDestination(job, folderId, proj(job.project));
        await persist();
        if (valid() && targetEngine === engine && before === generation) engine.resume(job);
      },
    });
  });
};
A.cancelUpload = async el => {
  const job = itemFor(el);
  if (!job) return;
  const targetEngine = engine,
    targetOwner = owner;
  if (!(await targetOwner.acquire())) {
    toast(text('Close the upload queue in the other tab before cancelling.', 'Перед отменой закройте очередь загрузок в другой вкладке.'), { kind: 'err' });
    return;
  }
  if (valid() && targetEngine === engine && targetOwner === owner) engine.cancel(job);
};
A.pauseUploads = () => {
  if (valid() && S.ui.filePolicy?.directUploadEnabled) engine.batch(() => engine.jobs.forEach(job => engine.pause(job)));
};
A.resumeUploads = () => {
  if (valid())
    engine.batch(() => engine.jobs.filter(job => ['paused', 'failed'].includes(job.phase)).forEach(job => A.retryUpload({ dataset: { id: job.id } })));
};
A.clearFinishedUploads = () => {
  if (valid()) engine.clear();
};
A.reloadUploadQueue = async () => {
  if (!valid() || !S.ui.filePolicy?.directUploadEnabled) return;
  const before = generation;
  engine.batch(() => engine.jobs.forEach(job => engine.pause(job)));
  try {
    await retryWorkspaceSync();
    if (!valid() || generation !== before || !workspaceSyncIsClean(S.data)) throw new Error('Save changes before reloading.');
    await persist();
    if (storageWarning) return;
    allowReload = true;
    location.reload();
  } catch {
    toast(text('Save changes before reloading. Uploads remain paused.', 'Сохраните изменения перед обновлением. Загрузки остаются на паузе.'), { kind: 'err' });
  }
};
A.uploadQueuePage = el => {
  S.ui.uploadQueuePage = Math.max(0, Number(el.dataset.page) || 0);
  render();
};
async function restoreSources() {
  if (!valid()) return;
  const targetEngine = engine,
    targetOwner = owner,
    targetGeneration = generation;
  if (!(await targetOwner.acquire())) return;
  const current = () => valid() && engine === targetEngine && owner === targetOwner && generation === targetGeneration;
  for (const job of targetEngine.jobs) {
    if (!current()) return;
    if (job.phase !== 'needs-file' || !job.sourceHandle || job.sourceChecking) continue;
    job.sourceChecking = true;
    job.sourceController = new AbortController();
    changed();
    const recovered = await recoverUploadSource(job, {
      current: () => current() && job.phase === 'needs-file',
      signal: job.sourceController.signal,
      onStatus: status => {
        job.sourceRecovery = status;
      },
    });
    job.sourceChecking = false;
    job.sourceController = null;
    if (!current()) return;
    if (!recovered || job.phase !== 'needs-file') {
      changed();
      continue;
    }
    if (!job.fingerprint?.startsWith('sha256-v2:')) {
      job.session = null;
      job.accepted = 0;
      job.pct = 0;
    }
    Object.assign(job, recovered);
    if (job.restorePhase === 'paused') {
      job.phase = 'paused';
      changed();
    } else engine.resume(job);
  }
}
A.restoreUploadSources = async () => {
  if (!valid()) return;
  const targetEngine = engine,
    targetGeneration = generation;
  // Invoke permission requests in the click's activation, before awaiting a
  // browser lock or I/O. Denial simply keeps the original-file picker available.
  const requests = engine.jobs
    .filter(job => uploadSourceActions([job]).access)
    .map(job => {
      try {
        return job.sourceHandle.requestPermission({ mode: 'read' });
      } catch {
        return null;
      }
    });
  await Promise.allSettled(requests);
  if (valid() && engine === targetEngine && generation === targetGeneration) await restoreSources();
};
A.reselectUploadFiles = () => {
  const input = document.getElementById('file-upload-reselect');
  if (!input) return;
  input.onchange = async event => {
    event.stopPropagation();
    const picked = [...input.files];
    input.value = '';
    if (!valid()) return;
    const targetEngine = engine,
      targetGeneration = generation;
    const targetOwner = owner;
    if (!(await targetOwner.acquire()) || !valid() || targetEngine !== engine || targetOwner !== owner) return;
    let matched = 0;
    for (const file of picked) {
      const candidates = engine.jobs.filter(job => job.phase === 'needs-file' && file.name === job.name && file.size === job.bytes);
      if (!candidates.length) continue;
      candidates.forEach(job => {
        job.sourceChecking = true;
      });
      changed();
      let fingerprint;
      try {
        fingerprint = await fullUploadFingerprint(file);
      } catch {
        continue;
      } finally {
        candidates.forEach(job => {
          job.sourceChecking = false;
        });
        if (valid()) changed();
      }
      if (!valid() || targetEngine !== engine || targetGeneration !== generation) return;
      for (const job of candidates) {
        if (job.phase !== 'needs-file') continue;
        if (job.fingerprint?.startsWith('sha256-v2:') && fingerprint !== job.fingerprint) continue;
        if (!job.fingerprint?.startsWith('sha256-v2:')) {
          job.session = null;
          job.accepted = 0;
          job.pct = 0;
        }
        job.file = file;
        job.fingerprint = fingerprint;
        matched++;
        engine.resume(job);
      }
    }
    toast(text(`Matched source files: ${matched}.`, `Найдено исходных файлов: ${matched}.`), { kind: matched ? 'info' : 'err' });
  };
  input.click();
};
document.addEventListener(
  'toggle',
  event => {
    if (event.target.matches?.('.file-upload-list') && event.target.isConnected) S.ui.uploadQueueExpanded = event.target.open;
  },
  true,
);
window.addEventListener('beforeunload', event => {
  if (!allowReload && valid() && engine.jobs.some(unfinishedUpload)) {
    persist();
    event.preventDefault();
    event.returnValue = '';
  }
});
window.addEventListener('offline', () => {
  if (valid()) engine.setOnline(false);
});
window.addEventListener('online', () => {
  if (valid()) engine.setOnline(true);
});
function resetUploadScope(signedOut) {
  generation = -1;
  owner?.close();
  if (signedOut) {
    try {
      Object.keys(sessionStorage)
        .filter(value => value.startsWith(prefix))
        .forEach(value => sessionStorage.removeItem(value));
    } catch {
      /* Private storage may be disabled. */
    }
  }
  if (engine) engine.batch(() => engine.jobs.forEach(job => engine.cancel(job)));
  S.ui.uploads = [];
  scope = '';
}
window.addEventListener('smena:upload-scope-change', event => {
  resetUploadScope(event.detail?.signedOut);
});
window.addEventListener('smena:upload-journal-cleared', () => resetUploadScope(true));
window.addEventListener('storage', event => {
  if (event.key === SESSION_STORAGE_KEY && event.newValue === null) resetUploadScope(true);
});
window.addEventListener('pagehide', () => {
  void persist();
});
