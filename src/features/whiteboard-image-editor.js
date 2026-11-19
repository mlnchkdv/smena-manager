import { A } from '../actions/actions.js';
import { S } from '../core/store.js';
import { ensureFilePreview } from '../core/file-preview.js';
import { currentWhiteboard, whiteboardMaterial, whiteboardScope, wbText as T } from '../core/whiteboard-state.js';
import { canEditCurrentWhiteboard, whiteboardCommand } from './project-whiteboard.js';
import { filePreviewPolicy } from '../shared/file-preview-policy.js';
import { whiteboardOf, WHITEBOARD_IMAGE_VERSION } from '../shared/project-whiteboard.js';
import {
  adjustWhiteboardImageCrop,
  ORIGINAL_WHITEBOARD_IMAGE,
  IMAGE_CROP_SCALE,
  rotateWhiteboardImage,
  sameWhiteboardImage,
} from '../shared/whiteboard-image.js';
import { closeModal, openModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';
import { ic } from '../core/icons.js';
import { esc } from '../core/utils.js';
import { rotatedImageSize, whiteboardImageMarkup } from '../ui/whiteboard-image.js';

const editOf = node => node.media?.image || ORIGINAL_WHITEBOARD_IMAGE;
const fileIdentity = file => JSON.stringify([file.id, file.storageFileId, file.storageName, file.bytes, file.mimeType]);
const changed = modal => !sameWhiteboardImage(modal.base, modal.draft);
const stageSelector = '.whiteboard-crop-stage';

function imageCard(id) {
  const node = whiteboardOf(currentWhiteboard()).nodes.find(node => node.id === id && node.type === 'material');
  const source = node && whiteboardMaterial(node);
  if (source?.kind === 'file' && filePreviewPolicy(source.item).kind === 'image') return { node, file: source.item };
  return null;
}

function active() {
  const modal = S.ui.modals.at(-1);
  return modal?.whiteboardImageEditor && modal.scope === whiteboardScope(currentWhiteboard()?.id) ? modal : null;
}

const original = draft => sameWhiteboardImage(draft, ORIGINAL_WHITEBOARD_IMAGE);
const cropStyle = crop =>
  Object.entries(crop)
    .map(([key, value]) => `--crop-${key}:${(value * 100) / IMAGE_CROP_SCALE}%`)
    .join(';');

function editorPreview(modal) {
  const { url, size } = modal.preview;
  const { turns } = modal.draft;
  const { width, height } = rotatedImageSize(size, turns);
  return {
    ratio: width / height,
    angle: (turns === 3 ? -90 : turns * 90) + '°',
    markup: whiteboardImageMarkup(url, modal.file.name, size, { ...ORIGINAL_WHITEBOARD_IMAGE, turns }, 'whiteboard-crop-image'),
  };
}

function renderEditor(modal, heading) {
  const isCurrent = modal.scope === whiteboardScope(currentWhiteboard()?.id);
  if (isCurrent) ensureFilePreview(modal, render, { measureImage: true });
  const preview = modal.preview;
  const ready = isCurrent && preview?.kind === 'image' && preview.size;
  let content;
  if (ready) {
    const { ratio, angle, markup } = editorPreview(modal);
    const handles = [
      ['nw', T('Top left crop handle', 'Верхний левый угол обрезки')],
      ['ne', T('Top right crop handle', 'Верхний правый угол обрезки')],
      ['sw', T('Bottom left crop handle', 'Нижний левый угол обрезки')],
      ['se', T('Bottom right crop handle', 'Нижний правый угол обрезки')],
    ];
    const rotateButton = (direction, icon, label) =>
      `<button type="button" class="ibtn" data-a="whiteboardRotateImage" data-direction="${direction}" aria-label="${label}" title="${label}">${ic(icon, 18)}</button>`;
    content = `<div class="whiteboard-image-tools"><div role="group" aria-label="${T('Rotate image', 'Поворот изображения')}">${rotateButton(-1, 'rotate-ccw', T('Rotate left 90°', 'Повернуть на 90° влево'))}<span class="num" data-crop-angle role="status">${angle}</span>${rotateButton(1, 'rotate-cw', T('Rotate right 90°', 'Повернуть на 90° вправо'))}</div><button type="button" class="btn btn-ghost" data-a="whiteboardResetImageDraft" ${original(modal.draft) ? 'disabled' : ''}>${T('Restore original', 'Вернуть оригинал')}</button></div>
      <div class="whiteboard-crop-surface"><div class="whiteboard-crop-stage" style="--image-ratio:${ratio};${cropStyle(modal.draft.crop)}">
      ${markup}
      <div class="whiteboard-crop-selection"><button type="button" class="whiteboard-crop-area" data-image-handle="move" aria-label="${T('Move crop area', 'Переместить область обрезки')}" aria-describedby="whiteboard-crop-keys"></button>${handles.map(([corner, label]) => `<button type="button" class="whiteboard-crop-handle" data-image-handle="${corner}" aria-label="${label}" aria-describedby="whiteboard-crop-keys"></button>`).join('')}</div></div></div>
      <p class="hint">${T('Drag a corner to crop or drag inside the frame to move it.', 'Потяните за угол, чтобы обрезать изображение. Перетащите рамку за её середину, чтобы переместить.')}</p><span class="sr" id="whiteboard-crop-keys">${T('Use the arrow keys to adjust the frame. Hold Shift for larger steps.', 'Двигайте рамку клавишами со стрелками. Удерживайте Shift для более крупного шага.')}</span>`;
  } else if (isCurrent && preview?.kind === 'loading') content = `<p class="hint" role="status">${T('Loading image…', 'Загружаем изображение…')}</p>`;
  else
    content = `<p class="err" role="alert">${T('Unable to open the image. Check access and reopen the editor.', 'Не удалось открыть изображение. Проверьте доступ и откройте редактор снова.')}</p>`;
  return `${heading(T('Crop and rotate', 'Обрезать и повернуть'))}<div class="modal-b whiteboard-image-editor" data-keep="whiteboard-image-editor" translate="no"><p class="trunc" title="${esc(modal.file.name)}">${esc(modal.file.name)}</p>${content}${modal.error ? `<p class="err" role="alert">${esc(modal.error)}</p>` : ''}</div><div class="modal-f" translate="no"><button type="button" class="btn btn-secondary" data-a="closeModal">${T('Cancel', 'Отмена')}</button><button type="button" class="btn btn-primary" data-a="whiteboardSaveImage" ${ready && changed(modal) ? '' : 'disabled'}>${T('Apply', 'Применить')}</button></div>`;
}

function saveEdit(id, draft) {
  return whiteboardCommand(board => {
    const node = board.nodes.find(node => node.id === id);
    if (original(draft)) delete node.media;
    else {
      board.version = Math.max(board.version, WHITEBOARD_IMAGE_VERSION);
      node.media = { image: draft };
    }
  });
}

A.whiteboardEditImage = el => {
  const source = imageCard(el.dataset.id);
  if (!source || !canEditCurrentWhiteboard()) return;
  const base = editOf(source.node);
  openModal({
    type: 'whiteboardTool',
    whiteboardImageEditor: true,
    scope: whiteboardScope(currentWhiteboard().id),
    nodeId: source.node.id,
    file: source.file,
    fileKey: fileIdentity(source.file),
    base,
    draft: base,
    render: renderEditor,
  });
};
function updateDraft(button, adjust) {
  const modal = active();
  const dialog = button.closest('.modal');
  const stage = dialog?.querySelector(stageSelector);
  if (!modal?.preview?.size || !stage) return;
  modal.drag = null;
  modal.draft = adjust(modal.draft);
  const { ratio, angle, markup } = editorPreview(modal);
  stage.style.setProperty('--image-ratio', ratio);
  stage.querySelector('.whiteboard-crop-image').outerHTML = markup;
  dialog.querySelector('[data-crop-angle]').textContent = angle;
  updateCrop(modal, stage, modal.draft.crop);
}
A.whiteboardRotateImage = el => updateDraft(el, draft => rotateWhiteboardImage(draft, el.dataset.direction === '-1' ? -1 : 1));
A.whiteboardResetImageDraft = el => updateDraft(el, () => ORIGINAL_WHITEBOARD_IMAGE);
A.whiteboardSaveImage = () => {
  const modal = active();
  if (!modal?.preview?.size || !changed(modal) || !canEditCurrentWhiteboard()) return;
  const source = imageCard(modal.nodeId);
  if (!source || fileIdentity(source.file) !== modal.fileKey || !sameWhiteboardImage(editOf(source.node), modal.base)) {
    modal.error = T(
      'The image or crop changed. Reopen the editor to see the latest version.',
      'Изображение или обрезка изменились. Откройте редактор снова, чтобы увидеть актуальную версию.',
    );
    render();
    return;
  }
  if (saveEdit(modal.nodeId, modal.draft)) closeModal();
};
A.whiteboardRestoreImage = el => {
  const source = imageCard(el.dataset.id);
  if (source?.node.media?.image && canEditCurrentWhiteboard()) saveEdit(source.node.id, ORIGINAL_WHITEBOARD_IMAGE);
};

function updateCrop(modal, stage, crop) {
  modal.draft = { ...modal.draft, crop };
  for (const [key, value] of Object.entries(crop)) stage.style.setProperty('--crop-' + key, (value * 100) / IMAGE_CROP_SCALE + '%');
  const dialog = stage.closest('.modal');
  dialog.querySelector('[data-a="whiteboardSaveImage"]').disabled = !changed(modal);
  dialog.querySelector('[data-a="whiteboardResetImageDraft"]').disabled = original(modal.draft);
}

document.addEventListener('pointerdown', event => {
  const handle = event.target.closest('[data-image-handle]');
  const stage = handle?.closest(stageSelector);
  const modal = stage && active();
  if (!modal || event.button !== 0 || modal.drag?.stage.isConnected) return;
  const { width, height } = stage.getBoundingClientRect();
  if (!width || !height) return;
  event.preventDefault();
  handle.focus({ preventScroll: true });
  stage.setPointerCapture(event.pointerId);
  modal.drag = {
    stage,
    pointer: event.pointerId,
    handle: handle.dataset.imageHandle,
    crop: modal.draft.crop,
    x: event.clientX,
    y: event.clientY,
    width,
    height,
  };
});

document.addEventListener('pointermove', event => {
  const modal = active();
  const drag = modal?.drag;
  if (drag?.pointer !== event.pointerId || !drag.stage.isConnected) return;
  const dx = ((event.clientX - drag.x) * IMAGE_CROP_SCALE) / drag.width;
  const dy = ((event.clientY - drag.y) * IMAGE_CROP_SCALE) / drag.height;
  updateCrop(modal, drag.stage, adjustWhiteboardImageCrop(drag.crop, drag.handle, dx, dy));
});

for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture'])
  document.addEventListener(eventName, event => {
    const modal = active();
    if (modal?.drag?.pointer === event.pointerId) modal.drag = null;
  });

const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
document.addEventListener('keydown', event => {
  const arrow = arrows[event.key];
  const stage = event.target.closest?.(stageSelector);
  const modal = stage && active();
  const handle = event.target.dataset?.imageHandle;
  if (!arrow || !modal || !handle || event.ctrlKey || event.metaKey || event.altKey) return;
  event.preventDefault();
  const step = event.shiftKey ? 500 : 100;
  updateCrop(modal, stage, adjustWhiteboardImageCrop(modal.draft.crop, handle, arrow[0] * step, arrow[1] * step));
});
