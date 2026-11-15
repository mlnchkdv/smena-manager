import { D, S } from '../core/store.js';
import { esc } from '../core/utils.js';
import { isRussian, uiCount } from '../core/i18n.js';
import { fileCollectionOwned, fileCollectionTarget } from '../shared/file-collection.js';

export function fileCollectionPanel() {
  const target = S.ui.fileCollectDestination;
  if (!fileCollectionOwned(D(), S.ui.currentUser, target)) return '';
  const destination = fileCollectionTarget(D(), S.ui.currentUser, target);
  const n = (S.ui.fileSelection || []).length;
  const T = (en, ru) => (isRussian() ? ru : en);
  return `<section class="files-collection alert info" aria-label="${T('Move files', 'Перенос файлов')}" translate="no"><div class="files-collection-copy"><span>${T('Destination', 'Назначение')}</span>${destination ? `<strong class="files-collection-path">${esc(destination.path)}</strong>` : `<strong role="alert">${T('This folder is unavailable. Choose another location.', 'Папка недоступна. Выберите другое место.')}</strong>`}<span role="status">${T('Selected', 'Выбрано')}: ${n}</span></div><div class="files-collection-actions"><button class="btn btn-primary btn-sm" data-a="moveCollectedFolderFiles" ${!n || !destination ? 'disabled' : ''}>${T('Move', 'Переместить')} ${uiCount(n, 'file')}</button>${!destination ? `<button class="btn btn-secondary btn-sm" data-a="changeFileCollectionDestination">${T('Choose destination', 'Выбрать назначение')}</button>` : ''}<button class="btn btn-ghost btn-sm" data-a="cancelFileCollection">${T('Cancel', 'Отмена')}</button></div></section>`;
}
