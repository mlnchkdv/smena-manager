import { A } from '../actions/actions.js';
import { D, S, proj, save } from './store.js';
import { uid } from './utils.js';
import { fileType } from '../ui/helpers.js';
import { isRussian, locale } from './i18n.js';
import { countLabel } from '../shared/count-label.js';
import { fileFolderPath } from '../shared/file-organization.js';
import { render } from '../shell/render.js';
import { toast } from '../ui/toast.js';
import { canEditProject } from '../shared/project-access.js';
import { createUploadQueue, unfinishedUpload, uploadFileKey } from '../shared/upload-queue.js';
import { createUploadOwner, fullUploadFingerprint } from '../shared/upload-journal.js';
import { uploadJournal } from './upload-journal.js';
import { getSessionGeneration, getSessionToken, uploadWorkspaceFile, SESSION_STORAGE_KEY } from './api.js';
import { retryWorkspaceSync, workspaceSyncIsClean } from './workspace-sync.js';
import { applyExternalCoreSnapshot } from './bootstrap.js';
import { openModal, closeModal, fileModalRenderers } from '../overlays/modals.js';
import { preflightUpload } from './api.js';
import { esc } from './utils.js';
import { uploadsHtml } from '../ui/file-uploads.js';
import { sampleUploadRate, uploadEstimate } from '../shared/upload-rate.js';
import { fsize } from '../ui/helpers.js';
import { planFileImport } from '../shared/file-import-plan.js';

fileModalRenderers.uploadQueue = (_modal, H) =>
  H(text('Uploads', 'Загрузки')) + `<div class="modal-b">${uploadsHtml() || text('No pending uploads.', 'Нет ожидающих загрузок.')}</div>`;
export function openUploadQueue() {
  restoreUploadQueue();
  if (!S.ui.modals.some(modal => modal.type === 'uploadQueue')) openModal({ type: 'uploadQueue' });
}
fileModalRenderers.uploadReview = (m, H) =>
  H(text('Review upload', 'Проверка загрузки')) +
  `<div class="modal-b" translate="no"><p>${esc([proj(m.ctx.project)?.name || '', ...fileFolderPath(proj(m.ctx.project), m.ctx.folderId).map(folder => folder.name)].join(' / '))} · ${countLabel(m.entries.length, 'file', locale())} · ${fsize(m.capacity.bytes)}</p><p class="${m.capacity.sufficient === false ? 'err' : 'hint'}">${m.capacity.availableBytes === null ? text('Drive free space is unavailable. The upload may fail if storage is full.', 'Свободное место Drive недоступно. При заполнении хранилища загрузка завершится ошибкой.') : `${text('Estimated available', 'Оценка свободного места')}: ${fsize(m.capacity.availableBytes)}`}</p><p class="hint">${text('Quota is checked now and can change. Trash and retained copies may still use physical space.', 'Квота проверена сейчас и может измениться. Корзина и удерживаемые копии могут занимать физическое место.')}</p>${m.capacity.sufficient === false ? `<p role="alert">${text('Not enough space for this batch.', 'Недостаточно места для этой партии.')}</p>` : ''}<p class="hint">${text('Matching file names create separate files; existing contents are never overwritten. Folder names at the same level are reused.', 'Совпадающие имена создают отдельные файлы, существующее содержимое не заменяется. Папки с тем же именем на одном уровне используются повторно.')}</p>${m.entries.some(job => job.relativePath?.includes('/')) ? `<button class="btn btn-secondary btn-sm" data-a="toggleUploadStructure" aria-pressed="${!!m.preserve}">${m.preserve ? text('Keep folder structure', 'Сохранить структуру папок') : text('Put all files in one folder', 'Все файлы в одну папку')}</button>` : ''}<p class="hint">${text('Repeated paths in this batch', 'Повторяющиеся пути в партии')}: ${m.entries.length - new Set(m.entries.map(job => (m.preserve ? job.relativePath : job.name).toLocaleLowerCase())).size}</p><details><summary>${text('Files and paths', 'Файлы и пути')}</summary><ul>${m.entries
    .slice(0, 50)
    .map(job => `<li>${esc(m.preserve ? job.relativePath : job.name)} · ${fsize(job.bytes)}</li>`)
    .join(
      '',
    )}</ul>${m.entries.length > 50 ? `<p>${text('First 50 files shown.', 'Показаны первые 50 файлов.')}</p>` : ''}</details></div><div class="modal-f"><button class="btn btn-secondary" data-a="closeModal">${text('Cancel', 'Отмена')}</button><button class="btn btn-primary" data-a="confirmUploadReview" ${m.capacity.sufficient === false ? 'disabled' : ''}>${text('Start upload', 'Начать загрузку')}</button></div>`;
