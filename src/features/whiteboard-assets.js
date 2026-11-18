import { A, IN } from '../actions/actions.js';
import { D, S } from '../core/store.js';
import { currentWhiteboard, whiteboardState, whiteboardScope, whiteboardMaterial, wbText as T } from '../core/whiteboard-state.js';
import { canEditWhiteboard } from '../shared/whiteboards.js';
import { canEditProject } from '../shared/project-access.js';
import { filePreviewPolicy } from '../shared/file-preview-policy.js';
import { normalizedPageUrl } from '../shared/bookmark-metadata.js';
import { bookmarkUrlKey } from '../shared/web-capture.js';
import { getFileUploadPolicy } from '../core/api.js';
import { insertWhiteboardMaterials, openWhiteboardTextDraft, pasteWhiteboardContent } from './project-whiteboard.js';
import { whiteboardOf } from '../shared/project-whiteboard.js';
import { whiteboardInsertionPoint } from '../shared/whiteboard-insertion.js';
import { whiteboardPastedContent } from '../shared/whiteboard-content.js';
import { workspaceSyncState } from '../core/workspace-sync.js';
import { overlayAboveDiagram } from '../ui/diagram-focus.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';
import { esc, uid } from '../core/utils.js';
import { toast } from '../ui/toast.js';
const editable = board =>
  board &&
  !board.archived &&
  !whiteboardState().presentationId &&
  !workspaceSyncState().hasConflict &&
  canEditWhiteboard(D(), board, D().me, S.ui.currentUser?.role);
