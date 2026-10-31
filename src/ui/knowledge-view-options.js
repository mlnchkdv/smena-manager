import { S } from '../core/store.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { kc } from './knowledge-types.js';
import { knowledgeDisclosure } from './knowledge-disclosure.js';
export function knowledgeViewOptions({ readOnly, folderContext }) {
  const inlineFolders = S.ui.knowledgeFolderLayout === 'inline';
  const action = (a, icon, label) => `<button class="btn btn-ghost knowledge-menu-action" data-a="${a}">${ic(icon, 15)}<span>${label}</span></button>`;
  return `<details class="ui-menu knowledge-view-options" ${knowledgeDisclosure('catalog', 'view')}><summary class="btn btn-secondary btn-sm" aria-label="View options">${ic('sliders-horizontal', 14)}<span class="hide-m">Display</span></summary><div class="knowledge-saved-views knowledge-view-panel" role="region" aria-label="View options">
  <div class="knowledge-view-panel-head"><strong>View options</strong><button class="ibtn ibtn-sm" data-a="closeKnowledgeViewOptions" aria-label="Close">${ic('x', 15)}</button></div>
  <section class="knowledge-view-section"><h3 translate="no">${kc('Layout', 'Отображение')}</h3><label class="knowledge-folder-layout"><span>Note display</span><select class="select" data-in="knowledgeNoteLayout" aria-label="Note display"><option value="grid" ${S.ui.knowledgeNoteLayout !== 'list' ? 'selected' : ''}>Grid</option><option value="list" ${S.ui.knowledgeNoteLayout === 'list' ? 'selected' : ''}>Compact list</option></select></label>
  <button class="btn btn-ghost knowledge-menu-action knowledge-view-toggle" data-keep-menu data-a="toggleKnowledgeFolderCards" aria-label="Show folders" aria-pressed="${S.ui.knowledgeShowFolders !== false}">${ic('folder', 15)}<span>Show folders</span><span class="knowledge-menu-check" aria-hidden="true">${S.ui.knowledgeShowFolders !== false ? ic('check', 15) : ''}</span></button>
  ${folderContext ? `<label class="knowledge-folder-layout"><span>Folder display</span><select class="select" data-in="knowledgeFolderLayout" aria-label="Folder display" ${S.ui.knowledgeShowFolders === false ? 'disabled' : ''}><option value="block" ${!inlineFolders ? 'selected' : ''}>Separate block</option><option value="inline" ${inlineFolders ? 'selected' : ''}>Together with notes</option></select></label>` : ''}</section>
  <section class="knowledge-view-section"><h3 translate="no">${kc('Knowledge tools', 'Инструменты')}</h3>${action('knowledgeArchive', 'archive', kc('ZIP import / export', 'Импорт / экспорт ZIP'))}${action('offlineKnowledge', 'hard-drive', kc('Offline library', 'Офлайн-библиотека'))}${!readOnly ? action('noteTemplates', 'copy', kc('Templates', 'Шаблоны')) + action('manageKnowledgeTags', 'tags', kc('Manage tags', 'Управление тегами')) : ''}</section>
  <section class="knowledge-view-section knowledge-view-searches">${action('saveKnowledgeView', 'bookmark-plus', 'Save search')}${(S.ui.knowledgeSavedViews || []).map(view => `<span class="knowledge-saved-view"><button data-a="applyKnowledgeView" data-id="${esc(view.id)}" translate="no">${esc(view.name)}</button><button data-a="removeKnowledgeView" data-id="${esc(view.id)}" aria-label="Remove saved search">${ic('x', 12)}</button></span>`).join('')}</section>
  </div></details>`;
}
