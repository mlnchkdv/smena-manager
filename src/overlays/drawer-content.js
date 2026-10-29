/* =====================================================================
   OVERLAYS: drawer, modals, popovers, context menus, command palette
   ===================================================================== */
import { MOD, TODAY, ago, diffD, esc, fmtDate, parse, relDate } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { D, S, commentsOf, isOver, mem, pColor, proj, task, teamsList } from '../core/store.js';
import { FT, av, filePrev, fileType, fmtComment, lbl, progBar } from '../ui/helpers.js';
import { fxc } from '../shell/render.js';
import { cellAssignee, cellDue, cellPrio, cellProject, cellStatus } from '../components/task-list.js';
import { modalHtml } from './modal-content.js';
import { popHtml } from './popover-content.js';
import { paletteHtml } from './palette.js';
import { subtaskHtml } from '../features/subtasks.js';
import { activityExtra, isRussian, t as tr } from '../core/i18n.js';
import { safeRichText } from '../ui/rich-text.js';
import { relationsPanel } from '../ui/relations.js';
import { noteEditor } from '../ui/knowledge-editor.js';
import { knowledgeReadingSource } from '../shared/knowledge-markdown.js';
import { knowledgeReadingHtml } from '../ui/knowledge-reading.js';
import { knowledgeContext } from '../ui/knowledge-context.js';
import { knowledgeMetadata } from '../ui/knowledge-metadata.js';
import { knowledgePreviewNavigation } from '../shared/knowledge-preview-navigation.js';
import { redundantMarkdownSummary } from '../shared/markdown-text.js';
import { knowledgeOutline } from '../ui/knowledge-outline.js';

export function renderLayer() {
  const u = S.ui;
  let h = '';
  if (u.drawer && task(u.drawer))
    h += (u.drawerFull ? `<div class="drawer-scrim full${u.fx.drawer ? ' enter' : ''}" data-a="closeDrawer"></div>` : '') + drawerHtml(task(u.drawer));
  const knowledgeNote = u.knowledgeDrawer && (D().knowledgeNotes || []).find(note => note.id === u.knowledgeDrawer);
  if (knowledgeNote) h += knowledgeDrawerHtml(knowledgeNote);
  u.modals.forEach((m, i) => {
    const en = u.fx.modal === i + 1;
    const covered = i < u.modals.length - 1;
    h += `<div class="scrim${en ? ' enter' : ''}" data-a="closeModal" style="z-index:${60 + i * 2}"></div><div class="modal-wrap" data-a="closeModalBg" style="z-index:${61 + i * 2}"${covered ? ' aria-hidden="true" inert' : ''}>${en ? modalHtml(m).replace('class="modal ', 'class="modal enter ') : modalHtml(m)}</div>`;
  });
  if (u.palette) h += `<div class="scrim" data-a="closePalette" style="z-index:89"></div>${paletteHtml()}`;
  if (u.pop) h += popHtml(u.pop);
  return h;
}

