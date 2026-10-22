import { D, S, proj, visibleProjects } from '../core/store.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { canEditProject } from '../shared/project-access.js';
import { canEditFile } from '../shared/file-access.js';
import { fileFolders, fileFolderPath, activeFileFolder, planFileFolderMove } from '../shared/file-organization.js';
import { createFileIndex } from '../shared/file-index.js';

export function fileFolderForm(modal, H) {
  const projects = visibleProjects().filter(project => canEditProject(project, D().me, S.ui.currentUser?.role));
  const parent = modal.parentId
    ? fileFolderPath(proj(modal.projectId), modal.parentId)
        .map(folder => folder.name)
        .join(' / ')
    : '';
  return `${H(modal.id ? 'Rename folder' : 'New folder')}<div class="modal-b col" style="gap:16px"><div class="field"><label class="label" for="file-folder-project">Project</label><select class="select" id="file-folder-project" data-in="fileFolderProject" ${modal.id || modal.parentId ? 'disabled' : ''}>${projects.map(project => `<option value="${esc(project.id)}" ${project.id === modal.projectId ? 'selected' : ''} translate="no">${esc(project.name)}</option>`).join('')}</select></div>${parent ? `<div class="hint"><span>Parent folder</span>: <span translate="no">${esc(parent)}</span></div>` : ''}<div class="field"><label class="label" for="file-folder-name">Folder name</label><input class="input" id="file-folder-name" autofocus data-key-enter="saveFileFolder" maxlength="120" data-in="fileFolderName" value="${esc(modal.name || '')}" autocomplete="off"></div><p class="hint">File folders organize this project without moving stored Google Drive files.</p></div><div class="modal-f"><button class="btn btn-secondary" data-a="closeModal">Cancel</button><span class="sp"></span><button class="btn btn-primary" data-a="saveFileFolder">Save</button></div>`;
}

export function fileMoveForm(modal, H) {
  const project = proj(modal.projectId);
  const source = activeFileFolder(project, modal.folderMoveId);
  const index = createFileIndex({ files: [] }, project ? [project] : []);
  const selected = new Set(modal.ids);
  const files = D().files.filter(file => selected.has(file.id));
  const terms = String(modal.query || '')
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const folders = fileFolders(project)
    .filter(folder => !folder.archived && (!source || !index.folderPath(project.id, folder.id).some(parent => parent.id === source.id)))
    .map(folder => ({
      folder,
      path: index
        .folderPath(project.id, folder.id)
        .map(item => item.name)
        .join(' / '),
    }))
    .filter(item => terms.every(term => item.path.toLocaleLowerCase().includes(term)))
    .sort((a, b) => a.path.localeCompare(b.path));
  const start = Math.min(modal.offset || 0, Math.max(0, Math.ceil(folders.length / 20) - 1) * 20);
  const targetValid = !modal.folderId || activeFileFolder(project, modal.folderId);
  const changed = source ? (source.parentId || null) !== (modal.folderId || null) : files.some(file => (file.folderId || null) !== (modal.folderId || null));
  let preview;
  if (source) {
    try {
      preview = planFileFolderMove(D(), project.id, source.id, modal.folderId, S.ui.currentUser?.role);
    } catch {
      /* Invalid destinations cannot be confirmed. */
    }
  }
  const allowed = modal.folderMoveId
    ? Boolean(source && preview)
    : files.length === selected.size && files.every(file => file.project === project?.id && canEditFile(file, D(), S.ui.currentUser?.role));
  return `${H(modal.folderMoveId ? 'Move folder' : 'Move files')}<div class="modal-b col" style="gap:12px">${source ? `<p translate="no"><strong>${esc(source.name)}</strong></p>${preview ? `<p class="hint"><span>Folders in this tree</span>: ${preview.folderCount} · <span>Files in this tree</span>: ${preview.fileCount}</p>` : ''}<p class="hint">The whole folder tree moves within this project. Access permissions stay unchanged.</p>` : `<p class="hint"><span>Selected files</span>: ${selected.size} · <span translate="no">${esc(project?.name || '')}</span></p>`}<div class="inwrap">${ic('search', 14)}<input class="input" id="file-move-query" data-in="fileMoveQuery" value="${esc(modal.query || '')}" placeholder="Find destination folder" aria-label="Find destination folder"></div><div class="file-move-folders"><button class="file-move-row ${modal.folderId ? '' : 'on'}" data-a="selectFileMoveTarget" data-folder="" aria-pressed="${!modal.folderId}">${ic('folder-open', 18)}<span>No folder</span></button>${folders
    .slice(start, start + 20)
    .map(
      ({ folder, path }) =>
        `<button class="file-move-row ${modal.folderId === folder.id ? 'on' : ''}" data-a="selectFileMoveTarget" data-folder="${esc(folder.id)}" aria-pressed="${modal.folderId === folder.id}">${ic('folder', 18)}<span translate="no">${esc(path)}</span></button>`,
    )
    .join(
      '',
    )}${!folders.length ? '<p class="hint">No matching folders.</p>' : ''}</div>${folders.length > 20 ? `<div class="files-folder-pages"><button class="btn btn-ghost btn-sm" data-a="fileMovePage" data-offset="${Math.max(0, start - 20)}" ${!start ? 'disabled' : ''}>Previous folders</button><span class="num">${start + 1}–${Math.min(start + 20, folders.length)} / ${folders.length}</span><button class="btn btn-ghost btn-sm" data-a="fileMovePage" data-offset="${start + 20}" ${start + 20 >= folders.length ? 'disabled' : ''}>Next folders</button></div>` : ''}<p class="file-move-destination"><span>Destination folder</span>: ${
    modal.folderId
      ? `<strong translate="no">${esc(
          fileFolderPath(project, modal.folderId)
            .map(folder => folder.name)
            .join(' / '),
        )}</strong>`
      : '<strong>No folder</strong>'
  }</p><p class="hint">File links and task attachments will stay intact.</p></div><div class="modal-f"><button class="btn btn-secondary" data-a="closeModal">Cancel</button><span class="sp"></span><button class="btn btn-primary" data-a="confirmFileMove" ${!allowed || !targetValid || !changed ? 'disabled' : ''}>Move here</button></div>`;
}
