/* ---------- SEARCH RESULTS ---------- */
import { ago, esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { D, S, mem, pColor, proj, task } from '../core/store.js';
import { searchAll } from '../core/search.js';
import { FT, av, empty, hl, pIcon, pStatus, stIcon } from '../ui/helpers.js';
import { knowledgeExcerpt } from '../shared/knowledge-search.js';
import { highlightKnowledge } from '../ui/knowledge-highlight.js';

export function pageSearch() {
  const inputQuery = String(S.ui.searchQ || '');
  const q = inputQuery.trim();
  const r = searchAll(q);
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
  const total = Object.values(r).reduce((a, b) => a + b.length, 0);
  const visibleTotal = cat === 'all' ? total : r[cat]?.length || 0;
  const sec = (k, title, html) =>
    (cat === 'all' || cat === k) && r[k].length
      ? `<section style="margin-bottom:22px"><div class="eyebrow" style="margin-bottom:6px"><span>${title}</span> · ${r[k].length}</div><div class="panel" style="overflow:hidden">${html}</div></section>`
      : '';
  return `<div class="page search-page" style="max-width:860px">
    <div class="inwrap search-input-wrap" style="margin-bottom:14px">${ic('search', 16)}<input class="input input-lg" id="search-page-q" data-in="searchQ" placeholder="Search tasks, projects, knowledge, bookmarks, and files" value="${esc(inputQuery)}" style="padding-left:34px;padding-right:44px;font-size:16px" aria-label="Search">${inputQuery ? `<button class="ibtn search-clear" data-a="clearSearchInput" data-input="search-page-q" aria-label="Clear search">${ic('x', 16)}</button>` : ''}</div>
    ${q ? '<div class="row" style="flex-wrap:wrap;margin-bottom:12px"><p class="hint grow">Showing up to 30 matches per category. Refine your search to find more.</p><button class="btn btn-secondary btn-sm" data-a="searchInGraph">Search in graph</button></div>' : ''}
    <div class="tabs" role="group" aria-label="Search categories" style="margin-bottom:18px">${cats.map(([k, n]) => `<button class="tab ${cat === k ? 'on' : ''}" aria-pressed="${cat === k}" data-a="set" data-k="searchCat" data-v="${k}">${n}<span class="cnt">${k === 'all' ? total : r[k].length}</span></button>`).join('')}</div>
    ${
      !q
        ? `<div class="row" style="gap:6px;flex-wrap:wrap"><span class="faint" style="font-size:12.5px">Recent:</span>${D()
            .recentSearches.map(s => `<button class="badge" data-a="setSearch" data-q="${esc(s)}" translate="no">${ic('history', 11)}${esc(s)}</button>`)
            .join('')}</div>`
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
                    `<div class="mini" data-a="goKnowledgeNote" data-id="${note.id}">${ic('file-text', 15)}<span class="tt"><span ${note.title ? 'translate="no"' : ''}>${highlightKnowledge(note.title || 'Untitled note', q)}</span> <span class="faint" style="font-size:12px" translate="no">— ${highlightKnowledge(knowledgeExcerpt(note, q, 120), q)}</span></span><span class="faint" style="font-size:12px" translate="no">${esc(D().knowledgeFolders.find(folder => folder.id === note.folderId)?.name || note.category || '')}</span></div>`,
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
          : `<div class="panel">${empty('search-x', 'No results found', 'Try another category or a broader search term.', `<button class="btn btn-secondary btn-sm" data-a="setSearch" data-q="">Clear search</button>`)}</div>`
    }
  </div>`;
}
