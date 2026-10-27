import { D, S } from '../core/store.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { canEditProject } from '../shared/project-access.js';
import { normalizeFileSearch } from '../shared/file-index.js';
import { fileFolderMenu } from './file-folder-menu.js';
import { disclosureAttributes } from './disclosure.js';
import { fileFolderView } from '../core/file-preferences.js';

export function visibleFileFolderKeys(projectId, currentFolder, index) {
  const terms = normalizeFileSearch(S.ui.fileFolderQuery).trim().split(/\s+/).filter(Boolean);
  const archived = Boolean(S.ui.fileFoldersArchived);
  const entries = index.folderEntries
    .filter(
      entry =>
        (projectId === 'all' || entry.project.id === projectId) &&
        Boolean(entry.folder.archived) === archived &&
        (terms.length ? terms.every(term => entry.search.includes(term)) : archived || (entry.folder.parentId || null) === (currentFolder?.id || null)),
    )
    .sort((a, b) => a.folder.name.localeCompare(b.folder.name));
  const limit = fileFolderView().compact ? (window.innerWidth <= 640 ? 8 : 16) : window.innerWidth <= 640 ? 4 : 8;
  const start = Math.min(Math.max(0, Number(S.ui.fileFolderOffset) || 0), Math.max(0, Math.ceil(entries.length / limit) - 1) * limit);
  return entries.slice(start, start + limit).map(entry => [entry.project.id, entry.folder.id]);
}