export function knowledgeDrawerHtml(note) {
  const readOnly = S.ui.currentUser?.role === 'viewer';
  const folders = Array.isArray(D().knowledgeFolders) ? D().knowledgeFolders : [];
  const preview = S.ui.knowledgeDrawerView !== 'edit';
  const previewSource = knowledgeReadingSource(note);
  const previewMarkup = knowledgeReadingHtml(note, previewSource);
  const updated = typeof note.updatedAt === 'number' ? note.updatedAt : Date.parse(note.updatedAt || '');
  const navigation = preview
    ? knowledgePreviewNavigation(S.ui.knowledgePreviewContext, {
        owner: S.ui.currentUser?.id,
        workspace: D().ws.id || D().ws.url,
        notes: D().knowledgeNotes,
        activeId: note.id,
      })
    : null;
  const pager =
    (S.ui.knowledgeWikiTrail?.length
      ? `<button class="ibtn knowledge-reader-back" data-a="backKnowledgeWiki" aria-label="Back to source note" title="Back to source note">${ic('arrow-left', 15)}</button>`
      : '') +
    (navigation?.total > 1
      ? `<div class="knowledge-preview-pager" role="group" aria-label="Notes on this page"><button id="knowledge-preview-previous" class="ibtn ibtn-sm" data-a="stepKnowledgePreview" data-direction="previous" aria-label="Previous note" title="Previous note" ${navigation.previous ? '' : 'disabled'}>${ic('chevron-left', 16)}</button><span id="knowledge-preview-position" class="knowledge-preview-position num" tabindex="-1" aria-live="polite" aria-atomic="true"><span class="sr">Notes on this page</span> ${navigation.index + 1} / ${navigation.total}</span><button id="knowledge-preview-next" class="ibtn ibtn-sm" data-a="stepKnowledgePreview" data-direction="next" aria-label="Next note" title="Next note" ${navigation.next ? '' : 'disabled'}>${ic('chevron-right', 16)}</button></div>`
      : '');
  const previewBody = `<section class="knowledge-quick-preview"><h1 class="knowledge-reader-title" translate="no">${esc(note.title || tr('Untitled note'))}</h1><div class="knowledge-quick-preview-meta">${ic('clock-3', 13)}<span>Updated ${ago(Number.isFinite(updated) ? updated : Date.now())}</span>${note.updatedBy && mem(note.updatedBy) ? `<span translate="no">· ${esc(mem(note.updatedBy).name)}</span>` : ''}</div>${note.summary && !(note.sourceFormat === 'text' ? previewSource.includes(note.summary) : redundantMarkdownSummary(note.summary, previewSource)) ? `<p class="knowledge-quick-summary" translate="no">${esc(note.summary)}</p>` : ''}<div class="knowledge-quick-content" translate="no">${previewMarkup || '<p class="faint">No content yet.</p>'}</div>${knowledgeMetadata(note)}</section>`;
  const editAction =
    preview && !readOnly
      ? `<button class="ibtn ibtn-sm knowledge-preview-edit" data-a="editKnowledgeNote" aria-label="Edit note" title="Edit note">${ic('pencil', 15)}</button>`
      : '';
  const favorite = readOnly
    ? ''
    : `<button class="ibtn ibtn-sm knowledge-reader-favorite" data-a="toggleKnowledgeFavorite" data-id="${note.id}" aria-label="${note.favorite ? 'Remove from favorites' : 'Add to favorites'}" aria-pressed="${!!note.favorite}" style="${note.favorite ? 'color:var(--amber)' : ''}">${ic('star', 15)}</button>`;
  const outline = preview
    ? knowledgeOutline(
        previewMarkup,
        readOnly
          ? ''
          : `<button class="btn btn-ghost" data-a="toggleKnowledgeFavorite" data-id="${note.id}" aria-pressed="${!!note.favorite}">${ic('star', 15)}<span>${note.favorite ? 'Remove from favorites' : 'Add to favorites'}</span></button>`,
      )
    : '';
  return `<div class="drawer-scrim full knowledge-drawer-scrim${S.ui.fx.knowledgeDrawer ? ' enter' : ''}" data-a="closeKnowledgeDrawer"></div><aside class="drawer full knowledge-drawer${S.ui.fx.knowledgeDrawer ? ' enter' : ''}" role="dialog" aria-modal="true" aria-labelledby="knowledge-drawer-title" tabindex="-1">
    <div class="drawer-h${preview ? ' knowledge-reader-head' : ''}"><span class="knowledge-drawer-brand">${ic('library', 15)}<span>Knowledge base</span></span><span class="faint">/</span><span class="mono faint trunc" id="knowledge-drawer-title" translate="no">${esc(note.title || 'Untitled note')}</span><span class="sp"></span><span class="knowledge-reader-tools">${pager}${editAction}${outline || favorite}</span><button class="ibtn ibtn-sm knowledge-reader-close" data-a="closeKnowledgeDrawer" data-tip="Close  Esc" aria-label="Close">${ic('x', 16)}</button></div>
    <div class="drawer-b knowledge-drawer-body" data-keep="knowledge-drawer:${note.id}">${preview ? previewBody + knowledgeContext(note) : noteEditor(note, folders, readOnly)}</div>
  </aside>`;
}

