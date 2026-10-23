import { D, S } from '../core/store.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { t } from '../core/i18n.js';
import { canEditFile, canRemoveFile } from '../shared/file-access.js';
import { archiveSelectionIssue, STREAM_ZIP_POLICY } from '../shared/file-archive-policy.js';

export function syncFileSelection(files, projectId = null) {
  const scope = JSON.stringify([S.ui.currentUser?.id, D().ws?.id || D().ws?.url, projectId]);
  if (S.ui.fileSelectionScope !== scope) S.ui.fileSelection = [];
  S.ui.fileSelectionScope = scope;
  const available = new Set(files.map(file => file.id));
  S.ui.fileSelection = [...new Set(S.ui.fileSelection || [])].filter(id => available.has(id)).slice(0, 500);
}

export function fileSelectButton(file) {
  const selected = (S.ui.fileSelection || []).includes(file.id);
  return `<button class="file-select ${selected ? 'on' : ''}" data-a="toggleFileSelection" data-id="${esc(file.id)}" aria-pressed="${selected}" aria-label="${esc(t('Select file'))}: ${esc(file.name)}">${ic(selected ? 'square-check' : 'square', 17)}</button>`;
}

export function fileDownloadProgress() {
  const state = S.ui.fileDownload;
  if (!state) return '';
  if (state.phase === 'expired')
    return '<section class="files-download-ready" role="status"><span>Prepared ZIP expired. Select files and prepare a new ZIP.</span><button class="btn btn-ghost btn-sm" data-a="cancelFileZip">Close</button></section>';
  if (state.phase === 'ready') {
    try {
      state.validate();
    } catch {
      state.dispose();
      S.ui.fileDownload = null;
      return '';
    }
    return `<section class="files-download-ready" role="status"><div class="row"><strong>ZIP is ready.</strong><span class="sp"></span><a class="btn btn-primary btn-sm" href="${esc(state.href)}" download="${esc(state.filename)}">${ic('download', 15)}Save ZIP</a><button class="ibtn" data-a="cancelFileZip" aria-label="Close ZIP download">${ic('x', 16)}</button></div><p class="hint">If the download did not start, save the prepared ZIP here. Available for 5 minutes.</p></section>`;
  }
  return `<section class="files-download-progress" role="status" aria-label="Preparing ZIP"><div class="row"><strong>Preparing ZIP</strong><span class="sp"></span><span class="files-download-count num">${state.done} / ${state.total}</span><button class="ibtn" data-a="cancelFileZip" aria-label="Cancel ZIP download" title="Cancel ZIP download">${ic('x', 16)}</button></div><progress max="${state.total}" value="${state.done}" aria-label="Preparing ZIP"></progress></section>`;
}

export function fileSelectionBar(page, results = page) {
  const ids = S.ui.fileSelection || [];
  const files = D().files.filter(file => ids.includes(file.id));
  if (!page.length && !files.length) return '';
  const sameProject = new Set(files.map(file => file.project)).size === 1;
  const movable = files.length > 0 && sameProject && files.every(file => canEditFile(file, D(), S.ui.currentUser?.role));
  const removable = files.length > 0 && files.every(file => canRemoveFile(file, D(), S.ui.currentUser?.role));
  const checked = page.length > 0 && page.every(file => ids.includes(file.id));
  const downloadIssue = archiveSelectionIssue(files);
  const streamIssue = archiveSelectionIssue(files, STREAM_ZIP_POLICY);
  const busy = S.ui.fileDownload && !['ready', 'expired'].includes(S.ui.fileDownload.phase);
  const selectResults = `<button class="btn btn-ghost btn-sm" data-a="selectFileResults" data-ids="${results.length <= 500 ? esc(results.map(file => file.id).join(',')) : ''}" ${!results.length || results.length > 500 ? 'disabled' : ''} title="Narrow the filters to select up to 500 files.">Select results</button>`;
  return `<section class="files-selection-bar ${files.length ? 'active' : ''}" aria-label="File selection"><button class="btn btn-ghost btn-sm" data-a="selectFilePage" data-ids="${esc(page.map(file => file.id).join(','))}" aria-pressed="${checked}" ${!page.length ? 'disabled' : ''}>${ic(checked ? 'square-check' : 'square', 16)}<span>Select page</span></button>${selectResults}<span class="files-selected-count" role="status"><span>Selected files</span>: <b>${files.length}</b></span>${files.length ? `<span class="sp"></span><button class="btn btn-secondary btn-sm" data-a="downloadSelectedFiles" ${downloadIssue || busy ? 'disabled' : ''} title="${esc(t(downloadIssue || 'Download ZIP'))}">${ic('download', 15)}<span>Download ZIP</span></button><button class="btn btn-secondary btn-sm" data-a="streamSelectedFiles" ${streamIssue || busy ? 'disabled' : ''} title="${esc(t(streamIssue || 'Streamed ZIP: up to 500 files / 250 MB, 45 seconds. No whole-archive memory buffer.'))}">${ic('arrow-down-to-line', 15)}<span>Stream ZIP</span></button><button class="btn btn-secondary btn-sm" data-a="moveFileToFolder" ${movable ? '' : 'disabled'} title="Choose editable files from one project.">${ic('folder-input', 15)}<span>Move</span></button><button class="btn btn-secondary btn-sm" data-a="trashSelectedFiles" ${removable ? '' : 'disabled'} title="Deleting files requires edit access and ownership, or an administrator role.">${ic('trash-2', 15)}<span>Move to trash</span></button><button class="ibtn" data-a="clearFileSelection" aria-label="Clear selection" title="Clear selection">${ic('x', 16)}</button><p class="hint">Selection is kept when filters change. Up to 500 files.</p><p class="hint">${esc(t(downloadIssue || 'ZIP: up to 100 files / 50 MB. Folder paths are preserved.'))}</p><p class="hint">Streamed ZIP: up to 500 files / 250 MB, 45 seconds. No whole-archive memory buffer.</p>` : ''}</section>`;
}
