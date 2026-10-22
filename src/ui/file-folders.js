import { D, S } from '../core/store.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { canEditProject } from '../shared/project-access.js';
import { fileFolders, fileFolderPath } from '../shared/file-organization.js';

export function fileFolderBrowser(projects, projectId, currentFolder, hasFiles) {
  const scope = projects.filter(project => projectId === 'all' || project.id === projectId);
  const archived = Boolean(S.ui.fileFoldersArchived);
  const query = String(S.ui.fileFolderQuery || '')
    .trim()
    .toLocaleLowerCase();
  const terms = query.split(/\s+/).filter(Boolean);
  const all = scope.flatMap(project => fileFolders(project).map(folder => ({ folder, project })));
  const entries = all
    .filter(({ folder, project }) => {
      if (Boolean(folder.archived) !== archived) return false;
      if (query)
        return terms.every(term =>
          `${project.name} ${fileFolderPath(project, folder.id)
            .map(item => item.name)
            .join(' ')}`
            .toLocaleLowerCase()
            .includes(term),
        );
      return archived || (folder.parentId || null) === (currentFolder?.id || null);
    })
    .sort((a, b) => a.folder.name.localeCompare(b.folder.name));
  const limit = window.innerWidth <= 640 ? 4 : 8;
  const start = Math.min(Math.max(0, Number(S.ui.fileFolderOffset) || 0), Math.max(0, Math.ceil(entries.length / limit) - 1) * limit);
  S.ui.fileFolderOffset = start;
  const page = entries.slice(start, start + limit);
  const writable = scope.some(project => canEditProject(project, D().me, S.ui.currentUser?.role));
  const currentProject = scope.find(project => project.id === projectId);
  const crumbs = currentFolder ? fileFolderPath(currentProject, currentFolder.id) : [];
  return `<section class="files-folders" aria-label="File folders">
    <nav class="files-folder-crumbs" aria-label="File location"><button class="btn btn-ghost btn-sm" data-a="openFileFolder" data-project="${esc(projectId)}" data-folder="">All files</button>${currentProject ? `<span aria-hidden="true">/</span><span translate="no">${esc(currentProject.name)}</span>` : ''}${crumbs.map(folder => `<span aria-hidden="true">/</span><button class="btn btn-ghost btn-sm" data-a="openFileFolder" data-project="${esc(projectId)}" data-folder="${esc(folder.id)}" translate="no">${esc(folder.name)}</button>`).join('')}</nav>
    <div class="files-folders-head"><h2>${archived ? 'Archived folders' : 'Folders'}</h2><span class="num faint">${entries.length ? `${start + 1}–${start + page.length} / ${entries.length}` : '0'}</span><span class="sp"></span>${hasFiles ? `<button class="ibtn" data-a="focusFileResults" aria-label="Jump to files" title="Jump to files">${ic('arrow-down', 16)}</button>` : ''}<button class="ibtn" data-a="toggleFileFolderArchive" aria-pressed="${archived}" aria-label="Archived folders" title="Archived folders">${ic('archive', 16)}</button>${writable && !archived ? `<button class="btn btn-secondary btn-sm" data-a="newFileFolder">${ic('folder-plus', 15)}<span>New folder</span></button>` : ''}</div>
    ${all.length > limit || query ? `<div class="inwrap files-folder-search">${ic('search', 14)}<input class="input" id="files-folder-query" data-in="fileFolderQuery" value="${esc(S.ui.fileFolderQuery || '')}" placeholder="Find file folders" aria-label="Find file folders"></div>` : ''}
    ${
      page.length
        ? `<div class="files-folder-grid">${page
            .map(({ folder, project }) => {
              const writable = canEditProject(project, D().me, S.ui.currentUser?.role);
              const nonempty =
                fileFolders(project).some(item => !item.archived && item.parentId === folder.id) ||
                D().files.some(file => file.project === project.id && file.folderId === folder.id);
              const count = D().files.filter(file => file.project === project.id && file.folderId === folder.id).length;
              const context = [
                project.name,
                ...fileFolderPath(project, folder.id)
                  .slice(0, -1)
                  .map(item => item.name),
              ].join(' / ');
              return `<article class="files-folder-tile"><${archived ? 'div' : 'button'} class="files-folder-open" ${archived ? '' : `data-a="openFileFolder" data-project="${esc(project.id)}" data-folder="${esc(folder.id)}"`} title="${esc(folder.name)}">${ic(archived ? 'archive' : 'folder', 24)}<strong translate="no">${esc(folder.name)}</strong><span class="faint" translate="no">${esc(context)}</span>${archived ? '' : `<small><span>Files</span>: ${count}</small>`}</${archived ? 'div' : 'button'}>${writable ? (archived ? `<button class="btn btn-ghost btn-sm" data-a="restoreFileFolder" data-project="${esc(project.id)}" data-folder="${esc(folder.id)}">${ic('rotate-ccw', 14)}Restore folder</button>` : `<details class="files-folder-menu"><summary aria-label="Folder actions" title="Folder actions">${ic('ellipsis', 16)}</summary><div><button class="btn btn-ghost btn-sm" data-a="renameFileFolder" data-project="${esc(project.id)}" data-folder="${esc(folder.id)}">${ic('pencil', 14)}Rename folder</button><button class="btn btn-ghost btn-sm" data-a="archiveFileFolder" data-project="${esc(project.id)}" data-folder="${esc(folder.id)}" ${nonempty ? 'disabled' : ''} title="Only an empty file folder can be archived.">${ic('archive', 14)}Archive folder</button></div></details>`) : ''}</article>`;
            })
            .join('')}</div>`
        : query
          ? '<p class="hint">No matching folders.</p>'
          : archived
            ? '<p class="hint">No archived file folders.</p>'
            : ''
    }
    ${entries.length > limit ? `<div class="files-folder-pages" role="group" aria-label="Folder pages"><button class="btn btn-ghost btn-sm" data-a="fileFolderPage" data-offset="${Math.max(0, start - limit)}" ${!start ? 'disabled' : ''}>Previous folders</button><button class="btn btn-ghost btn-sm" data-a="fileFolderPage" data-offset="${start + limit}" ${start + limit >= entries.length ? 'disabled' : ''}>Next folders</button></div>` : ''}
  </section>`;
}