/* ---------------- TASK DRAWER ---------------- */
export function drawerHtml(t) {
  const p = proj(t.project);
  const u = S.ui;
  const cs = commentsOf(t.id);
  const sd = t.subtasks.filter(s => s.done).length;
  const acts = D().activity.filter(a => a.task === t.id);
  const tab = u.drawerTab;
  const prop = (icon, label, val) => `<dt>${ic(icon, 14)}${label}</dt><dd>${val}</dd>`;
  const ups = (u.uploads || []).filter(x => x.task === t.id);
  const sub = u.subOpen && u.subOpen.tid === t.id ? t.subtasks.find(s => s.id === u.subOpen.sid) : null;
  return `<aside class="drawer ${u.drawerFull ? 'full' : ''} ${u.fx.drawer ? 'enter' : ''} ${u.fx.tabs ? 'fx-tabs' : ''}" role="dialog" aria-modal="${u.drawerFull}" aria-labelledby="d-h" tabindex="-1">
    <h2 class="sr" id="d-h">${sub ? 'Subtask: ' + esc(sub.title) : 'Task: ' + esc(t.title)}</h2>
    <div class="drawer-h">
      <button class="pillbtn" data-a="go" data-r="project" data-id="${p.id}" data-tab="board" style="font-size:12.5px"><span class="pdot" style="--c:${pColor(p)}"></span>${esc(p.name)}</button><span class="faint">/</span><span class="mono faint" style="font-size:11.5px;padding:0 6px">${t.key}</span>
      <span class="sp"></span>
      <button class="btn btn-sm task-completion-action ${t.status === 'done' ? 'btn-secondary' : 'btn-ghost'}" data-a="toggleDone" data-id="${t.id}" aria-label="${t.status === 'done' ? 'Reopen task' : 'Mark complete'}" title="${t.status === 'done' ? 'Reopen task' : 'Mark complete'}" style="${t.status === 'done' ? 'color:var(--green)' : ''}">${ic(t.status === 'done' ? 'circle-check' : 'circle', 14)}<span class="hide-m">${t.status === 'done' ? 'Completed' : 'Mark complete'}</span></button>
      <button class="ibtn ibtn-sm" data-a="toggleFavTask" data-id="${t.id}" data-tip="${t.fav ? 'Unfavorite' : 'Favorite'}" aria-pressed="${t.fav}" aria-label="Favorite" style="${t.fav ? 'color:var(--amber)' : ''}">${ic('star', 15)}</button>
      <button class="ibtn ibtn-sm" data-a="copyLink" data-id="${t.id}" data-tip="Copy link" aria-label="Copy link">${ic('link', 15)}</button>
      <button class="ibtn ibtn-sm hide-m" data-a="toggleDrawerFull" data-tip="${u.drawerFull ? 'Side panel' : 'Full page'}" aria-label="Toggle full page">${ic(u.drawerFull ? 'minimize-2' : 'maximize-2', 15)}</button>
      <button class="ibtn ibtn-sm" data-a="ctxBtn" data-ctx="task" data-id="${t.id}" aria-label="More">${ic('ellipsis', 15)}</button>
      <button class="ibtn ibtn-sm" data-a="closeDrawer" data-tip="Close  Esc" aria-label="Close">${ic('x', 16)}</button>
    </div>
    <div class="drawer-b" data-keep="drawer:${t.id}${sub ? ':' + sub.id : ''}">${
      sub
        ? subtaskHtml(t, sub)
        : `
      ${t.status === 'done' ? `<div class="alert ok" style="margin-bottom:12px">${ic('circle-check', 15)}<span>Completed ${t.completedAt ? ago(t.completedAt) : ''}. <button class="link" data-a="toggleDone" data-id="${t.id}">Reopen task</button></span></div>` : isOver(t) ? `<div class="alert danger" style="margin-bottom:12px">${ic('clock-alert', 15)}<span>Overdue by ${-diffD(parse(t.due), TODAY)} day${-diffD(parse(t.due), TODAY) > 1 ? 's' : ''}. <button class="link" data-a="pop" data-pop="date" data-field="due" data-id="${t.id}">Reschedule</button></span></div>` : ''}
      <textarea class="ttl-edit" id="d-title" rows="1" data-autosize data-blur="commitDrawerTitle" data-key-enter="blur" data-id="${t.id}" aria-label="Task title">${esc(t.title)}</textarea>
      <dl class="kv task-properties" style="margin-top:12px">
        ${prop('circle-dot', 'Status', cellStatus(t))}
        ${prop('signal-high', 'Priority', cellPrio(t))}
        ${prop('user', 'Assignee', cellAssignee(t))}
        ${prop('calendar', 'Due date', cellDue(t))}
        ${prop('calendar-arrow-up', 'Start date', `<button class="pillbtn ${t.start ? '' : 'empty'}" data-a="pop" data-pop="date" data-field="start" data-id="${t.id}">${ic('calendar', 13)}${t.start ? fmtDate(t.start) : 'Set date'}</button>`)}
        ${prop('folder', 'Project', cellProject(t))}
        ${prop('tag', 'Labels', `<button class="pillbtn ${t.labels.length ? '' : 'empty'}" data-a="pop" data-pop="labels" data-id="${t.id}" style="flex-wrap:wrap;height:auto;min-height:26px;padding:3px 7px">${t.labels.length ? t.labels.map(lbl).join('') : ic('tag', 13) + 'Add labels'}</button>`)}
        ${prop('repeat', 'Repeat', `<button class="pillbtn ${t.recur ? '' : 'empty'}" data-a="pop" data-pop="recur" data-id="${t.id}">${ic('repeat', 13)}${t.recur || 'Does not repeat'}</button>`)}
        ${prop('timer', 'Estimate', `<button class="pillbtn ${t.estimate ? '' : 'empty'}" data-a="pop" data-pop="estimate" data-id="${t.id}">${ic('timer', 13)}${t.estimate ? esc(t.estimate) : 'Add estimate'}</button>`)}
        ${prop('git-branch', 'Blocked by', `<button class="pillbtn ${t.deps.length ? '' : 'empty'}" data-a="pop" data-pop="deps" data-id="${t.id}" style="height:auto;min-height:26px;flex-wrap:wrap">${t.deps.length ? t.deps.map(d => (task(d) ? `<span class="depchip mono" style="font-size:11px;padding:1px 5px;border-radius:4px;background:var(--surface-3)">${task(d).key}</span><span class="trunc" style="max-width:160px">${esc(task(d).title)}</span>` : '')).join('') : ic('git-branch', 13) + 'None'}</button>`)}
      </dl>

      <div class="dsec"><div class="dsec-h"><h3 id="d-desc-l">Description</h3><div class="rte-tb" role="toolbar" aria-label="Formatting" aria-controls="d-desc">
          ${[
            ['bold', 'bold', 'Bold'],
            ['italic', 'italic', 'Italic'],
            ['insertUnorderedList', 'list', 'Bulleted list'],
            ['insertOrderedList', 'list-ordered', 'Numbered list'],
            ['formatBlock:h4', 'heading', 'Heading'],
            ['createLink', 'link', 'Link'],
          ]
            .map(([c, i, n]) => `<button class="ibtn ibtn-xs" data-cmd="${c}" data-tip="${n}" aria-label="${n}">${ic(i, 13)}</button>`)
            .join('')}
        </div></div>
        <div class="rte"><div class="rte-body" id="d-desc" contenteditable="true" data-rte="${t.id}" data-ph="${esc(tr('Add a description…'))}" role="textbox" aria-multiline="true" aria-labelledby="d-desc-l" translate="no">${safeRichText(t.desc)}</div></div>
      </div>

      <div class="dsec"><div class="dsec-h"><h3>Subtasks</h3><span class="cnt num">${sd}/${t.subtasks.length}</span>${t.subtasks.length ? `<span style="width:90px;display:flex">${progBar(Math.round((sd / t.subtasks.length) * 100), sd === t.subtasks.length ? 'green' : '')}</span>` : ''}</div>
        ${t.subtasks.map(s => `<div class="subt ${s.done ? 'done' : ''}${fxc('added', s.id)}${fxc('done', s.id)}"><input type="checkbox" class="check" ${s.done ? 'checked' : ''} data-a="toggleSub" data-id="${t.id}" data-sid="${s.id}" aria-label="${s.done ? 'Reopen' : 'Complete'} subtask ${esc(s.title)}"><button class="s" data-a="openSub" data-id="${t.id}" data-sid="${s.id}" translate="no">${esc(s.title)}</button>${s.due ? `<span class="due ${!s.done && diffD(parse(s.due), TODAY) < 0 ? 'over' : ''}">${ic('calendar', 12)}${relDate(s.due)}</span>` : ''}${s.assignee ? av(s.assignee, 'sm') : ''}<button class="ibtn ibtn-xs x" data-a="openSub" data-id="${t.id}" data-sid="${s.id}" aria-label="Open subtask details" tabindex="-1">${ic('chevron-right', 14)}</button></div>`).join('')}
        <div class="subt" style="color:var(--text-3)">${ic('plus', 15)}<input class="inline-in" id="d-sub" data-key-enter="addSub" data-id="${t.id}" placeholder="Add subtask" aria-label="Add subtask" style="font-size:13.5px"></div>
      </div>

      <div class="dsec"><div class="dsec-h"><h3>Attachments</h3><span class="cnt">${t.attachments.length}</span><div class="acts"><label class="btn btn-sm btn-ghost" style="cursor:pointer">${ic('upload', 13)}Upload<input type="file" multiple hidden data-in="uploadFiles" data-task="${t.id}" data-project="${t.project}"></label></div></div>
        ${ups.map(x => `<div class="upl" style="margin-bottom:6px"><span class="ftype" style="--c:${FT[fileType(x.name)].c}">${ic(FT[fileType(x.name)].i, 14)}</span><div class="grow"><div class="row"><span class="trunc" translate="no">${esc(x.name)}</span><span class="sp"></span><span class="faint num" id="upct-${x.id}" style="font-size:11px">${x.pct}%</span></div><div class="prog" style="margin-top:5px"><i id="upbar-${x.id}" style="width:${x.pct}%"></i></div></div></div>`).join('')}
        ${t.attachments.length ? `<div class="att">${t.attachments.map(f => `<div class="attc" data-a="filePreview" data-tid="${t.id}" data-aid="${f.id}" role="button" tabindex="0">${filePrev(f)}<div class="fi"><div class="trunc" style="font-weight:500">${esc(f.name)}</div><div class="faint">${FT[f.type]?.n || 'File'} · ${f.size}</div></div><button class="ibtn ibtn-xs x" data-a="rmAttach" data-id="${t.id}" data-aid="${f.id}" aria-label="Remove attachment">${ic('x', 12)}</button></div>`).join('')}</div>` : !ups.length ? `<label class="dropzone" style="padding:12px" data-dropzone-task="${t.id}">${ic('paperclip', 15)}<span>Drop files or click to attach</span><input type="file" multiple hidden data-in="uploadFiles" data-task="${t.id}" data-project="${t.project}"></label>` : ''}
      </div>

      ${relationsPanel(`task:${t.id}`)}
      <div class="dsec">
        <div class="tabs" style="margin-bottom:6px">${[
          ['comments', `Comments`, cs.length],
          ['activity', 'Activity', acts.length],
        ]
          .map(
            ([k, n, c]) =>
              `<button class="tab ${tab === k ? 'on' : ''}" data-a="set" data-k="drawerTab" data-v="${k}">${n}<span class="cnt">${c}</span></button>`,
          )
          .join('')}</div>
        ${
          tab === 'comments'
            ? `
          ${cs.length ? cs.map(commentHtml).join('') : `<p class="faint" style="font-size:13px;margin:10px 0">No comments yet. Start the conversation.</p>`}
          <div class="row" style="align-items:flex-start;gap:10px;margin-top:8px">${av(D().me, 'md', false)}<div class="grow" style="position:relative">
            <div class="cbox"><textarea id="d-cmt" data-in="draft" data-id="${t.id}" data-key-mod-enter="postComment" placeholder="Leave a comment… type @ to mention" aria-label="Comment" rows="2" data-autosize>${esc(u.drafts[t.id] || '')}</textarea>
            <div class="row"><button class="ibtn ibtn-xs" data-a="insertAt" data-id="${t.id}" data-tip="Mention someone" aria-label="Mention">${ic('at-sign', 14)}</button><label class="ibtn ibtn-xs" data-tip="Attach file" style="cursor:pointer">${ic('paperclip', 14)}<input type="file" multiple hidden data-in="uploadFiles" data-task="${t.id}" data-project="${t.project}"></label><span class="sp"></span><span class="faint hide-m" style="font-size:11px">${MOD}+Enter</span><button class="btn btn-primary btn-sm" data-a="postComment" data-id="${t.id}">Comment</button></div></div>
            ${mentionPicker(t.id)}
          </div></div>`
            : `
          <div style="padding-top:4px">${acts.map(a => `<div class="act-line"><span class="ico">${av(a.by, 'sm', false)}</span><span class="grow"><b>${esc(mem(a.by)?.id === D().me ? tr('You') : mem(a.by)?.name)}</b> ${esc(tr(a.verb.replace(/ of$/, '')))}${a.extra ? ' ' + esc(activityExtra(a.extra, a.verb)) : ''}</span><time class="faint" style="font-size:11.5px">${ago(a.at)}</time></div>`).join('')}
          <div class="act-line"><span class="ico">${ic('plus', 13)}</span><span class="grow">Task created</span><time class="faint" style="font-size:11.5px">${ago(t.created)}</time></div></div>`
        }
      </div>`
    }
    </div>
  </aside>`;
}

