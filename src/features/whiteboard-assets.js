import { A, IN } from '../actions/actions.js';
import { D, S } from '../core/store.js';
import { currentWhiteboard, whiteboardState, whiteboardScope, whiteboardMaterial, wbText as T } from '../core/whiteboard-state.js';
import { canEditWhiteboard } from '../shared/whiteboards.js';
import { canEditProject } from '../shared/project-access.js';
import { filePreviewPolicy } from '../shared/file-preview-policy.js';
import { normalizedPageUrl } from '../shared/bookmark-metadata.js';
import { bookmarkUrlKey } from '../shared/web-capture.js';
import { getFileUploadPolicy } from '../core/api.js';
import { insertWhiteboardMaterials } from './project-whiteboard.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';
import { esc, uid } from '../core/utils.js';
import { toast } from '../ui/toast.js';
const editable = board => board && !board.archived && canEditWhiteboard(D(), board, D().me, S.ui.currentUser?.role);
const fresh = (id, scope) => currentWhiteboard()?.id === id && whiteboardScope(id) === scope;
A.whiteboardUploadMedia = () => {
  const board = currentWhiteboard();
  if (!editable(board) || whiteboardState().uploadingMedia) return;
  const project = board.project || D().projects.find(project => !project.archived && canEditProject(project, D().me, S.ui.currentUser?.role))?.id;
  if (!project)
    return toast(T('Create an editable project to store uploaded files.', 'Для загрузки файлов нужен проект с правом редактирования.'), { kind: 'info' });
  const scope = whiteboardScope(board.id),
    input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = 'image/png,image/jpeg,image/gif,image/webp,image/avif,application/pdf';
  input.addEventListener(
    'change',
    async () => {
      if (!fresh(board.id, scope) || !editable(currentWhiteboard())) return;
      const picked = Array.from(input.files || []),
        files = picked
          .filter(file => ['image', 'pdf'].includes(filePreviewPolicy({ name: file.name, mimeType: file.type, bytes: file.size, storageName: 'pending' }).kind))
          .slice(0, 12);
      if (files.length !== picked.length)
        toast(T('Choose up to 12 images or PDF files, up to 20 MiB each.', 'Выберите до 12 изображений или PDF, до 20 МиБ каждый.'), { kind: 'info' });
      if (!files.length) return;
      const state = whiteboardState();
      state.uploadingMedia = true;
      render();
      try {
        S.ui.filePolicy = await getFileUploadPolicy();
        if (!fresh(board.id, scope) || !editable(currentWhiteboard())) return;
        const { enqueueFiles } = await import('../core/file-upload-queue.js');
        const uploaded = await enqueueFiles(files, { project });
        if (!fresh(board.id, scope) || !editable(currentWhiteboard())) return;
        const nodes = insertWhiteboardMaterials(uploaded.map(file => 'file:' + file.id));
        if (uploaded.length && !nodes.length)
          toast(T('Files were uploaded. Add them later from Linked material.', 'Файлы загружены. Добавьте их позже через «Связанный материал».'), {
            kind: 'info',
          });
      } catch (error) {
        if (fresh(board.id, scope)) toast(error.message || T('Upload failed.', 'Не удалось загрузить файлы.'), { kind: 'err' });
      } finally {
        state.uploadingMedia = false;
        if (fresh(board.id, scope)) render();
      }
    },
    { once: true },
  );
  input.click();
};
A.whiteboardUploadProgress = async () => {
  const { openUploadQueue } = await import('../core/file-upload-queue.js');
  openUploadQueue();
};
const modal = () => {
  const m = S.ui.modals.at(-1);
  return m?.whiteboardWebsite && fresh(m.boardId, m.scope) ? m : null;
};
A.whiteboardAddWebsite = () => {
  const board = currentWhiteboard();
  if (!editable(board)) return;
  openModal({
    type: 'whiteboardTool',
    whiteboardWebsite: true,
    boardId: board.id,
    scope: whiteboardScope(board.id),
    url: '',
    title: '',
    render: (m, H) =>
      `${H(T('Add website', 'Добавить сайт'))}<div class="modal-b" translate="no"><label class="field">${T('Website address', 'Адрес сайта')}<input class="input" type="url" maxlength="2000" autofocus placeholder="https://example.com" data-in="whiteboardWebsiteField" data-field="url" value="${esc(m.url)}"></label><label class="field">${T('Title (optional)', 'Название (необязательно)')}<input class="input" maxlength="120" data-in="whiteboardWebsiteField" data-field="title" value="${esc(m.title)}"></label><p class="hint">${T('The link is also saved in workspace Bookmarks. Open its saved page on the canvas or visit the original website.', 'Ссылка также сохранится в Закладках рабочего пространства. Сохранённую страницу можно просмотреть поверх холста или открыть сайт в новой вкладке.')}</p>${m.error ? `<p class="err" role="alert">${esc(m.error)}</p>` : ''}</div><div class="modal-f"><button class="btn btn-secondary" data-a="closeModal">${T('Cancel', 'Отмена')}</button><button class="btn btn-primary" data-a="whiteboardSaveWebsite">${T('Add to canvas', 'Добавить на холст')}</button></div>`,
  });
};
IN.whiteboardWebsiteField = el => {
  const m = modal();
  if (m && ['url', 'title'].includes(el.dataset.field)) m[el.dataset.field] = el.value;
};
A.whiteboardSaveWebsite = () => {
  const m = modal();
  if (!m || !editable(currentWhiteboard())) return;
  const url = normalizedPageUrl(m.url);
  if (!url) {
    m.error = T('Enter a valid HTTP or HTTPS website address without credentials.', 'Укажите корректный адрес HTTP или HTTPS без логина и пароля.');
    render();
    return;
  }
  const existing = D().links.find(link => bookmarkUrlKey(link.url) === bookmarkUrlKey(url));
  const now = new Date().toISOString(),
    host = new URL(url).hostname;
  const link = existing || {
    id: uid('ln'),
    url,
    title: m.title.trim() || host,
    description: '',
    excerpt: '',
    readingStatus: 'unread',
    site_name: host,
    preview_image: '',
    favicon_url: '',
    folder: '',
    importance: 'medium',
    tags: [],
    updated_at: now,
    created_at: now,
    is_archived: false,
    is_read: false,
    health_status: 'unknown',
  };
  if (insertWhiteboardMaterials(['bookmark:' + link.id], existing ? undefined : () => D().links.unshift(link)).length) closeModal();
};
A.whiteboardOpenWebsite = async el => {
  const node = currentWhiteboard()?.whiteboard.nodes.find(node => node.id === el.dataset.id),
    source = node && whiteboardMaterial(node);
  if (source?.kind !== 'bookmark') return;
  const scope = whiteboardScope(currentWhiteboard().id);
  await import('./bookmark-pages.js');
  if (scope === whiteboardScope(currentWhiteboard()?.id)) await A.viewBookmarkPage({ dataset: { id: source.id } });
};
