/* ---------------- COMMAND PALETTE ---------------- */
import { MOD, clamp, esc } from '../core/utils.js';
import { LOGO, ic, wsLogo } from '../core/icons.js';
import { PSTAT } from '../core/constants.js';
import { D, S, allTasks, canSee, pColor, proj, task, visibleProjects } from '../core/store.js';
import { recentSearches, rememberSearch } from '../core/search-history.js';
import { FT, av, hl, stIcon } from '../ui/helpers.js';
import { effectiveDark } from '../core/theme.js';
import { go, render } from '../shell/render.js';
import { sortTasks, viewOf } from '../shell/view-engine.js';
import { searchAll } from '../core/search.js';
import { t as tr, workspaceRoleLabel } from '../core/i18n.js';
import { openModal } from './modals.js';
import { A } from '../actions/actions.js';

export function commands() {
  return [
    { id: 'c-task', name: 'Create task', icon: 'plus', kbd: 'N', run: () => A.newTask(document.body) },
    { id: 'c-proj', name: 'Create project', icon: 'folder-plus', kbd: 'P', run: () => A.newProject() },
    {
      id: 'c-search',
      name: 'Search workspace',
      icon: 'search',
      kbd: '/',
      run: () => {
        S.ui.palette = { q: '', mode: 'search', scope: 'all', hl: 0 };
        render();
      },
    },
    { id: 'c-home', name: 'Go to Home', icon: 'house', kbd: 'G H', run: () => go('home') },
    { id: 'c-inbox', name: 'Go to Inbox', icon: 'inbox', kbd: 'G I', run: () => go('inbox') },
    { id: 'c-my', name: 'Go to My Tasks', icon: 'circle-check', kbd: 'G T', run: () => go('mytasks') },
    { id: 'c-projs', name: 'Go to Projects', icon: 'folder-kanban', kbd: 'G P', run: () => go('projects') },
    { id: 'c-cal', name: 'Go to Calendar', icon: 'calendar', kbd: 'G C', run: () => go('calendar') },
    { id: 'c-tl', name: 'Go to Timeline', icon: 'chart-gantt', run: () => go('timeline') },
    { id: 'c-knowledge', name: 'Go to Knowledge base', icon: 'library-big', run: () => go('knowledge') },
    { id: 'c-bookmarks', name: 'Go to Bookmarks', icon: 'bookmark', run: () => go('bookmarks') },
    { id: 'c-files', name: 'Go to Files', icon: 'files', run: () => go('files') },
    { id: 'c-graph', name: 'Go to Graph', icon: 'network', run: () => go('graph') },
    { id: 'c-mem', name: 'Go to Members', icon: 'users', run: () => go('members') },
    { id: 'c-set', name: 'Open settings', icon: 'settings', kbd: 'G S', run: () => go('settings') },
    { id: 'c-app', name: 'Appearance settings', icon: 'palette', run: () => go('settings', { sec: 'appearance' }) },
    {
      id: 'c-ws',
      name: 'Switch workspace…',
      icon: 'arrow-left-right',
      run: () => {
        S.ui.palette = { q: '', mode: 'ws', hl: 0 };
        render();
        void import('../ui/workspaces.js').then(module => module.refreshWorkspaces());
      },
    },
    {
      id: 'c-dark',
      name: effectiveDark() ? 'Switch to light mode' : 'Switch to dark mode',
      icon: effectiveDark() ? 'sun' : 'moon',
      kbd: MOD + ' ⇧ L',
      run: () => A.toggleDark(),
    },
    { id: 'c-inv', name: 'Invite member', icon: 'user-plus', run: () => A.invite() },
    { id: 'c-side', name: 'Toggle sidebar', icon: 'panel-left', kbd: '[', run: () => A.toggleSide() },
    { id: 'c-keys', name: 'Keyboard shortcuts', icon: 'keyboard', kbd: '?', run: () => A.shortcuts() },
    { id: 'c-out', name: 'Sign out', icon: 'log-out', run: () => A.signOut() },
  ];
}
export function paletteItems() {
  const pl = S.ui.palette;
  const q = pl.q.trim();
  const ql = q.toLowerCase();
  const groups = [];
  if (pl.mode === 'ws') {
    groups.push({
      name: 'Switch workspace',
      items: (S.ui.availableWorkspaces || [])
        .filter(w => !w.archived && (!q || `${w.name} ${w.url}`.toLowerCase().includes(ql)))
        .map(w => ({
          html: `${wsLogo({ ...w, name: w.name || '?' }, 20)}`,
          name: w.id === S.ui.activeWorkspace ? D().ws.name : w.name,
          authoredName: true,
          sub: `${w.url} · ${workspaceRoleLabel(w.role)}`,
          authoredSub: true,
          run: () => A.switchWs({ dataset: { v: w.id } }),
        })),
    });
    return groups;
  }
  if (pl.mode === 'cmd') {
    const cmds = commands().filter(c => !q || c.name.toLowerCase().includes(ql));
    if (!q) {
      groups.push({ name: 'Suggestions', items: cmds.slice(0, 3).concat(cmds.filter(c => c.id === 'c-dark' || c.id === 'c-ws')) });
      const recent = sortTasks(
        allTasks().filter(t => t.assignee === D().me || t.fav),
        { f: 'updated', dir: 1 },
      ).slice(0, 4);
      groups.push({
        name: 'Recent tasks',
        items: recent.map(t => ({
          html: stIcon(t.status),
          name: t.title,
          authoredName: true,
          sub: proj(t.project).name,
          authoredSub: true,
          r: t.key,
          run: () => A.openTask({ dataset: { id: t.id } }),
        })),
      });
      groups.push({ name: 'Navigation', items: cmds.filter(c => c.id.startsWith('c-') && c.name.startsWith('Go to')) });
      return groups;
    }
    if (cmds.length) groups.push({ name: 'Commands', items: cmds.slice(0, 5) });
  }
  const r = searchAll(q);
  const sc = pl.mode === 'search' ? pl.scope : 'all';
  const lim = sc === 'all' ? 4 : 12;
  if (pl.mode === 'search' && !q) {
    const projects = visibleProjects().filter(canSee);
    const project = projects.find(project => S.ui.route === 'project' && project.id === S.ui.params.id) || projects[0];
    const openProject = (tab, highPriority = false) => {
      const current = project && proj(project.id);
      if (!current || current.archived || !canSee(current)) return go('projects');
      if (highPriority) {
        const view = viewOf('p:' + current.id);
        view.q = '';
        view.filters = [{ f: 'priority', op: 'is', v: ['urgent', 'high'] }];
      }
      go('project', { id: current.id, tab });
    };
    groups.push({
      name: 'Recent searches',
      items: recentSearches().map(s => ({
        icon: 'history',
        name: s,
        authoredName: true,
        run: () => {
          pl.q = s;
          pl.hl = 0;
          render();
        },
      })),
    });
    groups.push({
      name: 'Suggested',
      items: [
        { icon: 'clock-alert', name: 'Overdue tasks', run: () => A.goTasks({ dataset: { f: 'overdue' } }) },
        { icon: 'user', name: 'Tasks assigned to me', run: () => go('mytasks') },
        ...(project
          ? [
              { icon: 'signal-high', name: `${tr('High priority in')} ${project.name}`, authoredName: true, run: () => openProject('list', true) },
              { icon: 'paperclip', name: `${tr('Files in')} ${project.name}`, authoredName: true, run: () => openProject('files') },
            ]
          : []),
      ],
    });
    return groups;
  }
  if (!q) return groups;
  if (sc === 'all' || sc === 'tasks')
    groups.push({
      name: 'Tasks',
      items: r.tasks
        .slice(0, lim)
        .map(t => ({
          html: stIcon(t.status),
          name: t.title,
          authoredName: true,
          sub: proj(t.project).name,
          authoredSub: true,
          r: t.key,
          run: () => A.openTask({ dataset: { id: t.id } }),
        })),
    });
  if (sc === 'all' || sc === 'projects')
    groups.push({
      name: 'Projects',
      items: r.projects.slice(0, lim).map(p => ({
        html: `<span class="pdot" style="--c:${pColor(p)}"></span>`,
        name: p.name,
        authoredName: true,
        sub: PSTAT[p.status].name,
        run: () => go('project', { id: p.id }),
      })),
    });
  if (sc === 'all' || sc === 'people')
    groups.push({
      name: 'People',
      items: r.people
        .slice(0, lim)
        .map(m => ({ html: av(m.id, 'sm', false), name: m.name, authoredName: true, sub: m.title, authoredSub: true, run: () => go('member', { id: m.id }) })),
    });
  if (sc === 'all' || sc === 'files')
    groups.push({
      name: 'Files',
      items: r.files.slice(0, lim).map(f => ({
        icon: FT[f.type].i,
        name: f.name,
        authoredName: true,
        sub: proj(f.project).name,
        authoredSub: true,
        r: f.size,
        run: () => openModal({ type: 'filePreview', file: f, tid: f.task }),
      })),
    });
  if (sc === 'all' || sc === 'comments')
    groups.push({
      name: 'Comments',
      items: r.comments
        .slice(0, lim)
        .map(c => ({
          html: av(c.by, 'sm', false),
          name: c.text,
          authoredName: true,
          sub: task(c.task).title,
          authoredSub: true,
          run: () => A.openTask({ dataset: { id: c.task } }),
        })),
    });
  if (sc === 'all' || sc === 'knowledge')
    groups.push({
      name: 'Knowledge base',
      items: r.knowledge.slice(0, lim).map(note => ({
        icon: 'file-text',
        name: note.title || 'Untitled note',
        authoredName: !!note.title,
        sub: note.summary || note.category || 'Knowledge base',
        authoredSub: !!(note.summary || note.category),
        run: () => A.goKnowledgeNote({ dataset: { id: note.id } }),
      })),
    });
  if (sc === 'all' || sc === 'bookmarks')
    groups.push({
      name: 'Bookmarks',
      items: r.bookmarks.slice(0, lim).map(link => ({
        icon: 'bookmark',
        name: link.title || link.url,
        authoredName: true,
        sub: link.site_name || link.url,
        authoredSub: true,
        run: () => A.goBookmark({ dataset: { id: link.id } }),
      })),
    });
  const out = groups.filter(g => g.items.length);
  out.push({
    name: '',
    items: [
      {
        icon: 'search',
        name: tr(`View all results for “${q}”`),
        authoredName: true,
        run: () => {
          S.ui.searchQ = q;
          S.ui.searchCat = sc;
          rememberSearch(q);
          go('search');
        },
      },
    ],
  });
  return out;
}
export function paletteHtml() {
  const pl = S.ui.palette;
  const groups = paletteItems();
  const flat = groups.flatMap(g => g.items);
  pl._flat = flat;
  pl.hl = clamp(pl.hl, 0, Math.max(flat.length - 1, 0));
  let idx = 0;
  const ph =
    pl.mode === 'search' ? 'Search tasks, projects, knowledge, bookmarks, and files…' : pl.mode === 'ws' ? 'Find a workspace…' : 'Type a command or search…';
  const inputLabel = pl.mode === 'search' ? 'Search workspace' : pl.mode === 'ws' ? 'Switch workspace' : 'Command menu';
  return `<div class="palette" role="dialog" aria-modal="true" aria-label="${esc(tr(inputLabel))}: ${esc(D().ws.name)}">
    <div class="pal-in">${ic(pl.mode === 'search' ? 'search' : 'command', 17)}${pl.mode !== 'cmd' ? `<span class="badge" style="flex-shrink:0">${pl.mode === 'search' ? 'Search' : 'Workspace'}</span>` : ''}<input id="pal-in" data-in="palQ" value="${esc(pl.q)}" placeholder="${ph}" aria-label="${esc(tr(inputLabel))}: ${esc(D().ws.name)}" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="pal-list" ${flat.length ? `aria-activedescendant="pi-${pl.hl}"` : ''}><kbd>Esc</kbd></div>
    <p class="hint" style="margin:6px 16px" translate="no">${esc(D().ws.name)} · ${esc(D().ws.url)}</p>
    ${
      pl.mode === 'search'
        ? `<div class="pal-scope" role="tablist">${[
            ['all', 'All', 'layers'],
            ['tasks', 'Tasks', 'circle-check'],
            ['projects', 'Projects', 'folder'],
            ['people', 'People', 'users'],
            ['files', 'Files', 'paperclip'],
            ['comments', 'Comments', 'message-square'],
            ['knowledge', 'Knowledge base', 'library-big'],
            ['bookmarks', 'Bookmarks', 'bookmark'],
          ]
            .map(([k, n, i]) => `<button role="tab" class="${pl.scope === k ? 'on' : ''}" data-a="palScope" data-v="${k}">${ic(i, 12)}${n}</button>`)
            .join('')}</div>`
        : ''
    }
    <div class="pal-list" id="pal-list" role="listbox">${
      flat.length
        ? groups
            .map(
              g =>
                `<div class="pal-group">${g.name ? `<div class="pal-sec">${g.name}</div>` : ''}${g.items
                  .map(it => {
                    const i = idx++;
                    return `<div class="pi ${i === pl.hl ? 'hl' : ''}" id="pi-${i}" role="option" aria-selected="${i === pl.hl}" data-a="palRun" data-i="${i}" data-hover-i="${i}">${it.html || ic(it.icon || 'circle', 15)}<span class="trunc" ${it.authoredName ? 'translate="no"' : ''}>${hl(it.name, pl.q.trim())}</span>${it.sub ? `<span class="sub" ${it.authoredSub ? 'translate="no"' : ''}>${esc(it.sub)}</span>` : ''}<span class="r">${it.r ? `<span class="mono" translate="no">${esc(it.r)}</span>` : ''}${
                      it.kbd
                        ? it.kbd
                            .split(' ')
                            .map(k => `<kbd>${k}</kbd>`)
                            .join('')
                        : ''
                    }</span></div>`;
                  })
                  .join('')}</div>`,
            )
            .join('')
        : `<div class="empty-state sm"><div class="glyph">${ic('search-x', 18)}</div><h2 class="es-h">No results found</h2><p>Try a different keyword, or press Tab to search everything.</p></div>`
    }</div>
    <div class="pal-f"><span><kbd>↑</kbd><kbd>↓</kbd>navigate</span><span><kbd>↵</kbd>select</span>${pl.mode === 'cmd' ? '<span><kbd>Tab</kbd>search mode</span>' : '<span><kbd>⌫</kbd>back to commands</span>'}<span class="sp" style="flex:1"></span><span>${LOGO(12)}</span></div>
  </div>`;
}