export function fileFolderBrowser(projects, projectId, currentFolder, hasFiles, index) {
  const scope = projects.filter(project => projectId === 'all' || project.id === projectId);
  const archived = Boolean(S.ui.fileFoldersArchived);
  const query = normalizeFileSearch(S.ui.fileFolderQuery).trim();
  const terms = query.split(/\s+/).filter(Boolean);
  const all = index.folderEntries.filter(entry => projectId === 'all' || entry.project.id === projectId);
  const entries = all
    .filter(({ folder, search }) => {
      if (Boolean(folder.archived) !== archived) return false;
      if (query) return terms.every(term => search.includes(term));
      return archived || (folder.parentId || null) === (currentFolder?.id || null);
    })
    .sort((a, b) => a.folder.name.localeCompare(b.folder.name));
  const { compact, collapsed } = fileFolderView();
  const limit = compact ? (window.innerWidth <= 640 ? 8 : 16) : window.innerWidth <= 640 ? 4 : 8;
  const start = Math.min(Math.max(0, Number(S.ui.fileFolderOffset) || 0), Math.max(0, Math.ceil(entries.length / limit) - 1) * limit);
  S.ui.fileFolderOffset = start;
  const page = entries.slice(start, start + limit);
  const writable = scope.some(project => canEditProject(project, D().me, S.ui.currentUser?.role));
  const currentProject = scope.find(project => project.id === projectId);
  const crumbs = currentFolder ? index.folderPath(currentProject.id, currentFolder.id) : [];
  return `<section class="files-folders" aria-label="File folders">
    ${currentProject ? `<nav class="files-folder-crumbs" aria-label="File location"><button class="btn btn-ghost btn-sm" data-a="openFileFolder" data-project="all" data-folder="">All files</button>${currentProject ? `<span aria-hidden="true">/</span><button class="btn btn-ghost btn-sm" data-a="openFileFolder" data-project="${esc(projectId)}" data-folder="" translate="no">${esc(currentProject.name)}</button>` : ''}${crumbs.map(folder => `<span aria-hidden="true">/</span><button class="btn btn-ghost btn-sm" data-a="openFileFolder" data-project="${esc(projectId)}" data-folder="${esc(folder.id)}" translate="no">${esc(folder.name)}</button>`).join('')}</nav>` : ''}
    <div class="files-folders-head"><h2>${archived ? 'Archived folders' : 'Folders'}</h2><span class="num faint">${entries.length ? `${start + 1}–${start + page.length} / ${entries.length}` : '0'}</span><span class="sp"></span><button class="ibtn" data-a="toggleFileFolders" aria-expanded="${!collapsed}" aria-label="${collapsed ? 'Show file folders' : 'Hide file folders'}" title="${collapsed ? 'Show file folders' : 'Hide file folders'}">${ic(collapsed ? 'chevron-down' : 'chevron-up', 16)}</button>${hasFiles ? `<button class="ibtn" data-a="focusFileResults" aria-label="Jump to files" title="Jump to files">${ic('arrow-down', 16)}</button>` : ''}<details class="ui-menu files-folder-tools" ${disclosureAttributes('files:folder-tools')}><summary class="ibtn" aria-label="Folder options" title="Folder options">${ic('ellipsis', 16)}</summary><div><button class="btn btn-ghost" data-a="toggleFileFolderLayout" aria-pressed="${compact}">${ic(compact ? 'layout-grid' : 'list', 16)}${compact ? 'Folder tiles' : 'Compact folders'}</button><button class="btn btn-ghost" data-a="toggleFileFolderArchive" aria-pressed="${archived}">${ic('archive', 16)}Archived folders</button>${writable && !archived ? `<button class="btn btn-ghost" data-a="newFileFolder">${ic('folder-plus', 15)}New folder</button>` : ''}</div></details></div>
    ${!collapsed && (all.length > limit || query) ? `<div class="inwrap files-folder-search">${ic('search', 14)}<input class="input" id="files-folder-query" data-in="fileFolderQuery" value="${esc(S.ui.fileFolderQuery || '')}" placeholder="Find file folders" aria-label="Find file folders"></div>` : ''}
    ${
      collapsed
        ? ''
        : page.length
          ? `<div class="files-folder-grid ${compact ? 'compact' : ''}">${page
              .map(({ folder, project }) => {
                const writable = canEditProject(project, D().me, S.ui.currentUser?.role);
                const count = index.count(project.id, folder.id);
                const nonempty = index.hasChildren(project.id, folder.id) || count !== 0;
                const context = [
                  project.name,
                  ...index
                    .folderPath(project.id, folder.id)
                    .slice(0, -1)
                    .map(item => item.name),
                ].join(' / ');
                const target = `data-project="${esc(project.id)}" data-folder="${esc(folder.id)}"`;
                const menu = archived
                  ? `<button class="btn btn-ghost btn-sm" data-a="restoreFileFolder" ${target}>${ic('rotate-ccw', 14)}Restore folder</button>`
                  : `<details class="files-folder-menu ui-menu" ${fileFolderMenu(project.id, folder.id)}><summary aria-label="Folder actions" title="Folder actions">${ic('ellipsis', 16)}</summary><div><button class="btn btn-ghost btn-sm" data-a="renameFileFolder" ${target}>${ic('pencil', 14)}Rename folder</button><button class="btn btn-ghost btn-sm" data-a="moveFileFolder" ${target}>${ic('folder-input', 14)}Move folder</button><button class="btn btn-ghost btn-sm" data-a="archiveFileFolder" ${target} ${nonempty ? 'disabled' : ''} title="Only an empty file folder can be archived.">${ic('archive', 14)}Archive folder</button></div></details>`;
                return `<article class="files-folder-tile"><${archived ? 'div' : 'button'} class="files-folder-open" ${archived ? '' : `data-a="openFileFolder" ${target}`} title="${esc(folder.name)}">${ic(archived ? 'archive' : 'folder', 24)}<strong translate="no">${esc(folder.name)}</strong><span class="faint" translate="no">${esc(context)}</span>${archived ? '' : `<small><span>Direct files</span>: ${count}</small>`}</${archived ? 'div' : 'button'}>${writable ? menu : ''}</article>`;
              })
              .join('')}</div>`
          : query
            ? '<p class="hint">No matching folders.</p>'
            : archived
              ? '<p class="hint">No archived file folders.</p>'
              : ''
    }
    ${!collapsed && entries.length > limit ? `<div class="files-folder-pages" role="group" aria-label="Folder pages"><button class="btn btn-ghost btn-sm" data-a="fileFolderPage" data-offset="${Math.max(0, start - limit)}" ${!start ? 'disabled' : ''}>Previous folders</button><input class="input files-page-input" id="files-folder-page-jump" aria-label="Go to folder page" type="number" min="1" max="${Math.ceil(entries.length / limit)}" value="${Math.floor(start / limit) + 1}" data-key-enter="fileFolderJump" data-size="${limit}"><span class="faint">/ ${Math.ceil(entries.length / limit)}</span><button class="btn btn-ghost btn-sm" data-a="fileFolderPage" data-offset="${start + limit}" ${start + limit >= entries.length ? 'disabled' : ''}>Next folders</button></div>` : ''}
  </section>`;
}
