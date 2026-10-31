import { A } from '../actions/actions.js';
import { D, S } from '../core/store.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { kc, typeName } from './knowledge-types.js';
import { noteTypes } from '../shared/knowledge-types.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { disclosureAttributes } from './disclosure.js';
export function knowledgeCreateMenu() {
  return `<div class="knowledge-create" translate="no"><button class="btn btn-primary btn-sm" data-a="newKnowledgeNote" aria-label="${kc('New note', 'Новая заметка')}" title="${kc('New note', 'Новая заметка')}">${ic('plus', 14)}<span class="hide-m">${kc('New note', 'Новая заметка')}</span></button><details class="ui-menu knowledge-create-options" ${disclosureAttributes('knowledge-create')}><summary class="btn btn-primary btn-sm" aria-label="${kc('Create by type or template', 'Создать по типу или шаблону')}" title="${kc('Create by type or template', 'Создать по типу или шаблону')}">${ic('chevron-down', 14)}</summary><div>${noteTypes(
    D().ws,
  )
    .map(type => `<button data-a="newKnowledgeNote" data-type-id="${esc(type.id)}">${ic('file-plus', 14)}<span>${esc(typeName(type))}</span></button>`)
    .join(
      '',
    )}<hr><button data-a="noteTemplates">${ic('copy', 14)}<span>${kc('From template…', 'Из шаблона…')}</span></button>${S.ui.currentUser?.role === 'admin' ? `<button data-a="manageNoteTypes">${ic('shapes', 14)}<span>${kc('Manage types', 'Настроить типы')}</span></button>` : ''}</div></details></div>`;
}
const commands = () => [
  ['knowledgeArchive', 'archive', 'ZIP import / export', 'Импорт / экспорт ZIP'],
  ['offlineKnowledge', 'hard-drive', 'Offline library', 'Офлайн-библиотека'],
  ...(S.ui.currentUser?.role === 'viewer'
    ? []
    : [
        ['noteTemplates', 'copy', 'Templates', 'Шаблоны'],
        ['manageKnowledgeTags', 'tags', 'Manage tags', 'Управление тегами'],
      ]),
  ...(S.ui.currentUser?.role === 'admin' ? [['manageNoteTypes', 'shapes', 'Manage types', 'Настроить типы']] : []),
];
A.knowledgeLibraryTools = () =>
  openModal({
    type: 'knowledgeTool',
    render: (_m, H) =>
      `${H(kc('Library tools', 'Инструменты базы знаний'))}<div class="modal-b knowledge-library-tools" translate="no">${commands()
        .map(([a, i, en, ru]) => `<button class="btn btn-secondary" data-a="openKnowledgeLibraryTool" data-command="${a}">${ic(i, 16)}${kc(en, ru)}</button>`)
        .join('')}</div>`,
  });
A.openKnowledgeLibraryTool = el => {
  if (commands().some(([a]) => a === el.dataset.command)) {
    closeModal();
    A[el.dataset.command]?.();
  }
};
