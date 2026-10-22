import { A, IN, KEY } from '../actions/actions.js';
import { D, S, proj, visibleProjects } from '../core/store.js';
import { uid } from '../core/utils.js';
import { render } from '../shell/render.js';
import { openModal, closeModal, fileModalRenderers } from '../overlays/modals.js';
import { fileFolderForm, fileMoveForm } from '../ui/file-organization-modals.js';
import { streamSelectedFiles } from '../core/file-stream-download.js';
import { mutate, toast } from '../ui/toast.js';
import { canEditProject } from '../shared/project-access.js';
import { canEditFile } from '../shared/file-access.js';
import { saveFilePreferences, saveFileFilterPresets } from '../core/file-preferences.js';
import { getSessionGeneration } from '../core/api.js';
import { activeFileFolder, archiveFileFolder, moveFilesToFolder, moveFileFolder, restoreFileFolder, saveFileFolder } from '../shared/file-organization.js';

Object.assign(fileModalRenderers, { fileFolderForm, fileMove: fileMoveForm });

const owner = () => ({ owner: S.ui.currentUser?.id, workspace: D().ws?.id || D().ws?.url });
const modalFor = type => {
  const modal = S.ui.modals.at(-1);
  const current = owner();
  return modal?.type === type && modal.owner === current.owner && modal.workspace === current.workspace ? modal : null;
};
const change = run => {
  try {
    return mutate(run);
  } catch (error) {
    toast(error.message, { kind: 'err' });
    return false;
  }
};

A.downloadSelectedFiles = async () => {
  const initial = owner(),
    generation = getSessionGeneration(),
    ids = [...(S.ui.fileSelection || [])];
  try {
    const module = await import('../core/file-download.js');
    const current = owner();
    if (initial.owner === current.owner && initial.workspace === current.workspace && generation === getSessionGeneration())
      await module.downloadSelectedFiles(ids);
  } catch {
    toast('Unable to create the ZIP.', { kind: 'err' });
  }
};
A.streamSelectedFiles = streamSelectedFiles;
A.cancelFileZip = () => S.ui.fileDownload?.controller.abort();
A.toggleFileRecursive = () => {
  S.ui.fileRecursive = !S.ui.fileRecursive;
  render();
};
A.saveFileFilter = () => {
  const initial = owner();
  const filters = {
    project: S.ui.fileProject || 'all',
    folder: S.ui.fileFolder || null,
    query: String(S.ui.fileQ || '').slice(0, 200),
    type: S.ui.fileType || 'all',
    sort: S.ui.fileSort || 'date',
    recursive: Boolean(S.ui.fileRecursive),
  };
  openModal({
    type: 'prompt',
    title: 'Save file filters',
    label: 'Name',
    value: '',
    run: value => {
      const current = owner();
      if (current.owner !== initial.owner || current.workspace !== initial.workspace || !value.trim()) return;
      const presets = S.ui.fileFilterPresets || [];
      if (presets.length >= 12) return toast('Save up to 12 file filters. Remove an unused filter first.', { kind: 'info' });
      S.ui.fileFilterPresets = [...presets, { id: uid('fp'), name: value.trim().slice(0, 60), ...filters }];
      S.ui.fileSelectedPreset = S.ui.fileFilterPresets.at(-1).id;
      if (!saveFileFilterPresets()) toast('Device storage is unavailable. Filters will not survive reload.', { kind: 'err' });
      render();
    },
  });
};
IN.fileFilterPreset = el => {
  S.ui.fileSelectedPreset = el.value;
  const preset = S.ui.fileFilterPresets?.find(item => item.id === el.value);
  if (!preset) return render();
  const project = proj(preset.project);
  const locked = S.ui.route === 'project' ? S.ui.params.id : null;
  if (
    (locked && preset.project !== locked) ||
    (preset.project !== 'all' && !visibleProjects().some(item => item.id === preset.project)) ||
    (preset.folder && !activeFileFolder(project, preset.folder))
  ) {
    S.ui.fileSelectedPreset = '';
    toast('This saved filter is unavailable in the current project or folder.', { kind: 'info' });
    return render();
  }
  Object.assign(S.ui, {
    fileProject: preset.project,
    fileFolder: preset.folder,
    fileQ: preset.query,
    fileType: preset.type,
    fileSort: preset.sort,
    fileRecursive: preset.recursive,
    fileFolderOffset: 0,
    fileFolderQuery: '',
    fileFoldersArchived: false,
  });
  render();
};
A.removeFileFilter = () => {
  S.ui.fileFilterPresets = (S.ui.fileFilterPresets || []).filter(item => item.id !== S.ui.fileSelectedPreset);
  S.ui.fileSelectedPreset = '';
  if (!saveFileFilterPresets()) toast('Device storage is unavailable. Filters will not survive reload.', { kind: 'err' });
  render();
};

