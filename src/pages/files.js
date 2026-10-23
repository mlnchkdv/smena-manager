import { ago, esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { D, S, canSee, mem, pColor, proj, task, visibleProjects } from '../core/store.js';
import { FT, av, empty, filePrev, fsize } from '../ui/helpers.js';
import { listWindow } from '../shared/list-window.js';
import { paginationHtml } from '../ui/pagination.js';
import { t as tr } from '../core/i18n.js';
import { canEditProject } from '../shared/project-access.js';
import { activeFileFolder, fileFolderPath } from '../shared/file-organization.js';
import { createFileIndex, filterIndexedFiles } from '../shared/file-index.js';
import { fileFolderBrowser } from '../ui/file-folders.js';
import { fileSelectButton, fileSelectionBar, syncFileSelection, fileDownloadProgress } from '../ui/file-selection.js';
import { filePreferences } from '../core/file-preferences.js';
import { filePresetsHtml } from '../ui/file-presets.js';
import '../features/files.js';
import '../features/file-selection.js';

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

function fileCard(file) {
  const author = mem(file.by);
  const linkedTask = file.task ? task(file.task) : null;
  return `<article class="fcard workspace-file-card" data-ctx="file" data-id="${file.id}">
    ${fileSelectButton(file)}
    <button class="workspace-file-open" data-a="previewFile" data-id="${file.id}" aria-label="Open ${esc(file.name)}">
      ${filePrev(file)}
      <span class="fi"><span class="fn trunc" translate="no" title="${esc(file.name)}">${esc(file.name)}</span><span class="fm trunc"><span ${author ? 'translate="no"' : ''}>${esc(author?.name || 'Unknown member')}</span> · ${ago(file.at)}</span></span>
    </button>
    ${folderChip(file)}<div class="workspace-file-card-foot">${projectChip(file)}${linkedTask ? `<button class="badge" data-a="openTask" data-id="${linkedTask.id}">${ic('link', 10)}${esc(linkedTask.key)}</button>` : ''}<span class="sp"></span><button class="ibtn ibtn-xs" data-a="ctxBtn" data-ctx="file" data-id="${file.id}" aria-label="File options">${ic('ellipsis', 13)}</button></div>
  </article>`;
}

function fileTable(files) {
  return `<div class="panel workspace-file-table-wrap"><table class="perm-t workspace-file-table"><thead><tr><th>Name</th><th>Project</th><th>Type</th><th>Size</th><th>Uploaded by</th><th>Date</th><th></th></tr></thead><tbody>${files
    .map(file => {
      const meta = fileMeta(file);
      const author = mem(file.by);
      return `<tr data-ctx="file" data-id="${file.id}"><td data-label="${tr('Name')}"><div class="workspace-file-title">${fileSelectButton(file)}<div class="min0 grow"><button class="workspace-file-name" data-a="previewFile" data-id="${file.id}" title="${esc(file.name)}"><span class="ftype" style="--c:${meta.c}">${ic(meta.i, 14)}</span><span class="trunc" translate="no">${esc(file.name)}</span></button>${folderChip(file)}</div></div></td><td data-label="${tr('Project')}">${projectChip(file) || '—'}</td><td data-label="${tr('Type')}" class="muted">${esc(meta.n)}</td><td data-label="${tr('Size')}" class="num muted">${esc(file.size || formatBytes(file.bytes))}</td><td data-label="${tr('Uploaded by')}"><span class="row workspace-file-author">${av(file.by, 'sm', false)}<span class="trunc" ${author ? 'translate="no"' : ''}>${esc(author?.name || 'Unknown member')}</span></span></td><td data-label="${tr('Date')}" class="muted">${ago(file.at)}</td><td class="workspace-file-actions"><button class="ibtn ibtn-sm" data-a="ctxBtn" data-ctx="file" data-id="${file.id}" aria-label="File options">${ic('ellipsis', 14)}</button></td></tr>`;
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

  const files = filterIndexedFiles(index, { project: projectFilter, folder: currentFolder?.id, recursive: S.ui.fileRecursive, type: typeFilter, query, sort });

  const pageSize = S.ui.filePageSize || 100;
  const pageKey = `files:${projectFilter}:${currentFolder?.id || ''}:${Boolean(S.ui.fileRecursive)}:${typeFilter}:${sort}:${query}:${pageSize}`;
  const window = listWindow(files, S.ui.listPages?.[pageKey], pageSize);
  const totalBytes = index.totalBytes;
  const projectCount = index.projectsWithFiles.size;
  const readOnly = !uploadProject;
  const filtered = Boolean(query || typeFilter !== 'all' || projectFilter !== 'all');
  const searched = Boolean(query || typeFilter !== 'all');
  const maxSize = fsize(S.ui.filePolicy?.maxFileSizeBytes || 4 * 1024 * 1024);

  return `<div class="files-page ${projectId ? 'project-files-page' : ''}">
    <header class="page-head files-page-head">${projectId ? `<div class="files-context-summary"><h2 class="sr">Files</h2><span><b>${allFiles.length}</b> <span>Total files</span></span><span class="muted">${formatBytes(totalBytes)}</span></div>` : '<div><h1>Files</h1><p>One place for project documents, designs, and shared team assets.</p></div>'}
      ${
        readOnly || !projects.length
          ? ''
          : `<div class="files-upload-actions">${projectId ? '' : `<label class="sr" for="files-upload-project">Upload to project</label><select class="select" ${currentFolder || projectFilter !== 'all' ? 'disabled' : ''} id="files-upload-project" data-in="fileUploadProject" aria-label="Upload to project">${writable.map(project => `<option value="${project.id}" ${uploadProject === project.id ? 'selected' : ''} translate="no">${esc(project.name)}</option>`).join('')}</select>`}<button class="btn btn-primary" data-a="chooseStoredFiles" data-picker="workspace-files-upload">${ic('upload', 14)}Upload files</button><input id="workspace-files-upload" type="file" multiple hidden data-in="uploadFiles" data-project="${uploadProject}" data-folder="${currentFolder?.id || ''}"></div>`
      }
    </header>

    ${
      projectId
        ? ''
        : `<section class="files-summary" aria-label="File summary">
      <div><span class="files-summary-icon">${ic('files', 16)}</span><span><small>Total files</small><b>${allFiles.length}</b></span></div>
      <div><span class="files-summary-icon">${ic('hard-drive', 16)}</span><span><small>Storage used</small><b>${formatBytes(totalBytes)}</b></span></div>
      <div><span class="files-summary-icon">${ic('folder-kanban', 16)}</span><span><small>Projects with files</small><b>${projectCount}</b></span></div>
    </section>`
    }


    <section class="files-toolbar workspace-files-toolbar" aria-label="File filters">
      <div class="inwrap workspace-file-search">${ic('search', 14)}<input class="input" id="workspace-file-q" data-in="fileQ" placeholder="Search files, projects, and people" value="${esc(S.ui.fileQ || '')}" aria-label="Search files">${query ? `<button class="ibtn workspace-file-search-clear" data-a="clearFileQuery" aria-label="Clear search" title="Clear search">${ic('x', 14)}</button>` : ''}</div>
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
        .join('')}</div>
    </section>

    <section class="files-presets" aria-label="Saved file filters">${filePresetsHtml()}<span class="sp"></span>${currentFolder ? `<button class="btn btn-ghost btn-sm" data-a="toggleFileRecursive" aria-pressed="${Boolean(S.ui.fileRecursive)}">${ic('folders', 15)}Include subfolders</button><span class="hint">${S.ui.fileRecursive ? 'Showing this folder tree.' : 'Showing direct files only.'}</span>` : ''}</section>
    ${filtered && (!projectId || query || typeFilter !== 'all' || currentFolder) ? `<div class="files-filter-summary"><span role="status" aria-live="polite"><span>Files found</span>: <b>${files.length}</b> / ${allFiles.length}</span><button class="btn btn-ghost btn-sm" data-a="clearFileFilters">${ic('x', 13)}Clear filters</button></div>` : ''}

    ${
      readOnly || !projects.length
        ? ''
        : `<label class="dropzone workspace-files-dropzone" data-dropzone="${uploadProject}" data-folder="${currentFolder?.id || ''}">${ic('upload-cloud', 18)}<span>Drop files here or <span class="link">browse</span> — up to ${maxSize} each</span><input type="file" multiple hidden data-in="uploadFiles" data-project="${uploadProject}" data-folder="${currentFolder?.id || ''}"></label>`
    }
    ${fileFolderBrowser(projects, projectFilter, currentFolder, files.length > 0, index)}
    ${uploadsHtml()}
    ${fileDownloadProgress()}
    ${fileSelectionBar(window.items, files)}
    ${
      files.length
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
