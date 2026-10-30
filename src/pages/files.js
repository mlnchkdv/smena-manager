import { actionLabel } from '../ui/action-label.js';
import { filterCriteria, filterSummaryLabel } from '../ui/filter-criteria.js';
import { ago, esc } from '../core/utils.js';
import '../ui/file-translations.js';
import { ic } from '../core/icons.js';
import { D, S, canSee, mem, pColor, proj, task, visibleProjects } from '../core/store.js';
import { FT, av, empty, filePrev, fsize } from '../ui/helpers.js';
import { listWindow } from '../shared/list-window.js';
import { paginationHtml } from '../ui/pagination.js';
import { t as tr } from '../core/i18n.js';
import { canEditProject } from '../shared/project-access.js';
import { activeFileFolder, fileFolderPath } from '../shared/file-organization.js';
import { createFileIndex, filterIndexedFiles } from '../shared/file-index.js';
import { fileFolderBrowser, visibleFileFolderKeys } from '../ui/file-folders.js';
import { fileSelectButton, fileSelectionBar, syncFileSelection, fileDownloadProgress } from '../ui/file-selection.js';
import { filePreferences } from '../core/file-preferences.js';
import { filePresetsHtml } from '../ui/file-presets.js';
import { fileTransferPanel } from '../ui/file-transfer.js';
import { fileExportsPanel } from '../ui/file-exports.js';
import '../features/files.js';
import '../features/file-selection.js';
import { demandFilePage, filePagePending } from '../features/file-catalog-demand.js';
import { collectionHeader, collectionToolbar } from '../ui/collection-layout.js';
import { disclosureAttributes } from '../ui/disclosure.js';

function formatBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let amount = bytes;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  const digits = amount >= 100 || unit === 0 ? 0 : amount >= 10 ? 1 : 2;
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(amount)} ${units[unit]}`;
}

function fileMeta(file) {
  return FT[file.type] || FT.other;
}

function projectChip(file) {
  const project = proj(file.project);
  return project
    ? `<button class="workspace-file-project trunc" data-a="go" data-r="project" data-id="${project.id}" data-tab="files" title="${esc(project.name)}"><span style="--c:${pColor(project)}"></span>${esc(project.name)}</button>`
    : '';
}

function folderChip(file) {
  const folder = activeFileFolder(proj(file.project), file.folderId);
  if (!folder) return '';
  const path = fileFolderPath(proj(file.project), folder.id)
    .map(item => item.name)
    .join(' / ');
  return `<button class="workspace-file-folder trunc" data-a="openFileFolder" data-project="${esc(file.project)}" data-folder="${esc(folder.id)}" title="${esc(path)}">${ic('folder', 12)}<span class="trunc" translate="no">${esc(folder.name)}</span></button>`;
}

function fileContext(file) {
  const project = proj(file.project);
  return [project?.name, ...fileFolderPath(project, file.folderId).map(folder => folder.name)].filter(Boolean).join(' / ');
}

function textFileLocation(file, linkedTask) {
  const project = proj(file.project);
  const path = [project?.name, ...fileFolderPath(project, file.folderId).map(folder => folder.name)].filter(Boolean).join(' / ');
  return `<details class="ui-menu workspace-file-location" ${disclosureAttributes(`file-location:${file.id}`)}><summary aria-label="${esc(tr('Show full path'))}: ${esc(path)}" title="${esc(path)}">${ic('folder', 13)}<span class="trunc" translate="no">${esc(path || tr('No folder'))}</span>${ic('chevron-down', 12)}</summary><div><p translate="no">${esc(path)}</p>${projectChip(file)}${folderChip(file)}${linkedTask ? `<button class="btn btn-ghost" data-a="openTask" data-id="${esc(linkedTask.id)}">${ic('link', 13)}${esc(linkedTask.key)}</button>` : ''}</div></details>`;
}

function fileCard(file) {
  const author = mem(file.by);
  const linkedTask = file.task ? task(file.task) : null;
  const extension = String(file.name || '')
    .split('.')
    .pop()
    .toLowerCase();
  const textual = ['txt', 'md', 'markdown', 'json', 'csv', 'log'].includes(extension);
  const preview = textual
    ? `<span class="workspace-file-text-type" aria-hidden="true">${ic(fileMeta(file).i, 23)}<small translate="no">${esc(extension === 'markdown' ? 'MD' : extension.toUpperCase())}</small></span>`
    : filePrev(file);
  return `<article aria-labelledby="file-card-title-${esc(file.id)}" class="fcard workspace-file-card${textual ? ' textual' : ''}" data-ctx="file" data-id="${file.id}">
    ${fileSelectButton(file)}
    <button class="workspace-file-open" data-a="previewFile" data-id="${file.id}" aria-label="Open ${esc(file.name)}">
      ${preview}
      <span class="fi"><span id="file-card-title-${esc(file.id)}" class="fn trunc" translate="no" title="${esc(file.name)}">${esc(file.name)}</span><span class="fm trunc"><span ${author ? 'translate="no"' : ''}>${esc(author?.name || 'Unknown member')}</span> · ${esc(file.size || formatBytes(file.bytes))} · ${ago(file.at)}</span></span>
    </button>
    ${textual ? '' : folderChip(file)}<div class="workspace-file-card-foot"><div class="workspace-file-card-context">${textual ? textFileLocation(file, linkedTask) : projectChip(file) + (linkedTask ? `<button class="badge" data-a="openTask" data-id="${linkedTask.id}">${ic('link', 10)}${esc(linkedTask.key)}</button>` : '')}</div><span class="sp"></span><button class="ibtn ibtn-xs" data-a="ctxBtn" data-ctx="file" data-id="${file.id}" aria-label="${actionLabel('File options', file.name, fileContext(file))}" title="${actionLabel('File options', file.name, fileContext(file))}">${ic('ellipsis', 13)}</button></div>
  </article>`;
}

function fileTable(files) {
  return `<div class="panel workspace-file-table-wrap"><table class="perm-t workspace-file-table"><thead><tr><th>Name</th><th>Project</th><th>Type</th><th>Size</th><th>Uploaded by</th><th>Date</th><th></th></tr></thead><tbody>${files
    .map(file => {
      const meta = fileMeta(file);
      const author = mem(file.by);
      return `<tr data-ctx="file" data-id="${file.id}"><td data-label="${tr('Name')}"><div class="workspace-file-title">${fileSelectButton(file)}<div class="min0 grow"><button class="workspace-file-name" data-a="previewFile" data-id="${file.id}" title="${esc(file.name)}"><span class="ftype" style="--c:${meta.c}">${ic(meta.i, 14)}</span><span class="trunc" translate="no">${esc(file.name)}</span></button>${folderChip(file)}</div></div></td><td data-label="${tr('Project')}">${projectChip(file) || '—'}</td><td data-label="${tr('Type')}" class="muted">${esc(meta.n)}</td><td data-label="${tr('Size')}" class="num muted">${esc(file.size || formatBytes(file.bytes))}</td><td data-label="${tr('Uploaded by')}"><span class="row workspace-file-author">${av(file.by, 'sm', false)}<span class="trunc" ${author ? 'translate="no"' : ''}>${esc(author?.name || 'Unknown member')}</span></span></td><td data-label="${tr('Date')}" class="muted">${ago(file.at)}</td><td class="workspace-file-actions"><button class="ibtn ibtn-sm" data-a="ctxBtn" data-ctx="file" data-id="${file.id}" aria-label="${actionLabel('File options', file.name, fileContext(file))}" title="${actionLabel('File options', file.name, fileContext(file))}">${ic('ellipsis', 14)}</button></td></tr>`;
    })
    .join('')}</tbody></table></div>`;
}

function uploadsHtml() {
  const uploads = S.ui.uploads || [];
  if (!uploads.length) return '';
  return `<div class="workspace-file-uploads" aria-live="polite">${uploads
    .map(item => {
      const meta = fileMeta({ type: item.type });
      return `<div class="upl"><span class="ftype" style="--c:${meta.c}">${ic(meta.i, 14)}</span><div class="grow min0"><div class="row"><span class="trunc" style="font-weight:500" translate="no">${esc(item.name)}</span><span class="sp"></span><span class="faint num" id="upct-${item.id}">${item.pct}%</span><button class="ibtn ibtn-xs" data-a="cancelUpload" data-id="${item.id}" aria-label="Cancel upload">${ic('x', 13)}</button></div><div class="prog" style="margin-top:6px"><i id="upbar-${item.id}" style="--p:${item.pct / 100}"></i></div></div></div>`;
    })
    .join('')}</div>`;
}

export function pageFiles(projectId = null) {
  filePreferences();
  const projects = visibleProjects().filter(project => canSee(project) && (!projectId || project.id === projectId));
  const projectIds = new Set(projects.map(project => project.id));
  const writable = projects.filter(project => canEditProject(project, D().me, S.ui.currentUser?.role));
  const writableIds = new Set(writable.map(project => project.id));
  const index = createFileIndex(D(), projects, Object.fromEntries(Object.entries(FT).map(([key, meta]) => [key, `${meta.n} ${tr(meta.n)}`])));
  const allFiles = index.files;
  syncFileSelection(allFiles, projectId);
  const query = String(S.ui.fileQ || '')
    .trim()
    .toLowerCase();
  const typeFilter = S.ui.fileType || 'all';
  const projectFilter = projectId || (projectIds.has(S.ui.fileProject) ? S.ui.fileProject : 'all');
  S.ui.fileProject = projectFilter;
  const currentFolder = activeFileFolder(proj(projectFilter), S.ui.fileFolder);
  if (!currentFolder) S.ui.fileFolder = null;
  const sort = S.ui.fileSort || 'date';
  const view = S.ui.fileView || 'grid';
  const uploadProject =
    currentFolder || projectFilter !== 'all'
      ? writableIds.has(projectFilter)
        ? projectFilter
        : ''
      : writableIds.has(S.ui.fileUploadProject)
        ? S.ui.fileUploadProject
        : writable[0]?.id || '';
  S.ui.fileUploadProject = uploadProject;

  let files = filterIndexedFiles(index, { project: projectFilter, folder: currentFolder?.id, recursive: S.ui.fileRecursive, type: typeFilter, query, sort });

  const pageSize = S.ui.filePageSize || 100;
  const pageKey = `files:${projectFilter}:${currentFolder?.id || ''}:${Boolean(S.ui.fileRecursive)}:${typeFilter}:${sort}:${query}:${pageSize}`;
  const remote = demandFilePage({
    context: projectId || 'all',
    project: projectFilter,
    folder: currentFolder?.id || '',
    recursive: Boolean(S.ui.fileRecursive),
    type: typeFilter,
    query,
    sort,
    limit: pageSize,
    offset: (S.ui.listPages?.[pageKey] || 0) * pageSize,
    countFolders: visibleFileFolderKeys(projectFilter, currentFolder, index),
  });
  if (remote) files = (remote.files || []).map(file => D().files.find(item => item.id === file.id)).filter(Boolean);
  const window = remote
    ? { items: files, page: remote.page || 0, pages: remote.pages || 1, total: remote.total || 0 }
    : listWindow(files, S.ui.listPages?.[pageKey], pageSize);
  const allTotal = remote?.allTotal ?? (remote?.loading ? '—' : allFiles.length);
  const totalBytes = remote?.totalBytes ?? (remote?.loading ? null : index.totalBytes);
  const totalSize = totalBytes === null ? '—' : formatBytes(totalBytes);
  const projectCount = remote?.projectCount ?? (remote?.loading ? '—' : index.projectsWithFiles.size);
  if (remote) index.count = (project, folder) => remote.folderCounts?.find(row => row[0] === project && row[1] === folder)?.[2] ?? '—';
  const criteria = [
    ...(!projectId && projectFilter !== 'all' ? [{ key: 'project', label: 'Project', value: proj(projectFilter)?.name || projectFilter }] : []),
    ...(typeFilter !== 'all' ? [{ key: 'type', label: 'Type', value: tr(FT[typeFilter]?.n || 'Other files') }] : []),
    ...(sort !== 'date' ? [{ key: 'sort', label: 'Sort', value: tr({ name: 'Name', size: 'Size', project: 'Project' }[sort] || 'Newest') }] : []),
  ];
  const readOnly = !uploadProject;
  const filtered = Boolean(query || typeFilter !== 'all' || projectFilter !== 'all');
  const searched = Boolean(query || typeFilter !== 'all');
  const maxSize = fsize(S.ui.filePolicy?.maxFileSizeBytes || 4 * 1024 * 1024);
  const exportPanel = fileExportsPanel();
  const activeExports =
    S.ui.fileSelection?.length ||
    S.ui.fileExportCreating ||
    S.ui.fileExportRunning ||
    S.ui.fileExportError ||
    S.ui.fileExports?.some(job => ['pending', 'processing', 'failed'].includes(job.phase));

  return `<div class="files-page layout-catalog ${projectId ? 'project-files-page' : ''}" ${uploadProject ? `data-dropzone="${esc(uploadProject)}" data-folder="${esc(currentFolder?.id || '')}"` : ''}>
    ${collectionHeader(
      `${projectId ? `<div class="files-context-summary"><h2 class="sr">Files</h2><span><span>Total files</span>: <b>${allTotal}</b></span><span class="muted">${totalSize}</span></div>` : `<div><h1>Files</h1><p><span>Total files</span>: ${allTotal} · ${totalSize}</p></div>`}
      ${
        readOnly || !projects.length
          ? ''
          : `<div class="files-upload-actions">${projectId ? '' : `<label class="files-upload-target" for="files-upload-project"><span>Upload to:</span><select class="select" ${currentFolder || projectFilter !== 'all' ? 'disabled' : ''} id="files-upload-project" data-in="fileUploadProject" aria-label="Upload to project">${writable.map(project => `<option value="${project.id}" ${uploadProject === project.id ? 'selected' : ''} translate="no">${esc(project.name)}</option>`).join('')}</select></label>`}<button class="btn btn-primary" data-a="chooseStoredFiles" data-picker="workspace-files-upload" aria-label="Upload files" title="Upload files">${ic('upload', 14)}<span class="hide-m">Upload files</span></button><input id="workspace-files-upload" type="file" multiple hidden data-in="uploadFiles" data-project="${uploadProject}" data-folder="${esc(currentFolder?.id || '')}"></div>`
      }
    `,
      'files-page-head',
    )}

    <details class="files-details" ${S.ui.fileDetailsOpen ? 'open' : ''}><summary>Details</summary>${
      projectId
        ? ''
        : `<section class="files-summary" aria-label="File summary">
      <div><span class="files-summary-icon">${ic('files', 16)}</span><span><small>Total files</small><b>${allTotal}</b></span></div>
      <div><span class="files-summary-icon">${ic('hard-drive', 16)}</span><span><small>Storage used</small><b>${totalSize}</b></span></div>
      <div><span class="files-summary-icon">${ic('folder-kanban', 16)}</span><span><small>Projects with files</small><b>${projectCount}</b></span></div>
    </section>`
    }<section class="files-presets" aria-label="Saved file filters">${filePresetsHtml()}<span class="sp"></span>${currentFolder ? `<button class="btn btn-ghost btn-sm" data-a="toggleFileRecursive" aria-pressed="${Boolean(S.ui.fileRecursive)}">${ic('folders', 15)}Include subfolders</button><span class="hint">${S.ui.fileRecursive ? 'Showing this folder tree.' : 'Showing direct files only.'}</span>` : ''}</section>${activeExports ? '' : exportPanel}</details>


    ${collectionToolbar(
      `
      <div class="inwrap workspace-file-search">${ic('search', 14)}<input class="input" id="workspace-file-q" data-in="fileQ" placeholder="Search files, projects, and people" value="${esc(S.ui.fileQ || '')}" aria-label="Search files">${query ? `<button class="ibtn workspace-file-search-clear" data-a="clearFileQuery" aria-label="Clear search" title="Clear search">${ic('x', 14)}</button>` : ''}</div>
      <details class="files-filter-options ${(document.querySelector('.main')?.clientWidth || innerWidth) <= 850 ? 'ui-menu is-mobile' : 'is-desktop'}" ${(document.querySelector('.main')?.clientWidth || innerWidth) > 850 || S.ui.fileFiltersOpen ? 'open' : ''}><summary class="btn btn-secondary" aria-label="${filterSummaryLabel('File filters', criteria)}" title="${filterSummaryLabel('File filters', criteria)}">${ic('filter', 14)}<span class="hide-m">Filters</span>${criteria.length ? `<span class="cnt">${criteria.length}</span>` : ''}</summary><div>
      ${projectId ? '' : `<label class="sr" for="workspace-file-project">Filter by project</label><select class="select" id="workspace-file-project" data-in="fileProject"><option value="all">All projects</option>${projects.map(project => `<option value="${project.id}" ${projectFilter === project.id ? 'selected' : ''} translate="no">${esc(project.name)}</option>`).join('')}</select>`}
      <label class="sr" for="workspace-file-type">Filter by type</label><select class="select" id="workspace-file-type" data-in="fileType"><option value="all">All types</option>${Object.entries(
        FT,
      )
        .filter(([key]) => key !== 'other')
        .map(([key, meta]) => `<option value="${key}" ${typeFilter === key ? 'selected' : ''}>${meta.n}</option>`)
        .join('')}<option value="other" ${typeFilter === 'other' ? 'selected' : ''}>Other files</option></select>
      <label class="sr" for="workspace-file-sort">Sort files</label><select class="select" id="workspace-file-sort" data-in="fileSort">${[
        ['date', 'Newest'],
        ['name', 'Name'],
        ['size', 'Size'],
        ['project', 'Project'],
      ]
        .map(([value, label]) => `<option value="${value}" ${sort === value ? 'selected' : ''}>${label}</option>`)
        .join('')}</select>
      <div class="seg files-view-switch" role="group" aria-label="File view">${[
        ['grid', 'layout-grid', 'Grid view'],
        ['list', 'list', 'List view'],
      ]
        .map(
          ([value, icon, label]) =>
            `<button class="${view === value ? 'on' : ''}" data-a="set" data-k="fileView" data-v="${value}" aria-label="${label}" aria-pressed="${view === value}">${ic(icon, 13)}</button>`,
        )
        .join('')}</div></div></details>
    `,
      'File filters',
      'files-toolbar workspace-files-toolbar',
    )}

    ${filterCriteria(criteria, 'clearFileCriterion')}
    ${filtered && (!projectId || query || typeFilter !== 'all' || currentFolder) ? `<div class="files-filter-summary"><span role="status" aria-live="polite">${remote?.loading ? 'Loading files…' : `<span>Files found</span>: <b>${window.total}</b> / ${allTotal}`}</span>${currentFolder ? '<button class="btn btn-ghost btn-sm" data-a="searchAllFiles">Search all folders</button>' : ''}<button class="btn btn-ghost btn-sm" data-a="clearFileFilters">${ic('x', 13)}Clear filters</button></div>` : ''}

    ${
      readOnly || !projects.length
        ? ''
        : `<label class="dropzone workspace-files-dropzone" data-dropzone="${uploadProject}" data-folder="${currentFolder?.id || ''}">${ic('upload-cloud', 18)}<span>Drop files here or <span class="link">browse</span> — up to ${maxSize} each</span><input type="file" multiple hidden data-in="uploadFiles" data-project="${uploadProject}" data-folder="${currentFolder?.id || ''}"></label>`
    }
    ${fileFolderBrowser(projects, projectFilter, currentFolder, files.length > 0, index)}
    <section class="files-operations" aria-label="File operations">${uploadsHtml()}
    ${fileDownloadProgress()}
    ${fileTransferPanel()}
    ${activeExports ? exportPanel : ''}</section>
    ${fileSelectionBar(window.items, files, remote)}
    ${
      remote?.loading
        ? filePagePending(remote)
        : files.length
          ? view === 'grid'
            ? `<div class="fgrid workspace-file-grid">${window.items.map(fileCard).join('')}</div>`
            : fileTable(window.items)
          : empty(
              searched ? 'search-x' : projects.length ? 'folder-open' : 'folder-plus',
              searched ? 'No files found' : currentFolder ? 'This folder is empty' : projects.length ? 'No files yet' : 'Create a project first',
              searched
                ? 'Try changing the search or filters.'
                : projects.length
                  ? readOnly
                    ? 'Editors can upload the first shared file.'
                    : currentFolder
                      ? 'Upload files here or move existing project files into this folder.'
                      : 'Upload the first document, design, or team asset.'
                  : 'Files are organized by project, so create one before uploading.',
              !searched && S.ui.currentUser?.role !== 'viewer' && !projects.length
                ? `<button class="btn btn-primary" data-a="newProject">${ic('plus', 14)}Create project</button>`
                : '',
              '',
              1,
            )
    }
    <div class="files-pagination"><label class="files-page-size"><span>Files per page</span><select class="select" id="files-page-size" data-in="filePageSize" aria-label="Files per page">${[25, 50, 100].map(size => `<option value="${size}" ${size === pageSize ? 'selected' : ''}>${size}</option>`).join('')}</select></label>${paginationHtml(window, pageKey)}${window.pages > 1 ? `<label class="files-page-size"><span>Go to page</span><input class="input files-page-input" id="files-page-jump" aria-label="Go to file page" type="number" min="1" max="${window.pages}" value="${window.page + 1}" data-key-enter="filePageJump" data-key="${esc(pageKey)}"></label>` : ''}</div>
  </div>`;
}