const fresh = (id, scope) => currentWhiteboard()?.id === id && whiteboardScope(id) === scope;
async function uploadMedia(picked, point) {
  const board = currentWhiteboard();
  if (!editable(board) || whiteboardState().uploadingMedia) return;
  const files = picked
    .filter(
      file =>
        file.size > 0 && ['image', 'pdf'].includes(filePreviewPolicy({ name: file.name, mimeType: file.type, bytes: file.size, storageName: 'pending' }).kind),
    )
    .slice(0, 12);
  if (files.length !== picked.length)
    toast(T('Choose up to 12 images or PDF files, up to 20 MiB each.', 'Выберите до 12 изображений или PDF, до 20 МиБ каждый.'), { kind: 'info' });
  if (!files.length) return;
  if (whiteboardOf(board).nodes.length + files.length > 200)
    return toast(
      T(
        'Not enough room: a board supports 200 cards. Remove cards or choose fewer files.',
        'Недостаточно места: на холсте до 200 карточек. Уберите карточки или выберите меньше файлов.',
      ),
      { kind: 'info' },
    );
  const project = board.project || D().projects.find(project => !project.archived && canEditProject(project, D().me, S.ui.currentUser?.role))?.id;
  if (!project)
    return toast(T('Create an editable project to store uploaded files.', 'Для загрузки файлов нужен проект с правом редактирования.'), { kind: 'info' });
  const scope = whiteboardScope(board.id),
    state = whiteboardState();
  state.uploadingMedia = true;
  render();
  try {
    S.ui.filePolicy = await getFileUploadPolicy();
    if (!fresh(board.id, scope) || !editable(currentWhiteboard())) return;
    const { enqueueFiles } = await import('../core/file-upload-queue.js');
    if (!fresh(board.id, scope) || !editable(currentWhiteboard())) return;
    const uploaded = await enqueueFiles(files, { project });
    if (!fresh(board.id, scope) || !editable(currentWhiteboard())) return;
    const nodes = insertWhiteboardMaterials(
      uploaded.map(file => 'file:' + file.id),
      undefined,
      point,
    );
    if (uploaded.length && !nodes.length)
      toast(T('Files were uploaded. Add them later from Linked material.', 'Файлы загружены. Добавьте их позже через «Связанный материал».'), { kind: 'info' });
  } catch (error) {
    if (fresh(board.id, scope)) toast(error.message || T('Upload failed.', 'Не удалось загрузить файлы.'), { kind: 'err' });
  } finally {
    state.uploadingMedia = false;
    if (fresh(board.id, scope)) render();
  }
}
A.whiteboardUploadMedia = () => {
  const board = currentWhiteboard();
  if (!editable(board) || whiteboardState().uploadingMedia) return;
  const scope = whiteboardScope(board.id),
    input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = 'image/png,image/jpeg,image/gif,image/webp,image/avif,application/pdf';
  input.addEventListener(
    'change',
    () => {
      if (!fresh(board.id, scope) || !editable(currentWhiteboard())) return;
      void uploadMedia(Array.from(input.files || []));
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
function openWebsiteDraft(url = '', point) {
  const board = currentWhiteboard();
  if (!editable(board)) return;
  openModal({
    type: 'whiteboardTool',
    whiteboardWebsite: true,
    boardId: board.id,
    scope: whiteboardScope(board.id),
    url,
    point,
    title: '',
    render: (m, H) =>
      `${H(T('Add website', 'Добавить сайт'))}<div class="modal-b" translate="no"><label class="field">${T('Website address', 'Адрес сайта')}<input class="input" type="url" maxlength="2000" autofocus placeholder="https://example.com" data-in="whiteboardWebsiteField" data-field="url" value="${esc(m.url)}"></label><label class="field">${T('Title (optional)', 'Название (необязательно)')}<input class="input" maxlength="120" data-in="whiteboardWebsiteField" data-field="title" value="${esc(m.title)}"></label><p class="hint">${T('The link is also saved in workspace Bookmarks. Open its saved page on the canvas or visit the original website.', 'Ссылка также сохранится в Закладках рабочего пространства. Сохранённую страницу можно просмотреть поверх холста или открыть сайт в новой вкладке.')}</p>${m.error ? `<p class="err" role="alert">${esc(m.error)}</p>` : ''}</div><div class="modal-f"><button class="btn btn-secondary" data-a="closeModal">${T('Cancel', 'Отмена')}</button><button class="btn btn-primary" data-a="whiteboardSaveWebsite">${T('Add to canvas', 'Добавить на холст')}</button></div>`,
  });
}
A.whiteboardAddWebsite = el => openWebsiteDraft(el?.dataset?.url || '');
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
  if (insertWhiteboardMaterials(['bookmark:' + link.id], existing ? undefined : () => D().links.unshift(link), m.point).length) closeModal();
};
A.whiteboardOpenWebsite = async el => {
  const node = currentWhiteboard()?.whiteboard.nodes.find(node => node.id === el.dataset.id),
    source = node && whiteboardMaterial(node);
  if (source?.kind !== 'bookmark') return;
  const scope = whiteboardScope(currentWhiteboard().id);
  await import('./bookmark-pages.js');
  if (scope === whiteboardScope(currentWhiteboard()?.id)) await A.viewBookmarkPage({ dataset: { id: source.id } });
};

const mounted = new WeakSet();
const typing = target => target.closest('input,textarea,select,[contenteditable]');
document.addEventListener('paste', event => {
  if (event.defaultPrevented || overlayAboveDiagram() || typing(event.target) || !event.target.closest('.project-whiteboard') || !editable(currentWhiteboard()))
    return;
  const data = event.clipboardData;
  if (!data) return;
  event.preventDefault();
  const files = Array.from(data.files);
  if (files.length) void uploadMedia(files);
  else void pasteWhiteboardContent(data.getData('text/plain'));
});

export function mountWhiteboardAssetInputs() {
  const surface = document.querySelector('.whiteboard-viewport,.whiteboard-outline');
  if (!surface) return;
  surface.dataset.dropLabel = T('Drop images, PDF files, a link or text here', 'Отпустите изображения, PDF, ссылку или текст здесь');
  if (mounted.has(surface)) return;
  mounted.add(surface);
  const clear = () => surface.removeAttribute('data-drop-active');
  const accepts = event => Array.from(event.dataTransfer?.types || []).some(type => ['Files', 'text/uri-list', 'text/plain'].includes(type));
  const allowed = () => editable(currentWhiteboard()) && !overlayAboveDiagram() && !whiteboardState().uploadingMedia;
  surface.addEventListener('dragover', event => {
    if (!accepts(event) || typing(event.target)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = allowed() ? 'copy' : 'none';
    if (allowed()) surface.setAttribute('data-drop-active', 'true');
    else clear();
  });
  surface.addEventListener('dragleave', event => {
    if (!(event.relatedTarget instanceof Node) || !surface.contains(event.relatedTarget)) clear();
  });
  surface.addEventListener('dragend', clear);
  surface.addEventListener('drop', event => {
    clear();
    if (!accepts(event) || typing(event.target)) return;
    event.preventDefault();
    if (!allowed()) return;
    const point = surface.matches('.whiteboard-viewport')
      ? whiteboardInsertionPoint({ x: event.clientX, y: event.clientY }, surface.getBoundingClientRect(), whiteboardState())
      : undefined;
    const files = Array.from(event.dataTransfer.files);
    if (files.length) return void uploadMedia(files, point);
    const uri = event.dataTransfer
      .getData('text/uri-list')
      .split(/\r?\n/)
      .find(line => line && !line.startsWith('#'));
    const content = whiteboardPastedContent(uri || event.dataTransfer.getData('text/plain'));
    if (content?.kind === 'website') openWebsiteDraft(content.url, point);
    else if (content?.kind === 'text') openWhiteboardTextDraft(content.text, point);
  });
}
