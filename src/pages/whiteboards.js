import { A } from '../actions/actions.js';
import { render } from '../shell/render.js';
import { collectionToolbar } from '../ui/collection-layout.js';
import { materialFavorite } from '../ui/material-favorite.js';
import { demandWhiteboard } from '../features/whiteboard-demand.js';
import { whiteboardCatalogInfo } from '../core/whiteboard-catalog-transport.js';
import { whiteboardCatalogState } from '../core/whiteboard-catalog-state.js';
import { whiteboardCatalogControls } from '../ui/whiteboard-catalog-controls.js';
import '../features/whiteboards.js';
import { D, S } from '../core/store.js';
import { ic } from '../core/icons.js';
import { esc, ago } from '../core/utils.js';
import { wbText as T, wbCount as C } from '../core/whiteboard-state.js';
import { whiteboardDocuments, whiteboardDocument, canReadWhiteboard, canEditWhiteboard } from '../shared/whiteboards.js';
import { whiteboardBounds, whiteboardPaintOrder, whiteboardVisibleBoard } from '../shared/project-whiteboard.js';
import { projectWhiteboard } from '../views/project-whiteboard.js';
import { disclosureAttributes } from '../ui/disclosure.js';
import { page404 } from './errors.js';
const canRead = b => canReadWhiteboard(D(), b, D().me, S.ui.currentUser?.role);
const canEdit = b => canEditWhiteboard(D(), b, D().me, S.ui.currentUser?.role);
const projectName = b => D().projects.find(p => p.id === b.project)?.name || T('Workspace', 'Рабочее пространство');
const colors = { neutral: 'var(--surface-3)', violet: 'var(--violet)', blue: 'var(--blue)', green: 'var(--green)', amber: 'var(--amber)', rose: 'var(--red)' };
function preview(b) {
  const board = whiteboardCatalogInfo(b.id)?.thumbnail || whiteboardVisibleBoard(b.whiteboard),
    box = whiteboardBounds(board),
    scale = Math.min(244 / Math.max(1, box.width), 84 / Math.max(1, box.height));
  const nodes = whiteboardPaintOrder(board.nodes.slice(0, 40));
  const labels = new Map(),
    occupied = [];
  for (const node of [...nodes].reverse()) {
    if (labels.size >= 6 || node.width * scale < 50 || node.height * scale < 20) continue;
    const rect = { x: node.x * scale + 6, y: node.y * scale + 3, w: Math.max(0, node.width * scale - 12), h: 13 };
    if (occupied.some(other => rect.x < other.x + other.w && rect.x + rect.w > other.x && rect.y < other.y + other.h && rect.y + rect.h > other.y)) continue;
    occupied.push(rect);
    labels.set(
      node.id,
      (
        node.title ||
        T(
          node.type === 'group' ? 'Frame' : node.type === 'material' ? 'Material' : 'Text',
          node.type === 'group' ? 'Рамка' : node.type === 'material' ? 'Материал' : 'Текст',
        )
      ).slice(0, Math.max(3, Math.floor(rect.w / 6) - 1)),
    );
  }
  return `<svg class="whiteboard-thumbnail" viewBox="0 0 260 100" aria-hidden="true"><g transform="translate(${(260 - box.width * scale) / 2},${(100 - box.height * scale) / 2}) scale(${scale}) translate(${-box.x},${-box.y})">${board.edges
    .slice(0, 60)
    .map(e => {
      const a = board.nodes.find(n => n.id === e.from),
        z = board.nodes.find(n => n.id === e.to);
      return a && z
        ? `<line x1="${a.x + a.width / 2}" y1="${a.y + a.height / 2}" x2="${z.x + z.width / 2}" y2="${z.y + z.height / 2}" stroke="var(--text-3)" stroke-width="${Math.max(1, 1 / scale)}"/>`
        : '';
    })
    .join('')}${nodes
    .map(
      n =>
        `<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="8" fill="${colors[n.color]}" fill-opacity="${n.type === 'group' ? '.12' : '.4'}" stroke="${colors[n.color]}" stroke-width="${Math.max(1, 1 / scale)}"/>${labels.has(n.id) ? `<text x="${n.x + 6 / scale}" y="${n.y + 14 / scale}" fill="var(--text)" font-size="${10 / scale}">${esc(labels.get(n.id))}</text>` : ''}`,
    )
    .join(
      '',
    )}</g>${!board.nodes.length ? '<path d="M116 36h28v28h-28zM108 45h-6v27h27v-5" fill="none" stroke="var(--border-strong)" stroke-width="2"/>' : ''}</svg>`;
}
function accessBadge(b) {
  const p = D().projects.find(p => p.id === b.project);
  const restricted = p && (p.access ? p.access === 'private' : p.private === true);
  const label = !b.project
    ? T('Workspace members', 'Участникам пространства')
    : restricted
      ? T('Restricted project', 'Закрытый проект')
      : T('Project access', 'Доступ проекта');
  return `<span class="whiteboard-access-badge" title="${esc(b.project ? T('Inherits the current project permissions', 'Наследует текущие права проекта') : T('Visible within this workspace', 'Виден в этом рабочем пространстве'))}">${ic(restricted ? 'lock-keyhole' : 'users', 12)}${label}${!canEdit(b) || b.archived ? ' · ' + T('View only', 'Просмотр') : ''}</span>`;
}
function actions(b) {
  return `<details class="ui-menu diagram-view-menu whiteboard-document-menu" ${disclosureAttributes('whiteboard-document:' + b.id)}><summary class="ibtn" aria-label="${esc(T('Whiteboard actions', 'Действия с холстом') + ': ' + b.name)}">${ic('ellipsis', 16)}</summary><div><strong class="whiteboard-menu-heading" translate="no">${T('Whiteboard', 'Холст')}</strong><button data-a="copyWhiteboardLink" data-id="${esc(b.id)}">${ic('link', 14)}${T('Copy link', 'Скопировать ссылку')}</button>${canEdit(b) ? `${!b.archived ? `<button data-a="editWhiteboardDocument" data-id="${esc(b.id)}">${ic('pencil', 14)}${T('Settings', 'Настройки')}</button>` : ''}<button data-a="toggleWhiteboardArchive" data-id="${esc(b.id)}">${ic(b.archived ? 'archive-restore' : 'archive', 14)}${b.archived ? T('Restore', 'Вернуть') : T('Archive', 'Архивировать')}</button>` : ''}</div></details>`;
}
export function pageWhiteboards() {
  const state = whiteboardCatalogState();
  if (state.restoreScroll)
    requestAnimationFrame(() => {
      if (S.ui.route === 'whiteboards') {
        const el = document.getElementById('main-content');
        if (el) el.scrollTop = state.scroll || 0;
        state.restoreScroll = false;
      }
    });
  const project = S.ui.params.project || state.project;
  const all = whiteboardDocuments(D()).filter(canRead),
    q = state.query.trim().toLocaleLowerCase();
  const filtered = all.filter(
    b =>
      !!b.archived === (state.archive === 'archived') &&
      (!project || (project === 'none' ? !b.project : b.project === project)) &&
      (!q || [b.name, b.desc, projectName(b)].some(s => s.toLocaleLowerCase().includes(q))),
  );
  filtered.sort((a, b) => (state.sort === 'name' ? a.name.localeCompare(b.name) : String(b.editedAt || b.at).localeCompare(String(a.editedAt || a.at))));
  const shown = filtered.slice(0, state.limit),
    projects = D().projects.filter(p => !p.archived);
  return `<div class="whiteboards-page" translate="no"><header class="whiteboards-heading"><div><h1>${T('Whiteboards', 'Холсты')}</h1><p class="hint">${T('Ideas, plans and visual connections in your workspace.', 'Идеи, планы и визуальные связи в рабочем пространстве.')}</p></div>${['admin', 'editor'].includes(S.ui.currentUser?.role) ? `<button class="btn btn-primary" data-a="newWhiteboard" ${project && project !== 'none' ? `data-project="${esc(project)}"` : ''}>${ic('plus', 15)}${T('New whiteboard', 'Новый холст')}</button>` : ''}</header>${collectionToolbar(`<label class="whiteboards-search">${ic('search', 15)}<input class="input" aria-label="${T('Search whiteboards', 'Поиск холстов')}" placeholder="${T('Search whiteboards', 'Поиск холстов')}" data-in="whiteboardsFilter" data-field="query" value="${esc(state.query)}"></label><button class="btn btn-secondary whiteboards-filter-trigger" data-a="whiteboardCatalogFilters">${ic('sliders-horizontal', 15)}${T('Filters', 'Фильтры')}${project || state.archive ? ' · ' + (Number(!!project) + Number(!!state.archive)) : ''}</button><div class="whiteboards-desktop-filters">${whiteboardCatalogControls(state, project, projects)}</div>`, T('Whiteboard search and filters', 'Поиск и фильтры холстов'), 'whiteboards-filters')}<p class="hint" role="status">${q || project || state.archive ? `<button class="btn btn-ghost btn-sm" data-a="resetWhiteboardCatalog">${T('Clear filters', 'Сбросить фильтры')}</button> ` : ''}${T('Shown', 'Показано')} ${shown.length} / ${filtered.length}</p><div class="whiteboards-grid" data-view="${state.view}">${shown.map(b => `<article class="whiteboard-document-card"><button class="whiteboard-document-open" data-a="openWhiteboardDocument" data-id="${esc(b.id)}">${preview(b)}<div class="whiteboard-document-info"><h2>${esc(b.name)}</h2>${b.desc ? `<p>${esc(b.desc)}</p>` : ''}<span class="hint">${esc(projectName(b))} · ${C(whiteboardCatalogInfo(b.id)?.cards ?? b.whiteboard.nodes.length, 'card')} · ${C(whiteboardCatalogInfo(b.id)?.connections ?? b.whiteboard.edges.length, 'connection')}</span>${accessBadge(b)}<small class="hint">${esc(ago(new Date(b.editedAt || b.at).getTime()))}${b.archived ? ' · ' + T('Archived', 'В архиве') : ''}</small></div></button><div class="whiteboard-document-actions">${materialFavorite('whiteboard', b)}${actions(b)}</div></article>`).join('')}</div>${!shown.length ? `<div class="whiteboards-empty">${ic('panels-top-left', 32)}<h2>${q ? T('No whiteboards match this search', 'По этому запросу холстов нет') : project || state.archive ? T('No matching whiteboards', 'Подходящих холстов нет') : T('Start with a blank canvas', 'Начните с чистого холста')}</h2> ${q ? `<button class="btn btn-secondary" data-a="clearWhiteboardQuery">${T('Clear search', 'Очистить поиск')}</button>` : project || state.archive ? `<button class="btn btn-secondary" data-a="resetWhiteboardCatalog">${T('Clear filters', 'Сбросить фильтры')}</button>` : `<p>${T('Create an independent whiteboard, or associate it with a project to inherit its access.', 'Создайте самостоятельный холст или свяжите его с проектом, чтобы наследовать его доступ.')}</p>`}</div>` : ''}${filtered.length > shown.length ? `<button class="btn btn-secondary" data-a="moreWhiteboards">${T('Show more', 'Показать ещё')}</button>` : ''}</div>`;
}
A.toggleCanvasToolbar = el => {
  S.ui.canvasToolsFor = S.ui.canvasToolsFor === el.dataset.id ? null : el.dataset.id;
  render();
};
export function pageWhiteboard() {
  const b = whiteboardDocument(D(), S.ui.params.id);
  if (!canRead(b)) return page404();
  const loading = demandWhiteboard(b.id);
  if (loading)
    return `<section class="whiteboard-page" translate="no"><button class="btn btn-ghost" data-a="go" data-r="whiteboards">${T('Whiteboards', 'Холсты')}</button><h1>${esc(b.name)}</h1><p role="status">${loading.error ? T('Could not load the whiteboard. Check synchronization and retry.', 'Не удалось загрузить холст. Проверьте синхронизацию и повторите.') : T('Loading whiteboard…', 'Загрузка холста…')}</p>${loading.error ? `<button class="btn btn-secondary" data-a="retryWhiteboardContent">${T('Try again', 'Повторить')}</button>` : ''}</section>`;

  return `<div class="whiteboard-page ${S.ui.canvasToolsFor === b.id ? 'show-toolbox' : ''}" translate="no"><header class="whiteboard-document-heading"><button class="btn btn-ghost btn-sm" data-a="go" data-r="whiteboards">${ic('arrow-left', 15)}${T('Whiteboards', 'Холсты')}</button><div><h1>${esc(b.name)}</h1><p class="hint">${esc(projectName(b))} · ${accessBadge(b)}${b.archived ? ' · ' + T('Archived', 'В архиве') : ''}</p></div><button class="ibtn canvas-toolbar-toggle" data-a="toggleCanvasToolbar" data-id="${esc(b.id)}" aria-expanded="${S.ui.canvasToolsFor === b.id}" aria-controls="whiteboard-edit-toolbar" aria-label="${T('Canvas tools', 'Инструменты холста')}" title="${T('Canvas tools', 'Инструменты холста')}">${ic('sliders-horizontal', 16)}</button>${actions(b)}</header>${b.desc ? `<details class="whiteboard-description"><summary>${T('Description', 'Описание')}</summary><p>${esc(b.desc)}</p></details>` : ''}${projectWhiteboard(b)}</div>`;
}