A.openFileFolder = el => {
  S.ui.fileProject = el.dataset.project || 'all';
  S.ui.fileFolder = el.dataset.folder || null;
  S.ui.fileFoldersArchived = false;
  S.ui.fileFolderOffset = 0;
  S.ui.fileFolderQuery = '';
  S.ui.fileQ = '';
  render();
  document.querySelector('.files-folder-crumbs button')?.focus({ preventScroll: true });
};
A.toggleFileFolderArchive = () => {
  S.ui.fileFoldersCollapsed = false;
  S.ui.fileFoldersArchived = !S.ui.fileFoldersArchived;
  S.ui.fileFolder = null;
  S.ui.fileFolderOffset = 0;
  S.ui.fileFolderQuery = '';
  render();
};
IN.filePageSize = el => {
  S.ui.filePageSize = [25, 50, 100].includes(Number(el.value)) ? Number(el.value) : 100;
  saveFilePreferences();
  render();
};
A.filePageJump = el => A.listPage({ dataset: { key: el.dataset.key, page: Math.max(0, Number(el.value) - 1) } });
A.fileFolderJump = el => A.fileFolderPage({ dataset: { offset: Math.max(0, Number(el.value) - 1) * Number(el.dataset.size) } });
KEY.filePageJump = A.filePageJump;
KEY.fileFolderJump = A.fileFolderJump;
KEY.saveFileFolder = () => A.saveFileFolder();
A.toggleFileFolderLayout = () => {
  S.ui.fileFolderLayout = S.ui.fileFolderLayout === 'compact' ? 'tiles' : 'compact';
  S.ui.fileFolderOffset = 0;
  saveFilePreferences();
  render();
};
A.toggleFileFolders = () => {
  S.ui.fileFoldersCollapsed = !S.ui.fileFoldersCollapsed;
  saveFilePreferences();
  render();
};
IN.fileFolderQuery = el => {
  S.ui.fileFolderQuery = el.value;
  S.ui.fileFolderOffset = 0;
  render();
};
A.fileFolderPage = el => {
  S.ui.fileFolderOffset = Math.max(0, Number(el.dataset.offset) || 0);
  render();
  const first = document.querySelector('button.files-folder-open');
  first?.focus({ preventScroll: true });
  first?.scrollIntoView({ block: 'nearest' });
};
A.focusFileResults = () => {
  const file = document.querySelector('.workspace-file-open,.workspace-file-name');
  file?.focus({ preventScroll: true });
  file?.scrollIntoView({ block: 'start' });
};
A.newFileFolder = () => {
  const project =
    proj(S.ui.fileProject) || proj(S.ui.fileUploadProject) || visibleProjects().find(project => canEditProject(project, D().me, S.ui.currentUser?.role));
  if (!canEditProject(project, D().me, S.ui.currentUser?.role)) return;
  openModal({ type: 'fileFolderForm', projectId: project.id, parentId: activeFileFolder(project, S.ui.fileFolder)?.id || null, name: '', ...owner() });
};
A.renameFileFolder = el => {
  const project = proj(el.dataset.project);
  const folder = activeFileFolder(project, el.dataset.folder);
  if (!folder || !canEditProject(project, D().me, S.ui.currentUser?.role)) return;
  openModal({ type: 'fileFolderForm', projectId: project.id, parentId: folder.parentId, id: folder.id, name: folder.name, ...owner() });
};
IN.fileFolderName = el => {
  const modal = modalFor('fileFolderForm');
  if (modal) modal.name = el.value;
};
IN.fileFolderProject = el => {
  const modal = modalFor('fileFolderForm');
  if (!modal || modal.id || modal.parentId) return;
  modal.projectId = el.value;
  render();
};
A.saveFileFolder = () => {
  const modal = modalFor('fileFolderForm');
  if (!modal) return;
  const id = modal.id || uid('ff');
  if (!change(() => saveFileFolder(D(), { projectId: modal.projectId, id, name: modal.name, parentId: modal.parentId }, S.ui.currentUser?.role))) return;
  closeModal();
  if (!modal.id) A.openFileFolder({ dataset: { project: modal.projectId, folder: id } });
};
A.archiveFileFolder = el => {
  if (change(() => archiveFileFolder(D(), el.dataset.project, el.dataset.folder, S.ui.currentUser?.role)))
    toast('Folder archived. Restore it from Archived folders.');
};
A.restoreFileFolder = el => {
  if (change(() => restoreFileFolder(D(), el.dataset.project, el.dataset.folder, S.ui.currentUser?.role))) A.openFileFolder(el);
};
A.moveFileToFolder = el => {
  S.ui.pop = null;
  const ids = el.dataset.id ? [el.dataset.id] : S.ui.fileSelection || [];
  const files = D().files.filter(file => ids.includes(file.id));
  if (!files.length || files.length !== ids.length || files.some(file => !canEditFile(file, D(), S.ui.currentUser?.role))) return render();
  if (new Set(files.map(file => file.project)).size !== 1) return toast('Choose files from one project to move them.', { kind: 'info' });
  openModal({ type: 'fileMove', projectId: files[0].project, ids, folderId: files[0].folderId || null, query: '', offset: 0, ...owner() });
};
A.moveFileFolder = el => {
  const project = proj(el.dataset.project),
    folder = activeFileFolder(project, el.dataset.folder);
  if (!folder || !canEditProject(project, D().me, S.ui.currentUser?.role)) return;
  openModal({ type: 'fileMove', projectId: project.id, folderMoveId: folder.id, ids: [], folderId: folder.parentId || null, query: '', offset: 0, ...owner() });
};
IN.fileMoveQuery = el => {
  const modal = modalFor('fileMove');
  if (!modal) return;
  modal.query = el.value;
  modal.offset = 0;
  render();
};
A.selectFileMoveTarget = el => {
  const modal = modalFor('fileMove');
  if (!modal) return;
  modal.folderId = el.dataset.folder || null;
  render();
};
A.fileMovePage = el => {
  const modal = modalFor('fileMove');
  if (!modal) return;
  modal.offset = Math.max(0, Number(el.dataset.offset) || 0);
  render();
  document.querySelector('.file-move-folders')?.scrollTo(0, 0);
};
A.confirmFileMove = () => {
  const modal = modalFor('fileMove');
  if (!modal) return;
  if (
    !change(() =>
      modal.folderMoveId
        ? moveFileFolder(D(), modal.projectId, modal.folderMoveId, modal.folderId, S.ui.currentUser?.role)
        : moveFilesToFolder(D(), modal.ids, modal.projectId, modal.folderId, S.ui.currentUser?.role),
    )
  )
    return;
  S.ui.fileSelection = (S.ui.fileSelection || []).filter(id => !modal.ids.includes(id));
  closeModal();
  toast(modal.folderMoveId ? 'Folder moved.' : 'Files moved.', {
    action: 'Open destination',
    onAction: () => {
      const current = owner();
      if (modal.owner === current.owner && modal.workspace === current.workspace)
        A.openFileFolder({ dataset: { project: modal.projectId, folder: modal.folderId || '' } });
    },
  });
};
