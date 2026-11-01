import { isFavorite } from '../core/favorites.js';
import { D, S } from '../core/store.js';
import { getSessionGeneration } from '../core/api.js';
import { favoriteEntries } from '../shared/personal-favorites.js';
import { ENTITY_COLLECTIONS, entityAllowed } from '../shared/relations.js';
import { ENTITY_ICONS, ENTITY_LABELS, graphOptions } from '../ui/relations.js';
import { materialFavorite } from '../ui/material-favorite.js';
import { empty } from '../ui/helpers.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { folderTrail } from '../shared/knowledge-tools.js';
import { fileFolderPath } from '../shared/file-organization.js';
import { render } from '../shell/render.js';
import { A, IN } from '../actions/actions.js';
import { listWindow } from '../shared/list-window.js';
import { paginationHtml } from '../ui/pagination.js';
import { t } from '../core/i18n.js';
let checked = '',
  pending = false,
  failure = '';
A.retryFavoriteFiles = () => {
  checked = '';
  failure = '';
  render();
};
IN.favoriteQuery = el => {
  S.ui.favoriteQuery = el.value;
  render();
};
IN.favoriteSort = el => {
  S.ui.favoriteSort = el.value;
  render();
};
export function pageFavorites() {
  const data = D(),
    options = graphOptions();
  const ids = favoriteEntries(S.prefs.favorites)
    .filter(([key, on]) => on && key.startsWith('file:'))
    .map(([key]) => key.slice(5));
  const scope = JSON.stringify([getSessionGeneration(), data.ws.id || data.ws.url, S.ui.currentUser?.id, S.ui.workspaceRevision, ids]);
  if (ids.length && checked !== scope && !pending) {
    checked = scope;
    pending = true;
    failure = '';
    const owner = getSessionGeneration();
    void import('../features/file-catalog-demand.js')
      .then(m => m.ensureFileIdentities(ids))
      .catch(() => {
        if (owner === getSessionGeneration()) failure = 'Some favorites could not be loaded. Retry to check current access.';
      })
      .finally(() => {
        pending = false;
        if (owner === getSessionGeneration()) render();
      });
  }
  const kinds = Object.keys(ENTITY_COLLECTIONS);
  const items = kinds.flatMap(kind =>
    (data[ENTITY_COLLECTIONS[kind]] || [])
      .filter(record => isFavorite(kind, record) && !record.archived && !record.is_archived && entityAllowed(data, `${kind}:${record.id}`, options))
      .map(record => ({ kind, record })),
  );
  const filter = kinds.includes(S.ui.favoriteKind) ? S.ui.favoriteKind : '';
  const location = (kind, record) => {
    const project = data.projects.find(p => p.id === (record.project || (kind === 'project' ? record.id : '')));
    if (kind === 'note')
      return (
        folderTrail(record.folderId, data.knowledgeFolders)
          .map(f => f.name)
          .join(' / ') || t('No folder')
      );
    if (kind === 'bookmark') return data.linkFolders.find(f => f.id === record.folder)?.name || t('No folder');
    return [
      project?.name,
      kind === 'file' &&
        fileFolderPath(project, record.folderId)
          .map(folder => folder.name)
          .join(' / '),
    ]
      .filter(Boolean)
      .join(' / ');
  };
  const query = (S.ui.favoriteQuery || '').trim().toLocaleLowerCase();
  const filtered = items.filter(
    ({ kind, record }) =>
      (!filter || kind === filter) &&
      `${record.title || record.name || record.url || ''} ${location(kind, record)} ${t(ENTITY_LABELS[kind])}`.toLocaleLowerCase().includes(query),
  );
  const stamp = record => Number(new Date(record.updatedAt || record.updated_at || record.at || record.created_at || record.last || 0)) || 0;
  filtered.sort((a, b) =>
    S.ui.favoriteSort === 'name'
      ? String(a.record.title || a.record.name || a.record.url).localeCompare(
          String(b.record.title || b.record.name || b.record.url),
          document.documentElement.lang,
        )
      : stamp(b.record) - stamp(a.record),
  );
  const key = JSON.stringify(['favorites', D().ws.id || D().ws.url, D().me, filter, query, S.ui.favoriteSort]);
  const page = listWindow(filtered, S.ui.listPages?.[key], 50),
    visible = page.items;
  return `<div class="page wide"><div class="ph compact-page-head"><div><h1>Favorites</h1><p>Personal shortcuts to materials you can currently access.</p></div></div><div class="row" style="flex-wrap:wrap;gap:8px;margin-bottom:12px"><input class="input" data-in="favoriteQuery" value="${esc(S.ui.favoriteQuery || '')}" aria-label="${t('Search favorites')}" placeholder="${t('Search favorites')}" style="flex:1;min-width:180px"><label><span class="sr">Material type</span><select class="select" data-in="favoriteKind" aria-label="Material type"><option value="">All types</option>${kinds.map(kind => `<option value="${kind}" ${filter === kind ? 'selected' : ''}>${t(ENTITY_LABELS[kind])} · ${items.filter(item => item.kind === kind).length}</option>`).join('')}</select></label><select class="select" data-in="favoriteSort" aria-label="Sort"><option value="recent">Recently updated</option><option value="name" ${S.ui.favoriteSort === 'name' ? 'selected' : ''}>Name</option></select></div><p class="hint" role="status">${t('Results')}: ${filtered.length}</p>${pending ? '<p class="hint" role="status">Loading favorite files…</p>' : ''}${failure ? `<p class="alert warn" role="alert">${t(failure)}<button class="btn btn-secondary btn-sm" data-a="retryFavoriteFiles">Try again</button></p>` : ''}${visible.length ? `<div class="panel">${visible.map(({ kind, record }) => `<article class="mini favorite-material"><button class="row grow min0" data-a="openRelatedEntity" data-key="${esc(kind + ':' + record.id)}">${ic(ENTITY_ICONS[kind], 18)}<span class="col min0"><b class="trunc" translate="no">${esc(record.title || record.name || record.url || record.id)}</b><small class="faint trunc" translate="no">${esc(t(ENTITY_LABELS[kind]) + ' · ' + location(kind, record))}</small></span></button>${materialFavorite(kind, record)}</article>`).join('')}</div>${paginationHtml(page, key)}` : !pending ? empty('star', items.length ? 'No results found' : 'No favorites yet', items.length ? 'Try another category or a broader search term.' : 'Use a star on a task, project, note, bookmark, file or whiteboard. Only your favorites change.', '') : ''}</div>`;
}
