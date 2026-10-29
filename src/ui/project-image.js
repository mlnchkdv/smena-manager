import { A, IN } from '../actions/actions.js';
import { S } from '../core/store.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { isRussian } from '../core/i18n.js';
import { render } from '../shell/render.js';
import { projectImageData, PROJECT_IMAGE_LIMIT } from '../shared/project-appearance.js';

const copy = (en, ru) => (isRussian() ? ru : en);
const focusUpload = () => document.querySelector('[data-a="chooseProjectImage"]')?.focus({ preventScroll: true });
const errors = {
  format: ['Choose a PNG, JPG or WebP image.', 'Выберите изображение PNG, JPG или WebP.'],
  size: ['Image must be 5 MB or smaller.', 'Размер изображения должен быть не больше 5 МБ.'],
  decode: ['This image could not be read. Choose another file.', 'Не удалось прочитать изображение. Выберите другой файл.'],
  pixels: ['Use an image up to 40 megapixels.', 'Выберите изображение размером до 40 мегапикселей.'],
  encode: ['Could not prepare this image. Choose another file.', 'Не удалось подготовить изображение. Выберите другой файл.'],
};

export function projectImageControls(form) {
  const image = projectImageData(form.iconImage);
  return `<div class="project-image-controls"><div class="row"><button type="button" class="btn btn-secondary btn-sm" data-a="chooseProjectImage" ${form.imagePending ? 'disabled' : ''}>${ic('image', 14)}<span>${image ? copy('Replace image', 'Заменить картинку') : copy('Upload image', 'Загрузить картинку')}</span></button><input id="project-icon-file" type="file" accept="image/png,image/jpeg,image/webp" data-in="projectImageFile" ${form.imagePending ? 'disabled' : ''} hidden>${image ? `<button type="button" class="btn btn-ghost btn-sm" data-a="removeProjectImage" ${form.imagePending ? 'disabled' : ''}>${ic('x', 14)}<span>${copy('Remove image', 'Убрать картинку')}</span></button>` : ''}</div><span class="hint">${copy('PNG, JPG or WebP · up to 5 MB. Saved as a small project logo.', 'PNG, JPG или WebP · до 5 МБ. Сохраняется уменьшенный логотип проекта.')}</span>${form.imagePending ? `<span class="hint" role="status">${copy('Preparing image…', 'Подготовка картинки…')}</span>` : ''}${form.imageError ? `<span class="err" role="alert">${esc(copy(...(errors[form.imageError] || errors.decode)))}</span>` : ''}</div>`;
}

IN.projectImageFile = async el => {
  const file = el.files?.[0];
  const form = S.ui.pform;
  const current = () => S.ui.pform === form && S.ui.modals.at(-1)?.type === 'project';
  if (!file || !current() || form.imagePending) return;
  form.imageError = '';
  const supported = ['image/png', 'image/jpeg', 'image/webp'].includes(file.type.toLowerCase()) || (!file.type && /\.(png|jpe?g|webp)$/i.test(file.name));
  if (!supported || file.size > 5 * 1024 * 1024) {
    form.imageError = supported ? 'size' : 'format';
    render();
    focusUpload();
    return;
  }
  form.imagePending = true;
  render();
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!current()) return;
    if (image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error('pixels');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const scale = 128 / Math.max(image.naturalWidth, image.naturalHeight);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d').drawImage(image, (128 - width) / 2, (128 - height) / 2, width, height);
    let data = canvas.toDataURL('image/webp', 0.86);
    if (data.length > PROJECT_IMAGE_LIMIT) data = canvas.toDataURL('image/webp', 0.55);
    if (!projectImageData(data)) throw new Error('encode');
    form.iconImage = data;
  } catch (error) {
    if (current()) form.imageError = Object.hasOwn(errors, error.message) ? error.message : 'decode';
  } finally {
    URL.revokeObjectURL(url);
    form.imagePending = false;
    if (current()) {
      render();
      if (document.activeElement === document.body) focusUpload();
    }
  }
};
A.removeProjectImage = () => {
  if (!S.ui.pform || S.ui.pform.imagePending) return;
  S.ui.pform.iconImage = null;
  S.ui.pform.imageError = '';
  render();
  focusUpload();
};

A.chooseProjectImage = () => document.getElementById('project-icon-file')?.click();