export function mentionPicker(taskId) {
  const query = S.ui.mention && S.ui.mention.tid === taskId ? S.ui.mention.q.trim().toLocaleLowerCase() : null;
  if (query === null) return '';
  const matches = [
    { id: 'workspace', name: isRussian() ? 'все' : 'workspace', title: 'Entire workspace', icon: 'building-2', kind: 'group' },
    ...teamsList().map(item => ({ id: item.id, name: item.name, title: 'Team', icon: item.icon, kind: 'group' })),
    ...D().members.map(item => ({ ...item, kind: 'member' })),
  ]
    .filter(item => {
      const name = item.name.toLocaleLowerCase();
      return !query || name.startsWith(query) || name.split(' ').some(part => part.startsWith(query));
    })
    .slice(0, 7);
  if (!matches.length) return '';
  return `<div class="pop mention-picker" style="position:absolute;top:auto;bottom:calc(100% + 4px);left:0">${matches
    .map(
      item =>
        `<button class="mi" data-a="pickMention" data-id="${taskId}" data-member="${esc(item.id)}" data-kind="${item.kind}" data-name="${esc(item.name)}">${item.kind === 'member' ? av(item.id, 'sm', false) : `<span class="av sm" style="--c:var(--accent)">${ic(item.icon, 12)}</span>`}<span translate="no">${esc(item.name)}</span><span class="r">${esc(item.title)}</span></button>`,
    )
    .join('')}</div>`;
}
export function commentHtml(c) {
  const m = mem(c.by);
  const mine = c.by === D().me;
  return `<div class="cmt">${av(c.by, 'md', false)}<div class="body"><div class="who"><b translate="no">${esc(m?.name)}</b><time>${ago(c.at)}</time>${mine ? `<span class="sp"></span><button class="ibtn ibtn-xs" data-a="delComment" data-id="${c.id}" aria-label="Delete comment" data-tip="Delete">${ic('trash-2', 12)}</button>` : ''}</div><div class="txt" translate="no">${fmtComment(c.text, c.mentions || [])}</div>
    <div class="reacts">${Object.entries(c.re || {})
      .filter(([, v]) => v.length)
      .map(
        ([e, v]) =>
          `<button class="react ${v.includes(D().me) ? 'mine' : ''}" data-a="react" data-id="${c.id}" data-e="${esc(e)}" aria-label="${esc(e)} ${v.length}" title="${esc(v.map(i => mem(i)?.name).join(', '))}">${esc(e)}<span class="num">${v.length}</span></button>`,
      )
      .join(
        '',
      )}<button class="react" data-a="pop" data-pop="emoji" data-id="${c.id}" aria-label="Add reaction" style="color:var(--text-3)">${ic('smile-plus', 13)}</button></div></div></div>`;
}
