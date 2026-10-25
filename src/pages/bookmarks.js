import { ago, esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { D, S } from '../core/store.js';
import { empty } from '../ui/helpers.js';
import { relationsPanel } from '../ui/relations.js';

const IMPORTANCE = {
  low: { label: 'Low', icon: 'minus', tone: 'muted' },
  medium: { label: 'Medium', icon: 'star', tone: 'info' },
  high: { label: 'High', icon: 'star', tone: 'warning' },
  critical: { label: 'Critical', icon: 'triangle-alert', tone: 'danger' },
};

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

function bookmarkMatches(link, query) {
  if (!query) return true;
  return [link.title, link.description, link.url, link.site_name, ...(link.tags || [])].join(' ').toLowerCase().includes(query);
}

function bookmarkForm(folders) {
  const draft = S.ui.bookmarkDraft;
  const editing = !!S.ui.bookmarkEditing;
  return `<section class="bookmark-form" aria-label="${editing ? 'Edit bookmark' : 'New bookmark'}">
    <div class="bookmark-form-head"><div><h2>${editing ? 'Edit bookmark' : 'New bookmark'}</h2><p>Keep an important team resource in the shared workspace.</p></div><button class="ibtn" data-a="closeBookmarkForm" aria-label="Close">${ic('x', 16)}</button></div>
    <div class="bookmark-form-grid">
      <div class="field bookmark-url-field"><label class="label" for="bookmark-url">URL</label><input class="input" id="bookmark-url" type="url" inputmode="url" value="${esc(draft.url)}" data-in="bookmarkDraft" data-field="url" placeholder="https://example.com" autocomplete="url"></div>
      <div class="field"><label class="label" for="bookmark-title">Bookmark title</label><input class="input" id="bookmark-title" value="${esc(draft.title)}" data-in="bookmarkDraft" data-field="title" placeholder="Resource title"></div>
      <div class="field bookmark-description-field"><label class="label" for="bookmark-description">Description</label><textarea class="textarea" id="bookmark-description" data-in="bookmarkDraft" data-field="description" placeholder="Why this resource is useful">${esc(draft.description)}</textarea></div>
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
  return `<article class="bookmark-card ${link.is_read ? 'is-read' : 'is-unread'}">
    <div class="bookmark-card-top">
      <span class="bookmark-site-icon" aria-hidden="true" translate="no">${esc(host.slice(0, 1).toUpperCase())}</span>
      <div class="grow min0"><a class="bookmark-title trunc" href="${esc(parsed.toString())}" target="_blank" rel="noopener noreferrer" translate="no">${esc(link.title || host)}${ic('arrow-up-right', 13)}</a><span class="bookmark-host trunc" translate="no">${esc(host)}</span></div>
      <span class="bookmark-importance tone-${importance.tone}" title="${importance.label}">${ic(importance.icon, 13)}<span>${importance.label}</span></span>
    </div>
    ${link.description ? `<p class="bookmark-description" translate="no">${esc(link.description)}</p>` : ''}
    <div class="bookmark-tags" translate="no">${(link.tags || []).map(tag => `<span class="chip">#${esc(tag)}</span>`).join('')}${folder ? `<span class="chip bookmark-folder-chip">${ic('folder', 11)}${esc(folder.name)}</span>` : ''}</div>
    <div class="bookmark-card-foot"><span>${ic('clock-3', 12)}${ago(new Date(link.updated_at || link.created_at).getTime())}</span><span class="sp"></span>${
      readOnly
        ? ''
        : `<button class="ibtn ibtn-xs" data-a="toggleBookmarkRead" data-id="${link.id}" data-tip="${link.is_read ? 'Mark bookmark as unread' : 'Mark bookmark as read'}" aria-label="${link.is_read ? 'Mark bookmark as unread' : 'Mark bookmark as read'}">${ic(link.is_read ? 'circle' : 'circle-check', 14)}</button><button class="ibtn ibtn-xs" data-a="copyBookmark" data-id="${link.id}" data-tip="Copy link" aria-label="Copy link">${ic('copy', 14)}</button><details class="bookmark-action-menu"><summary aria-label="More actions">${ic('ellipsis', 16)}</summary><div><button class="btn btn-ghost btn-sm" data-a="editBookmark" data-id="${link.id}">${ic('pencil', 14)}Edit bookmark</button><button class="btn btn-ghost btn-sm" data-a="toggleBookmarkArchive" data-id="${link.id}">${ic(link.is_archived ? 'archive-restore' : 'archive', 14)}${link.is_archived ? 'Restore bookmark' : 'Archive bookmark'}</button><button class="btn btn-ghost btn-sm danger" data-a="deleteBookmark" data-id="${link.id}">${ic('trash-2', 14)}Delete bookmark</button></div></details>`
    }</div>
    ${relationsPanel(`bookmark:${link.id}`, true)}
  </article>`;
}

export function pageBookmarks() {
  const { links, folders } = bookmarksData();
  const query = String(S.ui.bookmarkQuery || '')
    .trim()
    .toLowerCase();
  const folderFilter = S.ui.bookmarkFolder || 'all';
  const scope = S.ui.bookmarkScope || 'active';
  const readOnly = S.ui.currentUser?.role === 'viewer';
  const filtered = links
    .filter(link => bookmarkMatches(link, query))
    .filter(link => folderFilter === 'all' || (folderFilter === 'root' ? !link.folder : link.folder === folderFilter))
    .filter(link => (scope === 'archived' ? link.is_archived : !link.is_archived))
    .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());
  const unread = links.filter(link => !link.is_archived && !link.is_read).length;

  return `<div class="bookmarks-page">
    <header class="page-head bookmarks-head"><div><h1>Bookmarks</h1><p>Shared links, references, and useful resources for the team.</p></div>${readOnly ? '' : `<div class="row"><button class="btn btn-secondary" data-a="newBookmarkFolder">${ic('folder-plus', 14)}New folder</button><button class="btn btn-primary" data-a="newBookmark">${ic('plus', 14)}Add bookmark</button></div>`}</header>
    <section class="bookmark-summary" aria-label="Bookmark summary"><span>${links.filter(link => !link.is_archived).length} active</span><span>${unread} unread</span><span>${folders.length} folders</span></section>
    ${S.ui.bookmarkForm && !readOnly ? bookmarkForm(folders) : ''}
    <div class="bookmark-toolbar">
      <div class="inwrap bookmark-search">${ic('search', 14)}<input class="input" data-in="bookmarkQuery" value="${esc(S.ui.bookmarkQuery || '')}" placeholder="Search bookmarks, tags, and URLs" aria-label="Search bookmarks"></div>
      <label class="sr" for="bookmark-folder-filter">Filter by folder</label><select class="select" id="bookmark-folder-filter" data-in="bookmarkFolder"><option value="all" ${folderFilter === 'all' ? 'selected' : ''}>All folders</option><option value="root" ${folderFilter === 'root' ? 'selected' : ''}>No folder</option>${folders.map(folder => `<option value="${folder.id}" ${folderFilter === folder.id ? 'selected' : ''} translate="no">${esc(folder.name)}</option>`).join('')}</select>
      <div class="seg" role="group" aria-label="Bookmark status"><button class="${scope === 'active' ? 'on' : ''}" data-a="set" data-k="bookmarkScope" data-v="active">Active</button><button class="${scope === 'archived' ? 'on' : ''}" data-a="set" data-k="bookmarkScope" data-v="archived">Archived</button></div>
    </div>
    ${
      filtered.length
        ? `<div class="bookmark-grid">${filtered.map(link => bookmarkCard(link, folders, readOnly)).join('')}</div>`
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
