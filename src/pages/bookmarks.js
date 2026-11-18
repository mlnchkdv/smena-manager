import '../actions/material-actions.js';
import '../features/bookmark-batch.js';
import '../styles/pages/bookmark-thumbnails.css';
import '../styles/pages/bookmark-library.css';
import { bookmarkThumbnail } from '../ui/bookmark-thumbnail.js';
import { folderNavigation } from '../ui/folder-navigation.js';
import { folderTrail } from '../shared/knowledge-tools.js';
import { readLayoutPreference, writeLayoutPreference } from '../core/view-layout-preferences.js';
import { A } from '../actions/actions.js';
import { openModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';
import { materialFavorite } from '../ui/material-favorite.js';
import { receiveWebCapture } from '../ui/web-capture.js';
import { isRussian } from '../core/i18n.js';
import { actionLabel } from '../ui/action-label.js';
import { pageIntroduction } from '../ui/page-introduction.js';
import { ago, esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { D, S } from '../core/store.js';
import { empty, prIcon } from '../ui/helpers.js';
import { relationsPanel } from '../ui/relations.js';
import { bookmarkContextPage, bookmarkView } from '../shared/bookmark-view.js';
import { paginationHtml } from '../ui/pagination.js';
import { collectionHeader, collectionToolbar, collectionOptions } from '../ui/collection-layout.js';
import { disclosureAttributes } from '../ui/disclosure.js';
import { segmentedControl } from '../ui/segmented-control.js';
import { uiCount, t } from '../core/i18n.js';

const IMPORTANCE = {
  low: { label: 'Low', priority: 'low', tone: 'muted' },
  medium: { label: 'Medium', priority: 'medium', tone: 'info' },
  high: { label: 'High', priority: 'high', tone: 'warning' },
  critical: { label: 'Critical', priority: 'urgent', tone: 'danger' },
};

const kc = (en, ru) => (isRussian() ? ru : en);
const bookmarksData = () => ({
  links: Array.isArray(D().links) ? D().links : [],
  folders: Array.isArray(D().linkFolders) ? D().linkFolders : [],
});

function safeUrl(value) {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

function bookmarkForm(folders) {
  const draft = S.ui.bookmarkDraft;
  const editing = !!S.ui.bookmarkEditing;
  return `<section class="bookmark-form" aria-label="${editing ? 'Edit bookmark' : 'New bookmark'}">
    <div class="bookmark-form-head"><div><h2>${editing ? 'Edit bookmark' : 'New bookmark'}</h2><p>Keep an important team resource in the shared workspace.</p></div><button class="ibtn" data-a="closeBookmarkForm" aria-label="Close">${ic('x', 16)}</button></div>
    <div class="bookmark-form-grid">
      <div class="field bookmark-url-field"><label class="label" for="bookmark-url">URL</label><input class="input" id="bookmark-url" type="url" inputmode="url" value="${esc(draft.url)}" data-in="bookmarkDraft" data-field="url" placeholder="https://example.com" autocomplete="url"><div class="bookmark-metadata-row" translate="no"><span class="hint" role="status" data-bookmark-metadata-status>${kc('Title and description are filled in automatically when available.', 'Заголовок и описание заполнятся автоматически, если доступны.')}</span><button class="btn btn-ghost btn-sm" data-a="bookmarkMetadata">${kc('Get details', 'Заполнить по ссылке')}</button></div></div>
      <div class="field"><label class="label" for="bookmark-title">Bookmark title</label><input class="input" id="bookmark-title" value="${esc(draft.title)}" data-in="bookmarkDraft" data-field="title" placeholder="Resource title"></div>
      <label class="field bookmark-description-field" translate="no">${kc('Saved excerpt', 'Сохранённый фрагмент')}<textarea class="textarea" data-in="bookmarkDraft" data-field="excerpt" maxlength="8000">${esc(draft.excerpt || '')}</textarea></label><label class="field" translate="no">${kc('Shared processing status', 'Общий статус обработки')}<select class="select" data-in="bookmarkDraft" data-field="readingStatus">${[
        ['unread', kc('To read', 'Прочитать')],
        ['reading', kc('In progress', 'В работе')],
        ['done', kc('Processed', 'Разобрано')],
      ]
        .map(([v, n]) => `<option value="${v}" ${draft.readingStatus === v ? 'selected' : ''}>${n}</option>`)
        .join(
          '',
        )}</select></label><div class="field bookmark-description-field"><label class="label" for="bookmark-description">Description</label><textarea class="textarea" id="bookmark-description" data-in="bookmarkDraft" data-field="description" placeholder="Why this resource is useful">${esc(draft.description)}</textarea></div>
      <div class="field"><label class="label" for="bookmark-folder">Folder</label><select class="select" id="bookmark-folder" data-in="bookmarkDraft" data-field="folder"><option value="">No folder</option>${folders.map(folder => `<option value="${folder.id}" ${draft.folder === folder.id ? 'selected' : ''} translate="no">${esc(folder.name)}</option>`).join('')}</select></div>
      <div class="field"><label class="label" for="bookmark-importance">Importance</label><select class="select" id="bookmark-importance" data-in="bookmarkDraft" data-field="importance">${Object.entries(
        IMPORTANCE,
      )
        .map(([value, meta]) => `<option value="${value}" ${draft.importance === value ? 'selected' : ''}>${meta.label}</option>`)
        .join('')}</select></div>
      <div class="field bookmark-tags-field"><label class="label" for="bookmark-tags">Tags</label><input class="input" id="bookmark-tags" value="${esc(draft.tags)}" data-in="bookmarkDraft" data-field="tags" placeholder="design, research, tools"><span class="hint">Separate tags with commas.</span></div>
    </div>
    <div class="bookmark-form-actions"><button class="btn btn-secondary" data-a="closeBookmarkForm">Cancel</button><button class="btn btn-primary" data-a="saveBookmark">${ic('check', 14)}${editing ? 'Save changes' : 'Add bookmark'}</button></div>
  </section>`;
}

function bookmarkCard(link, folders, readOnly) {
  const parsed = safeUrl(link.url);
  if (!parsed) return '';
  const folder = folders.find(item => item.id === link.folder);
  const importance = IMPORTANCE[link.importance] || IMPORTANCE.medium;
  const host = link.site_name || parsed.hostname.replace(/^www\./, '');
  const actionName = action => actionLabel(action, link.title || host, [folder?.name, parsed.hostname].filter(Boolean).join(' / '));
  return `<article aria-labelledby="bookmark-title-${esc(link.id)}" class="bookmark-card ${link.is_read ? 'is-read' : 'is-unread'} ${!readOnly && S.ui.bookmarkSelecting ? 'is-selectable' : ''}">${readOnly || !S.ui.bookmarkSelecting ? '' : `<label class="bookmark-select"><input type="checkbox" data-in="bookmarkSelect" data-id="${esc(link.id)}" aria-label="${esc(kc('Select bookmark', 'Выбрать закладку') + ': ' + (link.title || host))}" ${S.ui.bookmarkSelection?.includes(link.id) ? 'checked' : ''}></label>`}
    ${bookmarkThumbnail(link, host)}<div class="bookmark-card-top">
      
      <div class="grow min0"><button id="bookmark-title-${esc(link.id)}" class="bookmark-title" data-a="viewBookmarkPage" data-id="${esc(link.id)}" translate="no" title="${esc(link.title || host)}">${esc(link.title || host)}</button><span class="bookmark-host trunc" translate="no">${esc(host)}</span></div>
      ${['high', 'critical'].includes(link.importance) ? `<span class="bookmark-importance tone-${importance.tone}" title="${esc(t(importance.label))}">${prIcon(importance.priority, 13)}<span class="sr">${esc(t(importance.label))}</span></span>` : ''}
    </div>
    ${link.description ? `<p class="bookmark-description" translate="no">${esc(link.description)}</p>` : ''}
    <div class="bookmark-tags" translate="no">${(link.tags || [])
      .slice(0, 2)
      .map(tag => `<span class="chip">#${esc(tag)}</span>`)
      .join(
        '',
      )}${link.tags?.length > 2 ? `<span class="hint" title="${esc(link.tags.slice(2).join(', '))}">+${link.tags.length - 2}</span>` : ''}${folder ? `<span class="chip bookmark-folder-chip" title="${esc(folder.name)}">${ic('folder', 11)}<span class="trunc">${esc(folder.name)}</span></span>` : ''}</div>
    <div class="bookmark-preview-row" translate="no"><span class="bookmark-save-state" title="${esc(kc('Saved page versions are available in the viewer.', 'Сохранённые версии страницы доступны в просмотрщике.'))}">${ic(link.pageSnapshots?.length ? 'archive' : 'link', 13)}${link.pageSnapshots?.length ? (link.pageSnapshots.some(ref => ref.format === 'html') ? kc('HTML saved', 'HTML сохранён') : kc('Text saved', 'Текст сохранён')) : kc('Link only', 'Только ссылка')}</span><a class="bookmark-original" href="${esc(parsed.toString())}" target="_blank" rel="noopener noreferrer" aria-label="${esc(kc('Open original: ', 'Открыть оригинал: ') + (link.title || host))}">${kc('Original', 'Оригинал')}${ic('arrow-up-right', 13)}</a></div>
    <div class="bookmark-card-foot"><div class="bookmark-card-meta"><span class="bookmark-read-state" translate="no" title="${kc('Shared across workspace members; favorites are personal.', 'Общий для участников пространства; избранное — личное.')}">${link.readingStatus === 'reading' ? kc('In progress', 'В работе') : link.is_read ? kc('Processed', 'Разобрано') : kc('To read', 'Прочитать')}</span><span>${ic('clock-3', 12)}${ago(new Date(link.updated_at || link.created_at).getTime())}</span></div><div class="bookmark-card-actions">${materialFavorite('bookmark', link)}${
      readOnly
        ? `<details class="bookmark-action-menu ui-menu"><summary aria-label="${actionName('More actions')}">${ic('ellipsis', 16)}</summary><div><a class="btn btn-ghost btn-sm" href="${esc(parsed.toString())}" target="_blank" rel="noopener noreferrer" translate="no">${ic('arrow-up-right', 14)}${kc('Original', 'Оригинал')}</a><button class="btn btn-ghost btn-sm" data-a="bookmarkConnections" data-id="${esc(link.id)}">${ic('network', 14)}Connections</button><button class="btn btn-ghost btn-sm" data-a="copyBookmark" data-id="${esc(link.id)}">${ic('copy', 14)}Copy link</button></div></details>`
        : `<button class="ibtn ibtn-xs" data-a="toggleBookmarkRead" data-id="${link.id}" data-tip="${link.is_read ? 'Mark bookmark as unread' : 'Mark bookmark as read'}" aria-label="${actionName(link.is_read ? 'Mark bookmark as unread' : 'Mark bookmark as read')}">${ic(link.is_read ? 'circle' : 'circle-check', 14)}</button><details class="bookmark-action-menu ui-menu"><summary aria-label="${actionName('More actions')}" title="${actionName('More actions')}">${ic('ellipsis', 16)}</summary><div><a class="btn btn-ghost btn-sm" href="${esc(parsed.toString())}" target="_blank" rel="noopener noreferrer" translate="no">${ic('arrow-up-right', 14)}${kc('Original', 'Оригинал')}</a><button class="btn btn-ghost btn-sm" data-a="bookmarkConnections" data-id="${esc(link.id)}">${ic('network', 14)}Connections</button><button class="btn btn-ghost btn-sm" data-a="copyBookmark" data-id="${esc(link.id)}">${ic('copy', 14)}Copy link</button><button class="btn btn-ghost btn-sm" data-a="addRelationPicker" data-key="bookmark:${esc(link.id)}">${ic('plus', 14)}Add connection</button><button class="btn btn-ghost btn-sm" data-a="keepBookmarkOffline" data-id="${esc(link.id)}" translate="no">${kc('Keep link details offline', 'Ссылка и описание офлайн')}</button><button class="btn btn-ghost btn-sm" data-a="editBookmark" data-id="${link.id}">${ic('pencil', 14)}Edit bookmark</button><button class="btn btn-ghost btn-sm" data-a="toggleBookmarkArchive" data-id="${link.id}">${ic(link.is_archived ? 'archive-restore' : 'archive', 14)}${link.is_archived ? 'Restore bookmark' : 'Archive bookmark'}</button><button class="btn btn-ghost btn-sm danger" data-a="deleteBookmark" data-id="${link.id}">${ic('trash-2', 14)}Delete bookmark</button></div></details>`
    }</div></div>
    ${link.excerpt ? `<details translate="no"><summary>${kc('Saved excerpt', 'Сохранённый фрагмент')}</summary><blockquote class="bookmark-excerpt">${esc(link.excerpt)}</blockquote></details>` : ''}
  </article>`;
}

A.bookmarkConnections = el => {
  const id = el.dataset.id;
  openModal({
    type: 'bookmarkConnections',
    render: (_modal, H) => {
      const link = bookmarksData().links.find(item => item.id === id);
      return `${H('Connections')}<div class="modal-b"><p translate="no">${esc(link?.title || '')}</p>${link ? relationsPanel(`bookmark:${id}`) : '<p role="status">Material unavailable</p>'}</div><div class="modal-f"><button class="btn btn-secondary" data-a="closeModal">Close</button></div>`;
    },
  });
};

A.setBookmarkLayout = el => {
  writeLayoutPreference('bookmarkLayout:' + (S.ui.bookmarkFolder || 'all'), ['grid', 'list', 'compact'].includes(el.dataset.value) ? el.dataset.value : 'grid');
  render();
};
export function pageBookmarks() {
  if (location.hash.startsWith('#capture=')) queueMicrotask(receiveWebCapture);
  const layout = readLayoutPreference('bookmarkLayout:' + (S.ui.bookmarkFolder || 'all'), readLayoutPreference('bookmarkLayout', 'grid'));
  const { links, folders } = bookmarksData();
  const query = String(S.ui.bookmarkQuery || '')
    .trim()
    .toLowerCase();
  const folderFilter = S.ui.bookmarkFolder || 'all';
  const folderIndex = new Map(folders.map(folder => [folder.id, { ...folder, parentId: folder.parent_id }]));
  const crumbs = folderTrail(folderFilter, folderIndex);
  const folderPath = folder =>
    folderTrail(folder.id, folderIndex)
      .map(item => item.name)
      .join(' / ');
  const bookmarkCrumbs = crumbs.length
    ? crumbs
        .map(
          (item, index) =>
            `${index ? '<span aria-hidden="true">/</span>' : ''}${index === crumbs.length - 1 ? `<strong class="trunc">${esc(item.name)}</strong>` : `<button class="btn btn-ghost btn-sm" data-a="collectionFolderUp" data-kind="bookmarks" data-folder="${esc(item.id)}">${esc(item.name)}</button>`}`,
        )
        .join('')
    : `<strong class="trunc">${esc(folderFilter === 'root' ? kc('No folder', 'Без папки') : kc('Folder unavailable', 'Папка недоступна'))}</strong>`;
  const scope = S.ui.bookmarkScope || 'active';
  const readOnly = S.ui.currentUser?.role === 'viewer';
  const archiveFilters = {
    archive: S.ui.bookmarkArchiveFilter || 'all',
    capturedAfter: S.ui.bookmarkCapturedAfter || '',
    sort: S.ui.bookmarkArchiveSort || 'updated',
  };
  const page = bookmarkView(links, {
    query,
    folder: folderFilter,
    scope,
    ...archiveFilters,
    page: bookmarkContextPage(S.ui, { query, folder: folderFilter, scope, ...archiveFilters }),
  });
  S.ui.listPages.bookmarks = page.page;
  const selectionKey = JSON.stringify([D().me, D().ws.id || D().ws.url, query, folderFilter, scope, page.page]);
  if (S.ui.bookmarkSelectionKey !== selectionKey) {
    S.ui.bookmarkSelectionNotice = !!S.ui.bookmarkSelection?.length;
    S.ui.bookmarkSelection = [];
    S.ui.bookmarkSelectionKey = selectionKey;
    S.ui.bookmarkSelecting = false;
  }
  const filtered = page.items;
  S.ui.bookmarkPageIds = filtered.map(item => item.id);
  const unread = links.filter(link => !link.is_archived && !link.is_read).length;

  return `<div class="bookmarks-page bookmark-library layout-catalog">
${collectionHeader(`<div><h1>Bookmarks</h1><p class="page-description">Shared links, references, and useful resources for the team.</p></div><div class="row acts">${pageIntroduction('Shared links, references, and useful resources for the team.')}${readOnly ? '' : `<button class="btn btn-secondary" data-a="webCaptureHelp" aria-label="${kc('Web capture', 'Сбор из браузера')}" translate="no">${ic('globe', 14)}<span class="hide-m">${kc('Web capture', 'Сбор из браузера')}</span></button><button class="btn btn-primary" data-a="newBookmark" aria-label="Add bookmark" title="Add bookmark">${ic('plus', 14)}<span class="hide-m">Add bookmark</span></button>`}</div>`, 'bookmarks-head compact-page-head')}
    <section class="bookmark-summary" aria-label="Bookmark summary"><span>${links.filter(link => !link.is_archived).length} active</span><span>${unread} unread</span><span translate="no">${uiCount(folders.length, 'folder')}</span></section>
    ${S.ui.bookmarkForm && !readOnly ? bookmarkForm(folders) : ''}
    ${collectionToolbar(
      `
      <div class="inwrap bookmark-search">${ic('search', 14)}<input class="input" id="bookmark-search" data-in="bookmarkQuery" value="${esc(S.ui.bookmarkQuery || '')}" placeholder="Search bookmarks, tags, and URLs" aria-label="Search bookmarks" style="padding-right:44px">${query ? `<button class="ibtn search-clear" data-a="clearSearchInput" data-input="bookmark-search" aria-label="Clear search">${ic('x', 16)}</button>` : ''}</div>
      <div class="bookmark-folder-control"><label class="sr" for="bookmark-folder-filter">Filter by folder</label><select class="select" id="bookmark-folder-filter" data-in="bookmarkFolder" data-searchable data-browse-first><option value="all" ${folderFilter === 'all' ? 'selected' : ''}>All folders</option><option value="root" ${folderFilter === 'root' ? 'selected' : ''}>No folder</option>${folders.map(folder => `<option value="${folder.id}" ${folderFilter === folder.id ? 'selected' : ''} translate="no">${esc(folderPath(folder))}</option>`).join('')}</select></div>
      <details class="ui-menu bookmark-view-menu" data-anchor-end ${disclosureAttributes('bookmark:view')}><summary class="btn btn-secondary">${ic('layout-grid', 15)}<span>${kc('View', 'Вид')}</span></summary><div><p class="hint" translate="no">${kc('Saved for this folder on this device.', 'Вид папки сохраняется на этом устройстве.')}</p>${[
        ['grid', 'layout-grid', kc('Cards', 'Карточки')],
        ['list', 'list', kc('List', 'Список')],
        ['compact', 'align-justify', kc('Compact', 'Компактный')],
      ]
        .map(
          ([value, icon, label]) =>
            `<button class="btn btn-ghost" data-a="setBookmarkLayout" data-value="${value}" aria-pressed="${layout === value}" translate="no">${ic(icon, 16)}${label}${layout === value ? ic('check', 14) : ''}</button>`,
        )
        .join('')}</div></details>
      ${collectionOptions(
        `
      <label class="field" translate="no">${kc('Saved page', 'Сохранённая страница')}<select class="select" data-in="bookmarkArchiveFilter">${[
        ['all', kc('All', 'Все')],
        ['none', kc('No saved copy', 'Нет копии')],
        ['html', kc('HTML archive', 'HTML-архив')],
        ['text', kc('Text copy', 'Текстовая копия')],
        ['incomplete', kc('Missing resources', 'Неполное оформление')],
      ]
        .map(([v, label]) => `<option value="${v}" ${archiveFilters.archive === v ? 'selected' : ''}>${label}</option>`)
        .join(
          '',
        )}</select></label><label class="field" translate="no">${kc('Captured since', 'Архивировано с даты')}<input class="input" type="date" data-in="bookmarkCapturedAfter" value="${esc(archiveFilters.capturedAfter)}"></label><label class="field" translate="no">${kc('Sort', 'Сортировка')}<select class="select" data-in="bookmarkArchiveSort"><option value="updated" ${archiveFilters.sort === 'updated' ? 'selected' : ''}>${kc('Recently updated', 'Недавно обновлённые')}</option><option value="captured" ${archiveFilters.sort === 'captured' ? 'selected' : ''}>${kc('Recently captured', 'Недавно архивированные')}</option></select></label><button class="btn btn-secondary" data-a="searchBookmarkArchives" translate="no">${ic('search', 16)}${kc('Search saved pages', 'Поиск по сохранённым страницам')}</button>
      ${segmentedControl({
        label: 'Bookmark status',
        key: 'bookmarkScope',
        value: scope,
        items: [
          ['active', 'Active'],
          ['archived', 'Archived'],
        ],
      })}${readOnly ? '' : `<button class="btn btn-secondary" data-a="newBookmarkFolder">${ic('folder-plus', 14)}New folder</button>`}`,
        {
          key: 'bookmarks',
          label: 'Filters',
          active: scope !== 'active' || archiveFilters.archive !== 'all' || !!archiveFilters.capturedAfter || archiveFilters.sort !== 'updated',
        },
      )}
    `,
      'Bookmark filters and view',
      'bookmark-toolbar',
    )}
    <div class="collection-results-row bookmark-results-row">
    <nav class="bookmark-location" aria-label="${kc('Bookmark location', 'Расположение закладок')}" translate="no">${folderNavigation('bookmarks', folderFilter === 'all' ? null : { folder: folderIndex.get(folderFilter)?.parentId || 'all' })}${folderFilter === 'all' ? `<strong>${kc('All bookmarks', 'Все закладки')}</strong>` : `<button class="btn btn-ghost btn-sm" data-a="collectionFolderUp" data-kind="bookmarks" data-folder="all">${kc('All bookmarks', 'Все закладки')}</button><span aria-hidden="true">/</span>${bookmarkCrumbs}`}</nav>
    ${!readOnly && filtered.length ? (S.ui.bookmarkSelecting ? `<div class="bookmark-bulk row" style="flex-wrap:wrap;gap:8px"><label class="row"><input type="checkbox" data-in="bookmarkSelectPage" ${filtered.every(item => S.ui.bookmarkSelection?.includes(item.id)) ? 'checked' : ''}>${kc('Select page', 'Выбрать страницу')}</label><span role="status">${kc('Selected: ', 'Выбрано: ')}${S.ui.bookmarkSelection?.length || 0}</span><button class="btn btn-secondary" data-a="bookmarkBatch" ${!S.ui.bookmarkSelection?.length ? 'disabled' : ''}>${kc('Actions', 'Действия')}</button><button class="btn btn-ghost" data-a="clearBookmarkSelection">${kc('Done', 'Готово')}</button></div>` : `<button class="btn btn-secondary btn-sm" data-a="startBookmarkSelection" translate="no">${ic('list-checks', 16)}${kc('Select', 'Выбрать')}</button>`) : ''}
    ${filtered.length ? `<span class="hint num bookmark-result-count" role="status">${page.page * 60 + 1}–${page.page * 60 + filtered.length} / ${page.total}</span>` : ''}
    </div>
    ${S.ui.bookmarkSelectionNotice ? `<p class="hint" role="status">${kc('Selection cleared because the view changed.', 'Выбор снят после изменения представления.')}</p>` : ''}
    ${
      filtered.length
        ? `<div class="bookmark-grid ${layout === 'list' ? 'is-list' : layout === 'compact' ? 'is-compact' : ''}">${filtered.map(link => bookmarkCard(link, folders, readOnly)).join('')}</div>${paginationHtml(page, 'bookmarks')}`
        : empty(
            'bookmark-x',
            scope === 'archived' ? 'No archived bookmarks' : 'No bookmarks found',
            query || folderFilter !== 'all'
              ? 'Try changing the search or folder filter.'
              : readOnly
                ? 'An editor can add the first shared bookmark.'
                : 'Add the first useful resource for your team.',
            readOnly || query || folderFilter !== 'all' ? '' : `<button class="btn btn-primary" data-a="newBookmark">${ic('plus', 14)}Add bookmark</button>`,
            '',
            1,
          )
    }
  </div>`;
}
