import { A } from '../actions/actions.js';
import { D, S, proj, save } from './store.js';
import { uid } from './utils.js';
import { fileType } from '../ui/helpers.js';
import { isRussian } from './i18n.js';
import { render } from '../shell/render.js';
import { toast } from '../ui/toast.js';
import { canEditProject } from '../shared/project-access.js';
import { createUploadQueue, unfinishedUpload, uploadFileKey, uploadFingerprint } from '../shared/upload-queue.js';
import { getSessionGeneration, getSessionToken, uploadWorkspaceFile } from './api.js';
import { retryWorkspaceSync, workspaceSyncIsClean } from './workspace-sync.js';
import { applyExternalCoreSnapshot } from './bootstrap.js';

const prefix = 'smena.uploads.v1:';
const text = (en, ru) => (isRussian() ? ru : en);
let engine,
  scope = '',
  generation,
  storageWarning = false,
  persistTimer,
  allowReload = false,
  completed = false;
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
  if (!valid()) return;
  try {
    const pending = engine.jobs.filter(unfinishedUpload).map(job => ({
      id: job.id,
      name: job.name,
      bytes: job.bytes,
      lastModified: job.lastModified,
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
    if (pending.length) sessionStorage.setItem(prefix + scope, JSON.stringify(pending));
    else sessionStorage.removeItem(prefix + scope);
  } catch {
    if (!storageWarning)
      toast(text('This browser cannot save upload checkpoints. Keep this tab open.', 'Браузер не может сохранять очередь. Не закрывайте эту вкладку.'), {
        kind: 'info',
      });
    storageWarning = true;
  }
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
  }
};
function paintProgress(job) {
  if (!valid()) return;
  const bar = document.getElementById('upbar-' + job.id),
    label = document.getElementById('upct-' + job.id);
  if (bar) {
    bar.style.setProperty('--p', job.pct / 100);
    bar.setAttribute('aria-valuenow', job.pct);
  }
  if (label) label.textContent = job.pct + '%';
  const total = engine.jobs.reduce((sum, item) => sum + item.bytes, 0);
  const sent = engine.jobs.reduce((sum, item) => sum + (item.phase === 'done' ? item.bytes : Math.min(item.bytes, item.accepted || 0)), 0);
  document.querySelectorAll('[data-upload-total-progress]').forEach(el => {
    el.style.setProperty('--p', total ? sent / total : 0);
    el.setAttribute('aria-valuenow', total ? Math.floor((sent / total) * 100) : 0);
  });
}
async function run(job, signal) {
  const startedScope = scope,
    startedGeneration = generation;
  const current = () => valid() && startedScope === scope && startedGeneration === generation;
  if (!valid()) throw new Error('The signed-in account changed. Sign in again.');
  if (!canEditProject(proj(job.project), D().me, S.ui.currentUser?.role)) throw new Error('You do not have access to this project.');
  if (!job.fingerprint) {
    job.fingerprint = await uploadFingerprint(job.file);
    persist();
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
        persist();
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
  scope = key();
  generation = getSessionGeneration();
  engine = createUploadQueue({ run, changed, concurrency: S.ui.filePolicy?.directUploadEnabled ? 2 : 1 });
  S.ui.uploads = engine.jobs;
  try {
    const saved = JSON.parse(sessionStorage.getItem(prefix + scope) || '[]');
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
              job.createdAt > Date.now() - 24 * 60 * 60 * 1000,
          )
          .slice(0, 500)
      : [];
    if (entries.length) {
      S.ui.uploadQueueExpanded = true;
      void engine.add(entries, { restored: true });
    }
  } catch {
    /* An invalid checkpoint never prevents loading the workspace. */
  }
}
export async function enqueueFiles(files, ctx) {
  restoreUploadQueue();
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
          ]),
        ),
    );
  let rejected = 0,
    duplicates = 0;
  for (const file of files) {
    const identity = JSON.stringify([ctx.project, ctx.task || null, ctx.folderId || null, uploadFileKey(file)]);
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
A.cancelUpload = el => {
  const job = itemFor(el);
  if (job) engine.cancel(job);
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
    persist();
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
    let matched = 0;
    for (const file of picked) {
      const candidates = engine.jobs.filter(
        job => job.phase === 'needs-file' && uploadFileKey(file) === uploadFileKey({ name: job.name, size: job.bytes, lastModified: job.lastModified }),
      );
      if (!candidates.length) continue;
      const fingerprint = await uploadFingerprint(file);
      if (!valid()) return;
      for (const job of candidates) {
        if (job.fingerprint && fingerprint !== job.fingerprint) continue;
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
window.addEventListener('smena:upload-scope-change', event => {
  if (event.detail?.signedOut) {
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
  generation = -1;
});
