import { A, IN, KEY } from '../actions/actions.js';
import { D, S, proj, visibleProjects } from '../core/store.js';
import { uid } from '../core/utils.js';
import { render } from '../shell/render.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { mutate, toast } from '../ui/toast.js';
import { canEditProject } from '../shared/project-access.js';
import { canEditFile } from '../shared/file-access.js';
import { saveFilePreferences } from '../core/file-preferences.js';
import { activeFileFolder, archiveFileFolder, moveFilesToFolder, restoreFileFolder, saveFileFolder } from '../shared/file-organization.js';

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
  if (!change(() => moveFilesToFolder(D(), modal.ids, modal.projectId, modal.folderId, S.ui.currentUser?.role))) return;
  S.ui.fileSelection = (S.ui.fileSelection || []).filter(id => !modal.ids.includes(id));
  closeModal();
  toast('Files moved.', {
    action: 'Open destination',
    onAction: () => {
      const current = owner();
      if (modal.owner === current.owner && modal.workspace === current.workspace)
        A.openFileFolder({ dataset: { project: modal.projectId, folder: modal.folderId || '' } });
    },
  });
};
