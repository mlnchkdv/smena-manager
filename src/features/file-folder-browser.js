import { A, IN } from '../actions/actions.js';
import { D, S, visibleProjects } from '../core/store.js';
import { esc } from '../core/utils.js';
import { isRussian } from '../core/i18n.js';
import { createFileIndex, normalizeFileSearch } from '../shared/file-index.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';
const T = (en, ru) => (isRussian() ? ru : en);
const current = () => {
  const m = S.ui.modals.at(-1);
  return m?.fileFolderBrowser && m.owner === S.ui.currentUser?.id && m.workspace === (D().ws?.id || D().ws?.url) ? m : null;
};
function form(m, H) {
  const projects = visibleProjects().filter(p => !p.archived && (!m.scope || p.id === m.scope)),
    index = createFileIndex({ files: [] }, projects);
  const terms = normalizeFileSearch(m.query).trim().split(/\s+/).filter(Boolean);
  const entries = projects
    .flatMap(project => [
      { project, folder: null, path: project.name },
      ...index.folderEntries
        .filter(e => e.project.id === project.id && !e.folder.archived)
        .map(e => ({ ...e, path: [project.name, ...index.folderPath(project.id, e.folder.id).map(f => f.name)].join(' / ') })),
    ])
    .filter(e => terms.every(term => normalizeFileSearch(e.path).includes(term)))
    .sort((a, b) => a.path.localeCompare(b.path));
  const offset = Math.min(Math.max(0, m.offset || 0), Math.max(0, Math.ceil(entries.length / 25) - 1) * 25),
    page = entries.slice(offset, offset + 25);
  return `${H(T('Choose a folder', 'Выбрать папку'))}<div class="modal-b file-folder-browser" translate="no"><label class="sr" for="file-folder-browse-query">${T('Search folders and projects', 'Поиск папок и проектов')}</label><input class="input" id="file-folder-browse-query" data-in="fileFolderBrowseQuery" value="${esc(m.query || '')}" placeholder="${T('Search folders and projects', 'Поиск папок и проектов')}" ${innerWidth > 640 ? 'autofocus' : ''}>
 ${!m.scope ? `<button class="btn btn-ghost" data-a="pickFileBrowserFolder" data-project="all">${T('All files', 'Все файлы')}</button>` : ''}
 <div class="file-folder-browser-rows" aria-label="${T('Folders', 'Папки')}">${page.map(e => `<button class="btn btn-ghost" data-a="pickFileBrowserFolder" data-project="${esc(e.project.id)}" data-folder="${esc(e.folder?.id || '')}" title="${esc(e.path)}"><span translate="no">${esc(e.path)}</span></button>`).join('') || `<p class="hint">${T('No matching folders.', 'Подходящих папок нет.')}</p>`}</div>
 <div class="row wrap"><span class="hint" role="status">${entries.length ? offset + 1 : 0}–${offset + page.length} / ${entries.length}</span><span class="sp"></span><button class="btn btn-secondary btn-sm" data-a="fileFolderBrowserPage" data-offset="${Math.max(0, offset - 25)}" ${!offset ? 'disabled' : ''}>${T('Previous', 'Назад')}</button><button class="btn btn-secondary btn-sm" data-a="fileFolderBrowserPage" data-offset="${offset + 25}" ${offset + 25 >= entries.length ? 'disabled' : ''}>${T('Next', 'Далее')}</button></div></div><div class="modal-f"><button class="btn btn-secondary" data-a="closeModal">${T('Close', 'Закрыть')}</button></div>`;
}
export function openFileFolderBrowser(scope) {
  openModal({
    type: 'knowledgeTool',
    fileFolderBrowser: true,
    owner: S.ui.currentUser?.id,
    workspace: D().ws?.id || D().ws?.url,
    scope,
    query: '',
    offset: 0,
    render: form,
  });
}
IN.fileFolderBrowseQuery = el => {
  const m = current();
  if (m) {
    m.query = el.value;
    m.offset = 0;
    render();
  }
};
A.fileFolderBrowserPage = el => {
  const m = current();
  if (m) {
    m.offset = Number(el.dataset.offset) || 0;
    render();
  }
};
A.pickFileBrowserFolder = el => {
  const m = current();
  if (!m) return;
  const project = visibleProjects().find(p => p.id === el.dataset.project && !p.archived && (!m.scope || p.id === m.scope));
  if (el.dataset.project !== 'all' && !project) return;
  if (el.dataset.folder && !project?.fileFolders?.some(f => f.id === el.dataset.folder && !f.archived)) return;
  closeModal();
  A.openFileFolder(el);
};
