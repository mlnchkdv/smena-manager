import { A } from '../actions/actions.js';
import { D, S } from '../core/store.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { kc, typeName } from './knowledge-types.js';
import { noteTypes } from '../shared/knowledge-types.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { disclosureAttributes } from './disclosure.js';
import { saveKnowledgePreferences } from '../core/knowledge-preferences.js';
import { render } from '../shell/render.js';

export function knowledgeSavedSearchShortcuts() {
  const views = (S.ui.knowledgeSavedViews || []).filter(view => view.pinned);
  if (!views.length) return '';
  return `<nav class="knowledge-pinned-searches" aria-label="${kc('Pinned searches on this device', 'Закреплённые поиски на этом устройстве')}"><h3 class="hint" translate="no">${kc('Pinned searches · this device', 'Закреплённые поиски · это устройство')}</h3>${views.map(view => `<button class="knowledge-folder" data-a="openSavedKnowledgeSearch" data-id="${esc(view.id)}" title="${esc(view.name)}">${ic('bookmark', 14)}<span class="trunc" translate="no">${esc(view.name)}</span></button>`).join('')}</nav>`;
}
A.pinKnowledgeSearch = el => {
  const view = S.ui.knowledgeSavedViews?.find(view => view.id === el.dataset.id);
  if (!view) return;
  view.pinned = !view.pinned;
  saveKnowledgePreferences();
  render();
};
export function knowledgeCreateMenu() {
  return `<div class="knowledge-create" translate="no"><button class="btn btn-primary btn-sm" data-a="newKnowledgeNote" aria-label="${kc('New note', 'Новая заметка')}" title="${kc('New note', 'Новая заметка')}">${ic('plus', 14)}<span class="knowledge-create-label">${kc('New note', 'Новая заметка')}</span></button><details class="ui-menu knowledge-create-options" ${disclosureAttributes('knowledge-create')}><summary class="btn btn-primary btn-sm" aria-label="${kc('Create by type or template', 'Создать по типу или шаблону')}" title="${kc('Create by type or template', 'Создать по типу или шаблону')}">${ic('chevron-down', 14)}</summary><div>${noteTypes(
    D().ws,
  )
    .map(type => `<button data-a="newKnowledgeNote" data-type-id="${esc(type.id)}">${ic('file-plus', 14)}<span>${esc(typeName(type))}</span></button>`)
    .join(
      '',
    )}<hr><button data-a="noteTemplates">${ic('copy', 14)}<span>${kc('From template…', 'Из шаблона…')}</span></button>${S.ui.currentUser?.role === 'admin' ? `<button data-a="manageNoteTypes">${ic('shapes', 14)}<span>${kc('Manage types', 'Настроить типы')}</span></button>` : ''}</div></details></div>`;
}
A.newKnowledgeNoteFromTools = el => {
  closeModal();
  A.newKnowledgeNote(el);
};
const commands = () => [
  ...(S.ui.currentUser?.role === 'viewer' ? [] : [['chooseKnowledgeFiles', 'file-up', 'Import notes', 'Импорт заметок']]),
  ['saveKnowledgeView', 'bookmark-plus', 'Save search', 'Сохранить поиск'],
  ['knowledgeArchive', 'archive', 'ZIP import / export', 'Импорт / экспорт ZIP'],
  ['offlineKnowledge', 'hard-drive', 'Offline library', 'Офлайн-библиотека'],
  ...(S.ui.currentUser?.role === 'viewer'
    ? []
    : [
        ['noteTemplates', 'copy', 'Templates', 'Шаблоны'],
        ['manageKnowledgeTags', 'tags', 'Manage tags', 'Управление тегами'],
      ]),
  ...(S.ui.currentUser?.role === 'admin'
    ? [
        ['manageNoteTypes', 'shapes', 'Manage types', 'Настроить типы'],
        ['knowledgeStorageMigration', 'database', 'Knowledge storage', 'Хранение базы знаний'],
      ]
    : []),
];
A.knowledgeLibraryTools = () =>
  openModal({
    type: 'knowledgeTool',
    render: (_m, H) =>
      `${H(kc('Library tools', 'Инструменты базы знаний'))}<div class="modal-b knowledge-library-tools" translate="no">${
        S.ui.currentUser?.role === 'viewer'
          ? ''
          : `<details><summary>${kc('Create by type', 'Создать по типу')}</summary>${noteTypes(D().ws)
              .map(
                type =>
                  `<button class="btn btn-ghost" data-a="newKnowledgeNoteFromTools" data-type-id="${esc(type.id)}">${ic('file-plus', 14)}${esc(typeName(type))}</button>`,
              )
              .join('')}</details>`
      }<p class="hint">${kc('Saved searches stay on this device. Smart collections belong to the workspace.', 'Сохранённые поиски остаются на этом устройстве. Умные подборки принадлежат пространству.')}</p>${commands()
        .map(([a, i, en, ru]) => `<button class="btn btn-secondary" data-a="openKnowledgeLibraryTool" data-command="${a}">${ic(i, 16)}${kc(en, ru)}</button>`)
        .join(
          '',
        )}${(S.ui.knowledgeSavedViews || []).length ? `<section><h3>${kc('Saved searches · this device', 'Сохранённые поиски · это устройство')}</h3>${S.ui.knowledgeSavedViews.map(view => `<div class="knowledge-saved-view"><button data-a="openSavedKnowledgeSearch" data-id="${esc(view.id)}" translate="no">${esc(view.name)}</button><button data-a="pinKnowledgeSearch" data-id="${esc(view.id)}" aria-pressed="${!!view.pinned}" aria-label="${esc((view.pinned ? kc('Unpin search', 'Открепить поиск') : kc('Pin search', 'Закрепить поиск')) + ': ' + view.name)}">${ic(view.pinned ? 'pin-off' : 'pin', 14)}</button><button data-a="removeKnowledgeView" data-id="${esc(view.id)}" aria-label="${kc('Remove saved search', 'Удалить сохранённый поиск')}">${ic('x', 14)}</button></div>`).join('')}</section>` : ''}</div>`,
  });
A.openKnowledgeLibraryTool = el => {
  if (commands().some(([a]) => a === el.dataset.command)) {
    closeModal();
    A[el.dataset.command]?.();
  }
};

A.openSavedKnowledgeSearch = el => {
  if (S.ui.modals.length) closeModal();
  S.ui.knowledgeMobileFolders = false;
  S.ui.knowledgeActiveCollection = null;
  A.applyKnowledgeView(el);
};
