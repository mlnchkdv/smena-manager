import { D, S } from '../core/store.js';
import { esc } from '../core/utils.js';
import { fsize } from './helpers.js';
import { ensureFileExports } from '../features/file-exports.js';
import { archiveSelectionIssue } from '../shared/file-archive-policy.js';
export function fileExportsPanel() {
  ensureFileExports();
  const jobs = S.ui.fileExports || [],
    selected = new Set(S.ui.fileSelection || []),
    files = D().files.filter(file => selected.has(file.id));
  const unavailable =
    archiveSelectionIssue(files, { maxFiles: 500, maxBytes: 1024 * 1024 * 1024 }) || files.some(file => !Number.isSafeInteger(file.bytes) || file.bytes < 0);
  const labels = {
    pending: 'Export paused',
    processing: 'Preparing resumable export',
    failed: 'Export paused',
    ready: 'Export ready',
    cancelled: 'Export cancelled',
    expired: 'Export expired',
    unavailable: 'Export access unavailable',
  };
  const open =
    S.ui.fileExportCreating ||
    S.ui.fileExportRunning ||
    S.ui.fileExportError ||
    (S.ui.fileExportsExpanded ?? jobs.some(job => ['pending', 'processing', 'failed'].includes(job.phase)));
  return `<details class="files-exports" ${open ? 'open' : ''}><summary><span>Resumable exports</span>${jobs.some(job => job.phase === 'ready') ? ' · <span>Export ready</span>' : ''}</summary>${S.ui.fileExportError ? `<p class="alert danger" role="alert">${esc(S.ui.fileExportError)}</p>` : ''}<p class="hint">Up to 500 files / 1 GB. Checkpoints are stored in Drive for 24 hours. Preparation pauses when no active tab continues it; resume here after reopening.</p><div class="row"><button class="btn btn-secondary btn-sm" data-a="createFileExport" ${unavailable || S.ui.fileExportRunning || S.ui.fileExportCreating ? 'disabled' : ''}>Prepare selected files</button><button class="btn btn-ghost btn-sm" data-a="refreshFileExports">Refresh exports</button></div>${jobs
    .slice(0, 4)
    .map(
      job =>
        `<article class="files-export-job" data-export="${esc(job.id)}"><div><b>${labels[job.phase] || 'Export paused'}</b><span class="hint num">${fsize(job.done)} / ${fsize(job.total)} · ${job.files}</span></div><div class="row">${job.phase === 'ready' ? `<a class="btn btn-primary btn-sm" href="/api/files/exports/${encodeURIComponent(job.id)}/download?account=${encodeURIComponent(S.ui.currentUser.id)}&workspace=${encodeURIComponent(S.ui.activeWorkspace || 'default')}" download>Download prepared export</a>` : ['pending', 'processing', 'failed'].includes(job.phase) ? `<button class="btn btn-secondary btn-sm" data-a="resumeFileExport" data-id="${esc(job.id)}" ${S.ui.fileExportRunning || S.ui.fileExportCreating ? 'disabled' : ''}>Resume export</button>` : ''}${!['cancelled', 'expired'].includes(job.phase) ? `<button class="btn btn-ghost btn-sm" data-a="cancelFileExport" data-id="${esc(job.id)}">Cancel export</button>` : ''}</div></article>`,
    )
    .join('')}</details>`;
}
