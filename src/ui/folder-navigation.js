import { A, IN } from '../actions/actions.js';
import { S } from '../core/store.js';
import { isRussian } from '../core/i18n.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { canReturnCollection, collectionLocationAllowed, returnCollection } from '../core/collection-navigation.js';
import { render } from '../shell/render.js';
import '../styles/folder-navigation.css';
const T = (en, ru) => (isRussian() ? ru : en);
const active = kind =>
  ['files', 'knowledge', 'bookmarks'].includes(kind) && (kind === S.ui.route || (kind === 'files' && S.ui.route === 'project' && S.ui.params.tab === 'files'));
export function folderNavigation(kind, parent = null) {
  if (!parent && !canReturnCollection(kind)) return '';
  return `<span class="folder-navigation" role="group" aria-label="${T('Folder navigation', 'Навигация по папкам')}" translate="no"><button class="ibtn" data-a="collectionFolderBack" data-kind="${kind}" aria-label="${T('Back to previous view', 'Назад к предыдущему просмотру')}" title="${T('Back to previous view', 'Назад к предыдущему просмотру')}" ${canReturnCollection(kind) ? '' : 'disabled'}>${ic('arrow-left', 16)}</button>${parent ? `<button class="ibtn" data-a="collectionFolderUp" data-kind="${kind}" data-folder="${esc(parent?.folder || '')}" data-project="${esc(parent?.project || '')}" aria-label="${T('Parent folder', 'Вверх к родительской папке')}" title="${T('Parent folder', 'Вверх к родительской папке')}" ${parent ? '' : 'disabled'}>${ic('arrow-up', 16)}</button>` : ''}</span>`;
}
A.collectionFolderBack = el => {
  const kind = el.dataset.kind;
  if (active(kind)) returnCollection(kind, render);
};
A.collectionFolderUp = el => {
  const kind = el.dataset.kind;
  if (!active(kind)) return;
  const values =
    kind === 'files'
      ? { fileProject: el.dataset.project, fileFolder: el.dataset.folder }
      : { [kind === 'knowledge' ? 'knowledgeFolder' : 'bookmarkFolder']: el.dataset.folder };
  if (!collectionLocationAllowed(kind, { values })) return;
  if (kind === 'files') A.openFileFolder(el);
  if (kind === 'knowledge') A.setKnowledgeFolder(el);
  if (kind === 'bookmarks') IN.bookmarkFolder({ value: el.dataset.folder });
};
