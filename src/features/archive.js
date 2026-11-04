import { trashLocation } from '../shared/trash-recovery.js';
import { listWindow } from '../shared/list-window.js';
import { paginationHtml } from '../ui/pagination.js';
import { t, isRussian } from '../core/i18n.js';
import { readLayoutPreference, writeLayoutPreference } from '../core/view-layout-preferences.js';
import { A } from '../actions/actions.js';
import { render } from '../shell/render.js';
const archiveCategories = ['overview', 'tasks', 'projects', 'trash'];
A.archiveCategory = el => {
  if (!archiveCategories.includes(el.dataset.category)) return;
  writeLayoutPreference('archive-category', el.dataset.category);
  render();
};
/* ---------- archive ---------- */
import { ago, esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { PSTAT } from '../core/constants.js';
import { D, S, canSee, proj } from '../core/store.js';
import { empty, pIcon, stIcon } from '../ui/helpers.js';
import { actionLabel } from '../ui/action-label.js';

export function pageArchive() {
  const stored = readLayoutPreference('archive-category', 'overview');
  const tab = archiveCategories.includes(stored) ? stored : 'overview';
  const ts = D()
    .tasks.filter(t => t.archived && canSee(proj(t.project)) && !proj(t.project)?.archived)
    .sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0));
  const ps = D().projects.filter(p => p.archived);
  const trash = [...(D().trash || [])].sort((a, b) => Number(b.deletedAt || 0) - Number(a.deletedAt || 0));
  const query = String(S.ui.trashQuery || '').toLocaleLowerCase();
  const context = S.ui.trashContext || '';
  const filtered = trash.filter(
    item =>
      (!S.ui.trashKind || item.kind === S.ui.trashKind) &&
      (!context || trashLocation(item, D()) === context) &&
      (!S.ui.trashPeriod || Date.now() - Number(item.deletedAt || 0) <= Number(S.ui.trashPeriod) * 86400000) &&
      (!query || `${item.name} ${trashLocation(item, D())}`.toLocaleLowerCase().includes(query)),
  );
  const pageKey = `trash:${query}:${S.ui.trashKind || ''}:${context}:${S.ui.trashPeriod || ''}`;
  const page = listWindow(filtered, S.ui.listPages?.[pageKey], 50);
  const locations = [...new Set(trash.map(item => trashLocation(item, D())).filter(Boolean))].sort();
  const filters = `<div class="trash-filters"><input class="input" data-in="trashQuery" value="${esc(S.ui.trashQuery || '')}" placeholder="Search trash" aria-label="Search trash"><select class="select" data-in="trashFilter" data-field="trashKind" aria-label="Material type"><option value="">All types</option>${['task', 'project', 'note', 'bookmark', 'file'].map(kind => `<option value="${kind}" ${S.ui.trashKind === kind ? 'selected' : ''}>${t({ task: 'Task', project: 'Project', note: 'Note', bookmark: 'Bookmark', file: 'File' }[kind])}</option>`).join('')}</select><select class="select" data-in="trashFilter" data-field="trashContext" aria-label="Original location"><option value="">All locations</option>${locations.map(path => `<option value="${esc(path)}" ${context === path ? 'selected' : ''} translate="no">${esc(path)}</option>`).join('')}</select><select class="select" data-in="trashFilter" data-field="trashPeriod" aria-label="Deleted during"><option value="">Any date</option><option value="7" ${S.ui.trashPeriod === '7' ? 'selected' : ''}>Last 7 days</option><option value="30" ${S.ui.trashPeriod === '30' ? 'selected' : ''}>Last 30 days</option></select></div><p class="hint num" role="status">${page.total} / ${trash.length}</p>`;
  const row = (lead, title, sub, when, restoreAct, delAct, id) =>
    `<article class="mini" style="min-height:52px;cursor:default;gap:12px" aria-label="${esc(title)}">${lead}<div class="grow" style="min-width:0"><div class="trunc" style="font-weight:500" translate="no">${esc(title)}</div><div class="faint trunc" style="font-size:12px">${sub}</div></div><span class="faint hide-m" style="font-size:12px;white-space:nowrap">${when}</span><button class="btn btn-secondary btn-sm" data-a="${restoreAct}" data-id="${esc(id)}" aria-label="${actionLabel('Restore', title, id)}">${ic('rotate-ccw', 13)}Restore</button><button class="ibtn ibtn-sm" data-a="${delAct}" data-id="${esc(id)}" data-tip="Delete permanently" aria-label="${actionLabel('Delete permanently', title, id)}" style="color:var(--red)">${ic('trash-2', 15)}</button></article>`;
  const trashNames = { task: 'Task', project: 'Project', note: 'Note', bookmark: 'Bookmark', file: 'File' };
  const overview = `<section class="panel archive-overview" style="padding:16px"><h2>${isRussian() ? 'Восстановление материалов' : 'Recover materials'}</h2><p>${isRussian() ? 'Выберите раздел сверху. Архивные материалы и корзина хранятся отдельно; перед окончательным удалением приложение запросит подтверждение.' : 'Choose a category above. Archived work and trash are separate; permanent deletion requires confirmation.'}</p>${
    trash.length
      ? `<h3>${isRussian() ? 'Недавно в корзине' : 'Recently deleted'}</h3><ul class="archive-recent">${trash
          .slice(0, 3)
          .map(item => `<li><span translate="no">${esc(item.name)}</span><small>${item.deletedAt ? ago(item.deletedAt) : ''}</small></li>`)
          .join(
            '',
          )}</ul><button class="btn btn-secondary btn-sm" data-a="archiveCategory" data-category="trash">${isRussian() ? 'Открыть корзину' : 'Browse trash'}</button>`
      : `<p class="hint">${isRussian() ? 'Корзина пуста.' : 'Trash is empty.'}</p>`
  }</section>`;
  const body =
    tab === 'overview'
      ? overview
      : tab === 'trash'
        ? page.total
          ? `<div class="panel" style="overflow:hidden">${page.items.map(item => row(ic(item.kind === 'project' ? 'folder-kanban' : item.kind === 'file' ? 'paperclip' : item.kind === 'note' ? 'file-text' : item.kind === 'bookmark' ? 'bookmark' : 'circle-check', 15), item.name, `${t(trashNames[item.kind] || 'Item')} · ${esc(trashLocation(item, D()) || t('No folder'))}`, item.deletedAt ? 'Deleted ' + ago(item.deletedAt) : 'Deleted', 'restoreTrash', 'purgeTrash', item.id)).join('')}</div>`
          : `<div class="panel">${empty('trash-2', trash.length ? 'No matching items' : 'Trash is empty', trash.length ? 'Change the search or filters.' : 'Deleted tasks, projects, notes, bookmarks, and files will appear here.', '')}</div>`
        : tab === 'tasks'
          ? ts.length
            ? `<div class="panel" style="overflow:hidden">${ts
                .map(t => {
                  const p = proj(t.project);
                  return row(
                    stIcon(t.status, 15),
                    t.title,
                    `<span class="mono">${t.key}</span> · ${esc(p.name)}`,
                    t.archivedAt ? 'Archived ' + ago(t.archivedAt) : 'Archived',
                    'restoreTask',
                    'purgeTask',
                    t.id,
                  );
                })
                .join('')}</div>`
            : `<div class="panel">${empty('archive', 'No archived tasks', 'Archive finished or abandoned tasks to keep boards focused. They wait here until you restore them.', '')}</div>`
          : ps.length
            ? `<div class="panel" style="overflow:hidden">${ps.map(p => row(pIcon(p, '', 14), p.name, `${D().tasks.filter(t => t.project === p.id).length} tasks · ${PSTAT[p.status].name}`, p.archivedAt ? 'Archived ' + ago(p.archivedAt) : 'Archived', 'restoreProject', 'delProject', p.id)).join('')}</div>`
            : `<div class="panel">${empty('archive', 'No archived projects', 'Archived projects disappear from the sidebar and project lists but keep every task, file, and comment.', '')}</div>`;
  return `<div class="page" style="max-width:900px">
    <div class="ph"><div><h1>Archive</h1><p>Archived work is hidden everywhere else. Restore it any time, or delete it for good.</p></div></div>
    <div class="tabs" style="margin-bottom:14px" role="tablist" aria-label="Archive">${[
      ['overview', 'Overview', ts.length + ps.length + trash.length],
      ['tasks', 'Tasks', ts.length],
      ['projects', 'Projects', ps.length],
      ['trash', 'Trash', trash.length],
    ]
      .map(
        ([k, n, c]) =>
          `<button role="tab" aria-selected="${tab === k}" class="tab ${tab === k ? 'on' : ''}" data-a="archiveCategory" data-category="${k}">${n}<span class="cnt">${c}</span></button>`,
      )
      .join('')}</div>
    ${tab === 'trash' ? filters : ''}${body}${tab === 'trash' ? paginationHtml(page, pageKey) : ''}
  </div>`;
}