A.confirmUploadReview = () => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'uploadReview' || m.capacity.sufficient === false) return;
  m.resolve({ preserve: m.preserve });
  closeModal();
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
      createdAt: job.createdAt,
      fingerprint: job.fingerprint,
      accepted: job.accepted,
      pct: job.pct,
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
    if (pending.length) sessionStorage.setItem(prefix + capturedScope, JSON.stringify(pending));
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
  if (!job.fingerprint?.startsWith('sha256-v2:')) {
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
  const base = structuredClone(S.data);
  const direct = S.ui.filePolicy?.directUploadEnabled === true;
  const apply = result => {
    if (!current()) throw new Error('The signed-in account changed. Sign in again.');
    applyExternalCoreSnapshot(result.data, base);
    save();
  };
  const result = await uploadWorkspaceFile(
    job.file,
    {
      revision: S.ui.workspaceRevision,
      project: job.project,
      task: job.task,
      folderId: job.folderId,
      direct,
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
      job.accepted = bytes || Math.round((job.bytes * pct) / 100);
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
  engine = createUploadQueue({ run, changed, concurrency: S.ui.filePolicy?.directUploadEnabled ? 2 : 1 });
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
      if (!Array.isArray(saved) || !saved.length) saved = JSON.parse(sessionStorage.getItem(prefix + restoredScope) || '[]');
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
  if (files.length + engine.jobs.filter(unfinishedUpload).length > 500) {
    toast(
      text('Up to 500 files in the queue. Finish or remove pending files first.', 'В очереди может быть до 500 файлов. Завершите или уберите ожидающие файлы.'),
      { kind: 'err' },
    );
    return [];
  }
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
  let rejected = 0,
    duplicates = 0;
  for (const file of files) {
    const identity = JSON.stringify([ctx.project, ctx.task || null, ctx.folderId || null, uploadFileKey(file), file.webkitRelativePath || file.name]);
    if (existing.has(identity)) {
      duplicates++;
      continue;
    }
    if (!file.size || file.size > maximum || policy.blockedExtensions?.includes(file.name.split('.').pop().toLowerCase())) {
      rejected++;
      continue;
    }
    existing.add(identity);
    entries.push({
      id: uid('u'),
      file,
      name: file.name,
      relativePath: file.webkitRelativePath || file.name,
      bytes: file.size,
      mimeType: file.type,
      lastModified: file.lastModified,
      type: fileType(file.name),
      project: ctx.project,
      task: ctx.task || null,
      folderId: ctx.folderId || null,
      createdAt: Date.now(),
    });
  }
  if (rejected)
    toast(
      text(
        `Skipped files: ${rejected}. Check size, empty files and allowed formats.`,
        `Пропущено файлов: ${rejected}. Проверьте размер, пустые файлы и допустимые форматы.`,
      ),
      { kind: 'err' },
    );
  if (duplicates) toast(text(`Already queued: ${duplicates}.`, `Уже в очереди: ${duplicates}.`), { kind: 'info' });
  if (!entries.length) return [];
  try {
    const before = generation;
    const capacity = await preflightUpload({
      ...ctx,
      files: entries.map(job => ({ name: job.name, size: job.bytes, type: job.mimeType })),
      reservedBytes: engine.jobs.filter(unfinishedUpload).reduce((sum, job) => sum + Math.max(0, job.bytes - (job.accepted || 0)), 0),
    });
    if (!valid() || generation !== before) return [];
    const accepted = await new Promise(resolve =>
      openModal({
        type: 'uploadReview',
        ctx,
        entries,
        capacity,
        preserve: entries.some(job => job.relativePath.includes('/')),
        resolve,
        onClose: () => resolve(false),
      }),
    );
    if (!accepted || !valid() || generation !== before) return [];
    const project = proj(ctx.project),
      plan = planFileImport(project, entries, ctx.folderId, accepted.preserve, () => uid('folder'));
    if (plan.added) {
      project.fileFolders = plan.folders;
      save();
      await retryWorkspaceSync();
      if (!valid() || generation !== before || !workspaceSyncIsClean(S.data))
        throw new Error(text('Save folder changes before uploading.', 'Сохраните изменения папок перед загрузкой.'));
    }
    entries.forEach((job, index) => {
      job.folderId = plan.paths[index];
    });
  } catch (error) {
    toast(error.message, { kind: 'err' });
    return [];
  }
  const targetEngine = engine,
    targetOwner = owner;
  if (!(await targetOwner.acquire())) {
    toast(text('Close the upload queue in the other tab, or use an updated browser.', 'Закройте очередь загрузок в другой вкладке или обновите браузер.'), {
      kind: 'err',
    });
    return [];
  }
  if (!valid() || targetEngine !== engine || targetOwner !== owner) return [];
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
    let matched = 0;
    for (const file of picked) {
      const candidates = engine.jobs.filter(
        job => job.phase === 'needs-file' && uploadFileKey(file) === uploadFileKey({ name: job.name, size: job.bytes, lastModified: job.lastModified }),
      );
      if (!candidates.length) continue;
      const fingerprint = await fullUploadFingerprint(file);
      if (!valid() || targetEngine !== engine || targetGeneration !== generation) return;
      for (const job of candidates) {
        if (job.fingerprint?.startsWith('sha256-v2:') && fingerprint !== job.fingerprint) continue;
        if (job.fingerprint && !job.fingerprint.startsWith('sha256-v2:')) {
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
  if (valid()) engine.batch(() => engine.jobs.forEach(job => engine.pause(job)));
});
function resetUploadScope(signedOut) {
  generation = -1;
  owner?.close();
  if (signedOut) {
    void uploadJournal.clear().catch(() => {});
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
const signoutChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('smena-upload-signout') : null;
if (signoutChannel) signoutChannel.onmessage = () => resetUploadScope(true);
window.addEventListener('smena:upload-scope-change', event => {
  resetUploadScope(event.detail?.signedOut);
  if (event.detail?.signedOut) signoutChannel?.postMessage('signed-out');
});
window.addEventListener('storage', event => {
  if (event.key === SESSION_STORAGE_KEY && event.newValue === null) resetUploadScope(true);
});
window.addEventListener('pagehide', () => {
  void persist();
});
