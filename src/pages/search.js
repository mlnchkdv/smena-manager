/* ---------- SEARCH RESULTS ---------- */
import { ago, esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { D, S, mem, pColor, proj, task } from '../core/store.js';
import { searchAll } from '../core/search.js';
import { FT, av, empty, pIcon, pStatus, stIcon } from '../ui/helpers.js';
import { knowledgeExcerpt } from '../shared/knowledge-search.js';
import { highlightKnowledge } from '../ui/knowledge-highlight.js';
import { fileCatalogInfo } from '../core/file-catalog-state.js';
import { folderTrail } from '../shared/knowledge-tools.js';
import { t } from '../core/i18n.js';
import { disclosureAttributes } from '../ui/disclosure.js';
import { materialLocation } from '../ui/material-location.js';
import { knowledgeCategoryLabel } from '../ui/knowledge-category.js';
import { recentSearches, rememberSearch, clearSearchHistory } from '../core/search-history.js';
import { A, KEY } from '../actions/actions.js';
import { render } from '../shell/render.js';
A.clearSearchHistory = () => {
  clearSearchHistory();
  render();
  document.getElementById('search-page-q')?.focus();
};
KEY.rememberSearch = () => {
  rememberSearch(S.ui.searchQ);
  render();
  document.getElementById('search-page-q')?.focus();
};
const hl = highlightKnowledge;

export function pageSearch() {
  const inputQuery = String(S.ui.searchQ || '');
  const q = inputQuery.trim();
  const context = JSON.stringify([q.toLocaleLowerCase(), S.ui.workspaceRevision]);
  if (S.ui.searchPageContext !== context) S.ui.searchOffsets = {};
  S.ui.searchPageContext = context;
  const offsets = (S.ui.searchOffsets ||= {}),
    totals = {};
  const r = searchAll(q, { totals, offsets });
  const demandFiles = fileCatalogInfo()?.mode === 'demand';
  const folderMap = new Map(D().knowledgeFolders.map(folder => [folder.id, folder]));
  const cat = S.ui.searchCat;
  const cats = [
    ['all', 'All'],
    ['tasks', 'Tasks'],
    ['projects', 'Projects'],
    ['people', 'People'],
    ['files', 'Files'],
    ['comments', 'Comments'],
    ['knowledge', 'Knowledge base'],
    ['bookmarks', 'Bookmarks'],
  ];
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  const visibleTotal = cat === 'all' ? total : totals[cat] || 0;
  const pager = k =>
    totals[k] > 30 && !(k === 'files' && demandFiles)
      ? `<nav class="row" aria-label="Pagination"><button class="btn btn-secondary btn-sm" data-a="searchPage" data-key="${k}" data-offset="${offsets[k] - 30}" ${!offsets[k] ? 'disabled' : ''}>Previous</button><span class="hint num">${offsets[k] + 1}–${offsets[k] + r[k].length} / ${totals[k]}</span><button class="btn btn-secondary btn-sm" data-a="searchPage" data-key="${k}" data-offset="${offsets[k] + 30}" ${offsets[k] + 30 >= totals[k] ? 'disabled' : ''}>Next</button></nav>`
      : '';
  const sec = (k, title, html) =>
    (cat === 'all' || cat === k) && r[k].length
      ? `<section style="margin-bottom:22px" data-search-category="${k}"><div class="eyebrow" style="margin-bottom:6px"><span>${title}</span> · ${k === 'files' && demandFiles ? r[k].length : totals[k]}</div>${k === 'files' && demandFiles ? '<p class="hint">Use Files to search the complete file catalog.</p><button class="btn btn-secondary btn-sm" data-a="searchAllFileResults">Show all files</button>' : ''}<div class="panel" style="overflow:hidden">${html}</div>${pager(k)}</section>`
      : '';
  return `<div class="page search-page" style="max-width:860px">
    <div class="inwrap search-input-wrap" style="margin-bottom:14px">${ic('search', 16)}<input class="input input-lg" id="search-page-q" data-in="searchQ" data-key-enter="rememberSearch" placeholder="Search tasks, projects, knowledge, bookmarks, and files" value="${esc(inputQuery)}" style="padding-left:34px;padding-right:44px;font-size:16px" aria-label="Search">${inputQuery ? `<button class="ibtn search-clear" data-a="clearSearchInput" data-input="search-page-q" aria-label="Clear search">${ic('x', 16)}</button>` : ''}</div>
    <div class="search-navigation"><div class="tabs search-category-tabs" role="group" aria-label="Search categories">${cats.map(([k, n]) => `<button class="tab ${cat === k ? 'on' : ''}" aria-pressed="${cat === k}" data-a="set" data-k="searchCat" data-v="${k}">${n}<span class="cnt">${k === 'all' ? total : totals[k] || 0}${demandFiles && ['all', 'files'].includes(k) ? '+' : ''}</span></button>`).join('')}</div>
    <div class="search-category-picker"><label class="sr" for="search-category">Search categories</label><select class="select" id="search-category" data-in="searchCategory" aria-label="Search categories">${cats.map(([k, n]) => `<option value="${k}" ${cat === k ? 'selected' : ''} translate="no">${esc(t(n))} · ${k === 'all' ? total : totals[k] || 0}${demandFiles && ['all', 'files'].includes(k) ? '+' : ''}</option>`).join('')}</select></div>
    ${q ? `<details class="ui-menu search-tools" ${disclosureAttributes('search:tools')}><summary id="search-tools-summary" aria-label="Search tools" title="Search tools">${ic('ellipsis', 18)}</summary><div class="ui-menu-content">${demandFiles ? '<button class="btn btn-ghost btn-sm" data-a="searchAllFileResults">Show all files</button>' : ''}<button class="btn btn-ghost btn-sm" data-a="searchInGraph">Search in graph</button><p class="hint">Search results are paged. File results continue in Files.</p></div></details>` : ''}</div>
    ${
      !q
        ? `<div class="row" style="gap:6px;flex-wrap:wrap"><span class="faint" style="font-size:12.5px">Recent:</span>${recentSearches()
            .map(s => `<button class="badge" data-a="setSearch" data-q="${esc(s)}" translate="no">${ic('history', 11)}${esc(s)}</button>`)
            .join(
              '',
            )}${recentSearches().length ? '<button class="btn btn-ghost btn-sm" data-a="clearSearchHistory">Clear search history</button>' : ''}</div><p class="hint">Search history is private to your account on this device.</p>`
        : visibleTotal
          ? sec(
              'tasks',
              'Tasks',
              r.tasks
                .map(
                  t =>
                    `<div class="mini" data-a="openTask" data-id="${t.id}">${stIcon(t.status)}<span class="mono faint" style="font-size:11px" translate="no">${esc(t.key)}</span><span class="tt" translate="no">${hl(t.title, q)}</span><span class="pj" translate="no"><span class="pdot" style="--c:${pColor(proj(t.project))}"></span>${esc(proj(t.project).name)}</span>${av(t.assignee, 'sm')}</div>`,
                )
                .join(''),
            ) +
            sec(
              'projects',
              'Projects',
              r.projects
                .map(
                  p =>
                    `<div class="mini" data-a="go" data-r="project" data-id="${p.id}">${pIcon(p, '', 13)}<span class="tt" translate="no">${hl(p.name, q)} <span class="faint" style="font-size:12px">${p.desc ? `— ${esc(p.desc.slice(0, 70))}${p.desc.length > 70 ? '…' : ''}` : ''}</span></span>${pStatus(p.status)}</div>`,
                )
                .join(''),
            ) +
            sec(
              'people',
              'People',
              r.people
                .map(
                  m =>
                    `<div class="mini" data-a="go" data-r="member" data-id="${m.id}">${av(m.id, 'md', false)}<span class="tt" translate="no">${hl(m.name, q)} <span class="faint" style="font-size:12px">${esc(m.title)}</span></span><span class="faint" style="font-size:12px" translate="no">${esc(m.email)}</span></div>`,
                )
                .join(''),
            ) +
            sec(
              'files',
              'Files',
              r.files
                .map(f => {
                  const meta = FT[f.type] || FT.other;
                  const project = proj(f.project);
                  return `<div class="mini" data-a="previewFile" data-id="${f.id}"><span class="ftype" style="--c:${meta.c}">${ic(meta.i, 14)}</span><span class="tt" translate="no">${hl(f.name, q)}</span><span class="faint" style="font-size:12px" translate="no">${esc(f.size || '')}${project ? ` · ${esc(project.name)}` : ''}</span></div>`;
                })
                .join(''),
            ) +
            sec(
              'comments',
              'Comments',
              r.comments
                .map(
                  c =>
                    `<div class="mini" style="align-items:flex-start;padding-top:10px;padding-bottom:10px" data-a="openTask" data-id="${c.task}">${av(c.by, 'sm')}<div class="grow" style="min-width:0"><div style="font-size:12px" class="muted"><b style="color:var(--text);font-weight:500" ${mem(c.by) ? 'translate="no"' : ''}>${esc(mem(c.by)?.name || 'Unknown member')}</b> · <span translate="no">${esc(task(c.task)?.title || '')}</span> · ${ago(c.at)}</div><div style="font-size:13px" translate="no">${hl(c.text, q)}</div></div></div>`,
                )
                .join(''),
            ) +
            sec(
              'knowledge',
              'Knowledge base',
              r.knowledge
                .map(
                  note =>
                    `<div class="mini search-note-result"><button class="search-note-open" data-a="goKnowledgeNote" data-id="${note.id}">${ic('file-text', 15)}<span class="tt"><span ${note.title ? 'translate="no"' : ''}>${highlightKnowledge(note.title || 'Untitled note', q)}</span> <span class="faint" style="font-size:12px" translate="no">— ${highlightKnowledge(knowledgeExcerpt(note, q, 120), q)}</span></span></button><div class="search-result-location">${
                      note.folderId && folderMap.has(note.folderId)
                        ? materialLocation(
                            folderTrail(note.folderId, folderMap)
                              .map(folder => folder.name)
                              .join(' / '),
                            `search:${note.id}`,
                          )
                        : `<span translate="no">${esc(knowledgeCategoryLabel(note.category))}</span>`
                    }</div></div>`,
                )
                .join(''),
            ) +
            sec(
              'bookmarks',
              'Bookmarks',
              r.bookmarks
                .map(link => {
                  let host = link.site_name || '';
                  try {
                    host ||= new URL(link.url).hostname.replace(/^www\./, '');
                  } catch {
                    host ||= link.url;
                  }
                  return `<div class="mini" data-a="goBookmark" data-id="${link.id}">${ic('bookmark', 15)}<span class="tt" translate="no">${hl(link.title || host, q)} <span class="faint" style="font-size:12px">— ${hl((link.description || link.url || '').slice(0, 90), q)}</span></span><span class="faint" style="font-size:12px" translate="no">${esc(host)}</span></div>`;
                })
                .join(''),
            )
          : `<div class="panel">${empty('search-x', demandFiles && ['all', 'files'].includes(cat) ? 'No matches in loaded results' : 'No results found', demandFiles && ['all', 'files'].includes(cat) ? 'Use Files to search the complete file catalog.' : 'Try another category or a broader search term.', `<button class="btn btn-secondary btn-sm" data-a="setSearch" data-q="">Clear search</button>`)}</div>`
    }
  </div>`;
}
