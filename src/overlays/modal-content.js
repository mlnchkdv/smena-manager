/* ---------------- MODALS ---------------- */
import { MOD, TODAY, ago, diffD, esc, fmtDate, parse } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { PCOLORS, PICONS, PR, ST } from '../core/constants.js';
import { D, S, mem, pColor, proj, task, teamsList } from '../core/store.js';
import { FT, av, lbl, prPill, stPill } from '../ui/helpers.js';
import { ensureFilePreview } from '../core/file-preview.js';
import { render } from '../shell/render.js';
import { teamModal } from '../features/teams.js';
import { t as tr, templateText } from '../core/i18n.js';
import { relationPicker, relationsPanel } from '../ui/relations.js';
import { knowledgeImportReview } from '../ui/knowledge-import-review.js';
import { knowledgeMovePicker } from '../ui/knowledge-move-picker.js';
// Registered by the lazy file feature before a file dialog can be opened.
import { fileModalRenderers } from './modals.js';
import { TEMPLATES, SHORTCUTS } from './modal-data.js';

export function modalHtml(m) {
  const H = (title, sub = '') =>
    `<div class="modal-h"><div><h2 id="mt-${m.type}">${title}</h2>${sub ? `<div class="muted" style="font-size:12.5px;margin-top:2px">${sub}</div>` : ''}</div><button class="ibtn ibtn-sm" data-a="closeModal" aria-label="Close">${ic('x', 16)}</button></div>`;
  const wrap = (cls, inner) => `<div class="modal ${cls}" role="dialog" aria-modal="true" aria-labelledby="mt-${m.type}">${inner}</div>`;
  switch (m.type) {
    case 'fileFolderForm':
      return wrap('sm', fileModalRenderers.fileFolderForm(m, H));
    case 'fileMove':
      return wrap('file-move-dialog', fileModalRenderers.fileMove(m, H));
    case 'knowledgeMove':
      return wrap('knowledge-move-dialog', H('Move notes', 'Choose a destination, then confirm the move.') + knowledgeMovePicker(m));
    case 'relations':
      return wrap('md', relationPicker(m).replace('<h2>', '<h2 id="mt-relations">'));
    case 'syncRecovery': {
      const recovery = S.ui.syncRecovery;
      if (!recovery || recovery.owner !== S.ui.currentUser?.id) return '';
      const preview = value => esc(JSON.stringify(value || {}, null, 2).slice(0, 12000));
      return wrap(
        '',
        `${H('Review synchronization conflict', 'Download your local copy before choosing the server version.')}
        <div class="modal-b"><p>${esc(recovery.scope)} · ${tr('Conflicting fields')}: ${esc((recovery.conflicts || []).slice(0, 20).join(', '))}</p>
        <details open><summary>Local version</summary><pre translate="no" style="max-height:200px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere">${preview(recovery.data)}</pre></details>
        <details><summary>Server version</summary><pre translate="no" style="max-height:200px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere">${recovery.remote ? preview(recovery.remote) : tr('The latest server version will be fetched before applying.')}</pre></details>
        <p class="hint">The preview is limited. The download contains the complete recovery copy.</p></div>
        <div class="modal-f"><button class="btn btn-secondary" data-a="downloadSyncRecovery">Download local copy</button><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">Cancel</button><button class="btn btn-primary" data-a="reloadWorkspaceVersion">Load server version</button></div>`,
      );
    }
    case 'portableImport': {
      const preview = S.ui.importPreview;
      const { counts, report } = preview.result;
      const invalidFiles = preview.entries?.filter(entry => entry.error).length || 0;
      const canImport = ['notes', 'links', 'knowledgeFolders', 'linkFolders'].some(key => counts[key] > 0);
      return wrap(
        'knowledge-import-dialog',
        `${H('Import preview', 'Existing content is never replaced. A backup is created before importing.')}
        <div class="modal-b" aria-busy="${preview.busy}"><div class="grid2 knowledge-import-counts"><div>Notes: <b>${counts.notes}</b></div><div>Bookmarks: <b>${counts.links}</b></div><div>Skipped: <b>${counts.skipped}</b></div><div>Invalid: <b>${counts.invalid + invalidFiles}</b></div></div>
        ${knowledgeImportReview(preview, D().knowledgeFolders || [])}
        <label class="field"><span class="label">Conflicting notes</span><select class="select" data-in="importConflictPolicy" ${preview.busy ? 'disabled' : ''}><option value="copy" ${preview.policy === 'copy' ? 'selected' : ''}>Keep both copies</option><option value="skip" ${preview.policy === 'skip' ? 'selected' : ''}>Keep existing only</option></select></label>
        ${
          report.conflicts.length
            ? `<div class="panel" style="padding:12px;max-height:180px;overflow:auto">${report.conflicts
                .slice(0, 20)
                .map(item => `<div class="trunc" translate="no">${esc(item.title || item.sourceId || '')}</div>`)
                .join('')}</div>`
            : ''
        }
        </div><div class="modal-f"><button class="btn btn-secondary" data-a="downloadImportReport">Download report</button><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal" ${preview.busy ? 'disabled' : ''}>Cancel</button><button class="btn btn-primary" data-a="confirmPortableImport" ${preview.busy || !canImport ? 'disabled' : ''}>${preview.busy ? 'Importing notes…' : invalidFiles ? 'Import valid notes' : 'Import'}</button></div>`,
      );
    }
    case 'task':
      return wrap('', taskModal(m, H));
    case 'project':
      return wrap('', projectModal(m, H));
    case 'milestones':
      return wrap('', milestonesModal(m, H));
    case 'milestone':
      return wrap('sm', milestoneModal(m, H));
    case 'share':
      return wrap('', shareModal(m, H));
    case 'invite':
      return wrap('', inviteModal(m, H));
    case 'confirm':
      return wrap('sm', confirmModal(m, H));
    case 'prompt':
      return wrap(
        'sm',
        `${H(m.title)}<form class="modal-b" data-submit="promptSubmit"><div class="field"><label class="label" for="prompt-in">${esc(m.label)}</label><input class="input" id="prompt-in" value="${esc(m.value || '')}" autofocus></div></form><div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">Cancel</button><button class="btn btn-primary" data-a="promptSubmit">${esc(m.ok || 'Save')}</button></div>`,
      );
    case 'shortcuts':
      return wrap('lg', shortcutsModal(H));
    case 'team':
      return wrap('', teamModal(m, H));
    case 'filePreview':
      return wrap('lg', filePreviewModal(m, H));
    case 'saveView':
      return wrap(
        'sm',
        `${H('Save view', 'Save the current filters as a tab on this project.')}<form class="modal-b" data-submit="saveViewSubmit"><div class="field"><label class="label" for="sv-name">View name</label><input class="input" id="sv-name" placeholder="e.g. Design review queue" autofocus></div><div class="field"><label class="label" for="sv-type">Layout</label><select class="select" id="sv-type"><option value="list">List</option><option value="board">Board</option><option value="table">Table</option></select></div>${m.nf ? `<div class="hint">${m.nf} filter${m.nf > 1 ? 's' : ''} will be saved with this view.</div>` : '<div class="alert info">' + ic('info', 14) + '<span>No filters are active — the view will show all tasks. You can add filters after saving.</span></div>'}</form><div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">Cancel</button><button class="btn btn-primary" data-a="saveViewSubmit">Save view</button></div>`,
      );
  }
  return '';
}
export function formChip(pop, html, label, selectedLabel = label) {
  const accessibleName = selectedLabel == null ? '' : ` aria-label="${esc(tr(label))}: ${esc(selectedLabel)}"`;
  return `<button class="pillbtn bordered" data-a="pop" data-pop="${pop}" data-id="__form" ${pop === 'date' ? `data-field="${label}"` : ''}${accessibleName}>${html}</button>`;
}
export function taskModal(m, H) {
  const f = S.ui.form;
  const p = proj(f.project);
  const err = S.ui.errors.title;
  return `${H(m.edit ? 'Edit task' : 'New task', m.edit ? `<span class="mono">${task(m.edit)?.key}</span>` : '')}
  <form class="modal-b" data-submit="submitTask" style="gap:12px">
    <div class="field"><label class="sr" for="f-title">Task name</label><input class="input input-lg ${err ? 'is-error' : ''}" id="f-title" data-in="form" data-f="title" value="${esc(f.title)}" placeholder="Task name" autofocus aria-invalid="${!!err}" aria-describedby="f-title-err" style="font-size:15px;font-weight:500">${err ? `<span class="err" id="f-title-err">${ic('circle-alert', 12)}${err}</span>` : ''}</div>
    <div class="field"><label class="sr" for="f-desc">Description</label><textarea class="textarea" id="f-desc" data-in="form" data-f="desc" placeholder="Add a description… (optional)" rows="3">${esc(f.desc)}</textarea></div>
    <div class="row" style="flex-wrap:wrap;gap:6px">
      ${formChip('project', `<span class="pdot" style="--c:${pColor(p)}"></span>${esc(p?.name || 'Project')}`, 'Project', p?.name || 'Project')}
      ${formChip('status', stPill(f.status), 'Status', tr(ST[f.status]?.name || f.status))}
      ${formChip('assignee', `<span class="sr">${esc(tr('Assignee'))}: </span><span aria-hidden="true">${av(f.assignee, 'sm', false)}</span>${esc(mem(f.assignee)?.name || 'Assignee')}`, 'Assignee', null)}
      ${formChip('priority', prPill(f.priority), 'Priority', tr(PR[f.priority]?.name || f.priority))}
      ${formChip('date', `${ic('calendar', 13)}${f.due ? 'Due ' + fmtDate(f.due) : 'Due date'}`, 'due', null)}
      ${formChip('date', `${ic('calendar-arrow-up', 13)}${f.start ? 'Starts ' + fmtDate(f.start) : 'Start date'}`, 'start', null)}
      ${formChip('labels', f.labels.length ? f.labels.map(lbl).join('') : `${ic('tag', 13)}Labels`, 'Labels')}
      ${formChip('recur', `${ic('repeat', 13)}${f.recur || 'Repeat'}`, 'Repeat')}
    </div>
    <div class="field"><span class="label">Subtasks</span>
      ${f.subtasks.map((s, i) => `<div class="subt" style="padding:0 4px">${ic('circle', 13)}<span class="s" translate="no">${esc(s.title)}</span><button type="button" class="ibtn ibtn-xs x" style="opacity:1" data-a="formRmSub" data-i="${i}" aria-label="Remove">${ic('x', 12)}</button></div>`).join('')}
      <div class="inwrap">${ic('plus', 14)}<input class="input" id="f-sub" data-key-enter="formAddSub" placeholder="Add a subtask and press Enter"></div></div>
    <div class="field"><span class="label">Attachments</span>
      ${f.files.length ? `<div class="col" style="gap:4px">${f.files.map((x, i) => `<div class="upl" style="padding:6px 10px"><span class="ftype" style="--c:${FT[x.type].c};width:22px;height:22px">${ic(FT[x.type].i, 12)}</span><span class="grow trunc" translate="no">${esc(x.name)}</span><span class="faint" style="font-size:11.5px">${x.size}</span><button type="button" class="ibtn ibtn-xs" data-a="formRmFile" data-i="${i}" aria-label="Remove">${ic('x', 12)}</button></div>`).join('')}</div>` : ''}
      <label class="dropzone" style="padding:10px">${ic('paperclip', 14)}<span>Attach files</span><input type="file" multiple hidden data-in="formFiles"></label></div>
  </form>
  <div class="modal-f">${m.edit ? '' : `<label class="row" style="gap:8px;font-size:12.5px;color:var(--text-2);cursor:pointer"><input type="checkbox" class="toggle" id="f-more" data-in="formMore" ${f.more ? 'checked' : ''}>Create more</label>`}<span class="sp"></span>
    <span class="faint hide-m" style="font-size:11.5px"><kbd>${MOD}</kbd> <kbd>↵</kbd></span>
    <button class="btn btn-secondary" data-a="closeModal">Cancel</button><button class="btn btn-primary" data-a="submitTask" id="f-submit">${m.edit ? 'Save changes' : 'Create task'}</button></div>`;
}
export function projectModal(m, H) {
  const f = S.ui.pform;
  const err = S.ui.errors.pname;
  return `${H(m.edit ? 'Project settings' : 'New project', m.edit ? '' : 'Projects hold tasks, files, and conversations for one body of work.')}
  <form class="modal-b" data-submit="submitProject">
    <div class="row" style="gap:10px;align-items:flex-start">
      <button type="button" class="picon lg" style="--c:${PCOLORS[f.color]};cursor:default;flex-shrink:0;margin-top:22px" aria-hidden="true" tabindex="-1">${ic(f.icon, 18)}</button>
      <div class="field grow"><label class="label" for="p-name">Project name</label><input class="input ${err ? 'is-error' : ''}" id="p-name" data-in="pform" data-f="name" value="${esc(f.name)}" placeholder="e.g. Website Redesign" autofocus aria-invalid="${!!err}">${err ? `<span class="err">${ic('circle-alert', 12)}${err}</span>` : ''}</div>
    </div>
    <div class="field"><label class="label" for="p-desc">Description</label><textarea class="textarea" id="p-desc" data-in="pform" data-f="desc" rows="2" placeholder="What is this project about?">${esc(f.desc)}</textarea></div>
    <div class="row" style="gap:16px;align-items:flex-start;flex-wrap:wrap">
      <div class="field" style="flex:1;min-width:220px"><span class="label">Icon</span><div class="iconpick" role="radiogroup" aria-label="Icon">${PICONS.map(i => `<button type="button" role="radio" aria-checked="${f.icon === i}" class="${f.icon === i ? 'on' : ''}" data-a="pformSet" data-f="icon" data-v="${i}" aria-label="${i}">${ic(i, 15)}</button>`).join('')}</div></div>
      <div class="field"><span class="label">Color</span><div class="swatches" role="radiogroup" aria-label="Color" style="max-width:140px">${Object.entries(
        PCOLORS,
      )
        .map(
          ([k, v]) =>
            `<button type="button" role="radio" aria-checked="${f.color === k}" class="sw ${f.color === k ? 'on' : ''}" style="--c:${v};width:22px;height:22px" data-a="pformSet" data-f="color" data-v="${k}" aria-label="${k}">${f.color === k ? ic('check', 12) : ''}</button>`,
        )
        .join('')}</div></div>
    </div>
    <div class="row" style="gap:12px;flex-wrap:wrap">
      <div class="field" style="flex:1;min-width:150px"><label class="label" for="p-team">Team</label><select class="select" id="p-team" data-in="pform" data-f="team">${teamsList()
        .map(t => `<option value="${t.id}" ${f.team === t.id ? 'selected' : ''}>${t.name}</option>`)
        .join('')}</select></div>
      <div class="field" style="flex:1;min-width:150px"><label class="label" for="p-lead">Lead</label><select class="select" id="p-lead" data-in="pform" data-f="lead">${D()
        .members.filter(x => x.status === 'active')
        .map(x => `<option value="${x.id}" ${f.lead === x.id ? 'selected' : ''} translate="no">${esc(x.name)}</option>`)
        .join('')}</select></div>
      <div class="field" style="flex:1;min-width:150px"><label class="label" for="p-due">Target date</label><input type="date" class="input" id="p-due" data-in="pform" data-f="due" value="${f.due || ''}"></div>
    </div>
    ${m.edit ? '' : `<div class="field"><span class="label">Template</span><div class="tmpls" role="radiogroup">${TEMPLATES.map(t => `<button type="button" role="radio" aria-checked="${f.tmpl === t.id}" class="opt ${f.tmpl === t.id ? 'on' : ''}" data-a="pformSet" data-f="tmpl" data-v="${t.id}" style="padding:10px">${ic(t.icon, 16)}<b style="font-size:12.5px">${templateText(t.name)}</b><span>${t.tasks.length ? t.tasks.length + ' starter tasks' : templateText(t.desc)}</span></button>`).join('')}</div></div>`}
  </form>
  <div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">Cancel</button><button class="btn btn-primary" data-a="submitProject">${m.edit ? 'Save changes' : 'Create project'}</button></div>`;
}

function milestoneState(milestone) {
  if (milestone.completed) return ['done', 'Completed'];
  if (milestone.date && diffD(parse(milestone.date), TODAY) < 0) return ['overdue', 'Overdue'];
  return ['planned', 'Planned'];
}

export function milestonesModal(m, H) {
  const project = proj(m.id);
  if (!project) return '';
  const milestones = project.milestones || [];
  const editable = S.ui.currentUser?.role !== 'viewer';
  return `${H('Project milestones', `Plan key dates and outcomes for “${esc(project.name)}”.`)}
    <div class="modal-b milestone-manager">
      <div class="milestone-manager-summary"><span>${ic('diamond', 15)}</span><div><b>${milestones.length} milestones</b><p>Keep the project plan visible in the overview and timeline.</p></div></div>
      <div class="milestone-manager-list">
        ${
          milestones.length
            ? milestones
                .map((milestone, index) => {
                  const [state, label] = milestoneState(milestone);
                  return `<article class="milestone-manage-row ${milestone.completed ? 'is-complete' : ''}">
                    <input type="checkbox" class="check round" ${milestone.completed ? 'checked' : ''} ${editable ? `data-a="toggleMilestone" data-project="${project.id}" data-mid="${esc(milestone.id)}"` : 'disabled'} aria-label="${milestone.completed ? 'Reopen' : 'Mark'} ${esc(milestone.name)}${milestone.completed ? '' : ' complete'}">
                    <button type="button" class="milestone-manage-main" ${editable ? `data-a="editMilestone" data-project="${project.id}" data-mid="${esc(milestone.id)}"` : 'disabled'}>
                      <span class="milestone-manage-title">${esc(milestone.name)}</span>
                      ${milestone.description ? `<span class="milestone-manage-description trunc">${esc(milestone.description)}</span>` : ''}
                      <span class="milestone-manage-meta"><time>${fmtDate(milestone.date, true)}</time><span class="milestone-state ${state}">${label}</span></span>
                    </button>
                    ${
                      editable
                        ? `<div class="milestone-manage-actions"><button class="ibtn ibtn-xs" data-a="moveMilestone" data-project="${project.id}" data-mid="${esc(milestone.id)}" data-direction="-1" aria-label="Move milestone up" ${index === 0 ? 'disabled' : ''}>${ic('arrow-up', 13)}</button><button class="ibtn ibtn-xs" data-a="moveMilestone" data-project="${project.id}" data-mid="${esc(milestone.id)}" data-direction="1" aria-label="Move milestone down" ${index === milestones.length - 1 ? 'disabled' : ''}>${ic('arrow-down', 13)}</button><button class="ibtn ibtn-xs" data-a="editMilestone" data-project="${project.id}" data-mid="${esc(milestone.id)}" aria-label="Edit milestone">${ic('pencil', 13)}</button><button class="ibtn ibtn-xs danger" data-a="deleteMilestone" data-project="${project.id}" data-mid="${esc(milestone.id)}" aria-label="Delete milestone">${ic('trash-2', 13)}</button></div>`
                        : ''
                    }
                  </article>`;
                })
                .join('')
            : `<div class="milestone-manager-empty">${ic('diamond', 21)}<b>No milestones yet</b><span>Add the first key date for this project.</span></div>`
        }
      </div>
    </div>
    <div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">Close</button>${editable ? `<button class="btn btn-primary" data-a="newMilestone" data-project="${project.id}">${ic('plus', 14)}Add milestone</button>` : ''}</div>`;
}

export function milestoneModal(m, H) {
  const project = proj(m.project);
  const form = S.ui.milestoneForm;
  const nameError = S.ui.errors.milestoneName;
  const dateError = S.ui.errors.milestoneDate;
  return `${H(!m.milestoneId ? 'New milestone' : 'Edit milestone', project ? `Project “${esc(project.name)}”` : '')}
    <form class="modal-b" data-submit="submitMilestone">
      <div class="field"><label class="label" for="milestone-name">Milestone name</label><input class="input ${nameError ? 'is-error' : ''}" id="milestone-name" data-in="milestoneForm" data-f="name" value="${esc(form.name)}" placeholder="e.g. Public launch" autofocus aria-invalid="${!!nameError}">${nameError ? `<span class="err">${ic('circle-alert', 12)}${nameError}</span>` : ''}</div>
      <div class="field"><label class="label" for="milestone-description">Description</label><textarea class="textarea" id="milestone-description" data-in="milestoneForm" data-f="description" rows="3" placeholder="What should be achieved by this date?">${esc(form.description || '')}</textarea></div>
      <div class="field"><label class="label" for="milestone-date">Milestone date</label><input type="date" class="input ${dateError ? 'is-error' : ''}" id="milestone-date" data-in="milestoneForm" data-f="date" value="${esc(form.date || '')}" aria-invalid="${!!dateError}">${dateError ? `<span class="err">${ic('circle-alert', 12)}${dateError}</span>` : ''}</div>
      <label class="milestone-complete-toggle"><input type="checkbox" class="check round" id="milestone-completed" data-in="milestoneForm" data-f="completed" ${form.completed ? 'checked' : ''}><span><b>Completed</b><small>Mark this milestone as achieved.</small></span></label>
    </form>
    <div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">Cancel</button><button class="btn btn-primary" data-a="submitMilestone">${!m.milestoneId ? 'Add milestone' : 'Save changes'}</button></div>`;
}
export const PERMS = ['Can view', 'Can comment', 'Can edit', 'Full access'];
export function shareModal(m, H) {
  const p = proj(m.id);
  p.perms = p.perms || {};
  p.access = p.access || 'workspace';
  return `${H(`Share “${esc(p.name)}”`)}
  <div class="modal-b">
    <form class="row" style="gap:6px" data-submit="shareInvite"><div class="grow"><label class="sr" for="share-in">Invite by email</label><input class="input" id="share-in" placeholder="Add people by name or email" value="${esc(S.ui.shareQ || '')}" data-in="shareQ" autofocus></div>
      <select class="select" id="share-perm" style="width:132px" aria-label="Permission">${PERMS.map(x => `<option ${x === 'Can edit' ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <button class="btn btn-primary" data-a="shareInvite" type="button">Invite</button></form>
    ${
      S.ui.shareQ
        ? `<div class="panel" style="padding:4px">${
            D()
              .members.filter(
                x => !p.members.includes(x.id) && (x.name.toLowerCase().includes(S.ui.shareQ.toLowerCase()) || x.email.includes(S.ui.shareQ.toLowerCase())),
              )
              .map(
                x =>
                  `<button class="mi" data-a="shareAdd" data-id="${p.id}" data-mid="${x.id}">${av(x.id, 'sm', false)}${esc(x.name)}<span class="r" translate="no">${esc(x.email)}</span></button>`,
              )
              .join('') ||
            `<div class="mi faint" style="cursor:default">${S.ui.shareQ.includes('@') ? `Press Invite to send an invitation to ${esc(S.ui.shareQ)}` : 'No matching members — enter an email to invite someone new'}</div>`
          }</div>`
        : ''
    }
    <div><div class="eyebrow" style="margin-bottom:4px">People with access</div>
      ${p.members
        .map(id => {
          const x = mem(id);
          if (!x) return '';
          const perm = id === p.lead ? 'Full access' : p.perms[id] || (x.role === 'Guest' ? 'Can comment' : 'Can edit');
          return `<div class="row" style="height:44px">${av(id, 'md', false)}<div class="grow"><div style="font-weight:500;font-size:13px">${esc(x.name)}${id === D().me ? ' <span class="faint" style="font-weight:400">(you)</span>' : ''}</div><div class="faint" style="font-size:11.5px">${esc(x.email)}${id === p.lead ? ' · Project lead' : ''}</div></div>
          ${id === p.lead ? `<span class="muted" style="font-size:12.5px;padding-right:8px">Full access</span>` : `<select class="select" style="width:auto;height:26px;font-size:12px;border-color:transparent;background-color:transparent" data-in="sharePerm" data-id="${p.id}" data-mid="${id}" aria-label="Permission for ${esc(x.name)}">${PERMS.map(q => `<option ${q === perm ? 'selected' : ''}>${q}</option>`).join('')}<option value="__remove">Remove access</option></select>`}</div>`;
        })
        .join('')}
    </div>
    <div style="border-top:1px solid var(--divider);padding-top:12px"><div class="eyebrow" style="margin-bottom:8px">General access</div>
      <div class="row" style="gap:10px"><span class="ftype" style="--c:var(--text-2)">${ic(p.access === 'private' ? 'lock' : 'building-2', 14)}</span><div class="grow"><select class="select" style="height:28px;width:auto;border-color:transparent;padding-left:4px;font-weight:500" data-in="shareAccess" data-id="${p.id}" aria-label="General access"><option value="private" ${p.access === 'private' ? 'selected' : ''}>Only people invited</option><option value="workspace" ${p.access === 'workspace' ? 'selected' : ''}>Everyone at ${esc(D().ws.name)}</option></select><div class="faint" style="font-size:11.5px;padding-left:4px">${p.access === 'private' ? 'Only people listed above can open this project.' : 'Anyone in the workspace can view and comment.'}</div></div></div></div>
  </div>
  <div class="modal-f"><button class="btn btn-secondary" data-a="copyLink" data-pid="${p.id}">${ic('link', 14)}Copy link</button><span class="sp"></span><button class="btn btn-primary" data-a="closeModal">Done</button></div>`;
}
export function inviteModal(m, H) {
  const err = S.ui.errors.invite;
  return `${H('Add access to ' + esc(D().ws.name), "Enter team members' Google accounts. After saving, send them the sign-in link manually.")}
  <form class="modal-b" data-submit="submitInvite">
    <div class="field"><label class="label" for="inv-emails">Google account addresses</label><textarea class="textarea ${err ? 'is-error' : ''}" id="inv-emails" placeholder="name@company.com, another@company.com" rows="3" autofocus>${esc(S.ui.inviteDraft || '')}</textarea>${err ? `<span class="err">${ic('circle-alert', 12)}${err}</span>` : '<span class="hint">Separate multiple addresses with commas.</span>'}</div>
    <div class="row" style="gap:12px"><div class="field grow"><label class="label" for="inv-role">Role</label><select class="select" id="inv-role">${['Member', 'Admin', 'Guest'].map(r => `<option>${r}</option>`).join('')}</select></div>
    <div class="field grow"><label class="label" for="inv-team">Team</label><select class="select" id="inv-team">${teamsList()
      .map(t => `<option value="${t.id}">${t.name}</option>`)
      .join('')}</select></div></div>
    <div class="alert info">${ic('info', 14)}<span>Access becomes active immediately. Automatic invitation emails are not connected yet.</span></div>
  </form>
  <div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">Cancel</button><button class="btn btn-primary" data-a="submitInvite" id="inv-submit">Add access</button></div>`;
}
export function confirmModal(m) {
  const needs = m.typeName;
  const ok = !needs || (S.ui.confirmText || '') === needs;
  return `<div class="modal-b" style="padding-top:18px;gap:10px">
    <div class="row" style="gap:12px;align-items:flex-start"><span class="ftype" style="--c:${m.danger ? 'var(--red)' : 'var(--amber)'};width:34px;height:34px;border-radius:9px">${ic(m.icon || (m.danger ? 'trash-2' : 'archive'), 17)}</span>
    <div class="grow"><h2 id="mt-confirm" style="font-size:15px;font-weight:600;margin:4px 0 6px">${esc(m.title)}</h2><p class="muted" style="margin:0;font-size:13px;line-height:1.55">${m.body}</p></div></div>
    ${needs ? `<div class="field" style="margin-top:6px"><label class="label" for="confirm-in" style="font-weight:400;color:var(--text-2)">Type <b style="color:var(--text);font-weight:600">${esc(needs)}</b> to confirm</label><input class="input" id="confirm-in" data-in="confirmText" autocomplete="off" autofocus value="${esc(S.ui.confirmText || '')}"></div>` : ''}
  </div>
  <div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal" ${needs ? '' : 'autofocus'}>Cancel</button><button class="btn ${m.danger ? 'btn-danger' : 'btn-primary'}" data-a="confirmOk" ${ok ? '' : 'disabled'}>${esc(m.ok)}</button></div>`;
}
export function shortcutsModal(H) {
  return `${H('Keyboard shortcuts')}<div class="modal-b" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:22px">${SHORTCUTS.map(([g, list]) => `<div><div class="eyebrow" style="margin-bottom:6px">${g}</div>${list.map(([n, k]) => `<div class="row" style="height:30px;font-size:13px;border-bottom:1px solid var(--divider)"><span class="grow">${n}</span>${k.map((x, i) => `${i && k[0] === 'G' ? '<span class="faint" style="font-size:11px">then</span>' : ''}<kbd>${x}</kbd>`).join('')}</div>`).join('')}</div>`).join('')}</div>`;
}
export function filePreviewModal(m, H) {
  ensureFilePreview(m, render);
  const f = m.file;
  const t = FT[f.type] || FT.other;
  const preview = m.preview;
  const content =
    preview.kind === 'image' || preview.kind === 'pdf'
      ? `<img src="${esc(preview.url)}" alt="${esc(f.name)}" class="file-preview-image" translate="no">`
      : preview.kind === 'text'
        ? `<pre class="file-preview-text" translate="no">${esc(preview.text)}</pre>`
        : `<div class="file-preview-message" role="status">${preview.kind === 'loading' ? 'Loading preview…' : preview.kind === 'error' ? esc(preview.message) : 'Preview is unavailable for this format or size. Download the file to open it.'}</div>`;
  return `${H(`<span translate="no">${esc(f.name)}</span>`, `${tr(t.n)} · ${f.size} · ${tr('Uploaded by')} ${esc(mem(f.by)?.name || tr('You'))} ${ago(f.at)}`)}
  <div class="modal-b" data-keep="file-preview:${esc(f.id)}">${preview.kind === 'pdf' ? `<div class="row" style="justify-content:center;gap:12px;flex-wrap:wrap;margin-bottom:12px"><button class="btn btn-secondary btn-sm" data-a="pdfPreviewPage" data-page="${preview.page - 1}" ${preview.loading || preview.page === 1 ? 'disabled' : ''}>Previous</button><span><span>Page</span> ${preview.page} / ${preview.pages}</span><button class="btn btn-secondary btn-sm" data-a="pdfPreviewPage" data-page="${preview.page + 1}" ${preview.loading || preview.page === preview.pages ? 'disabled' : ''}>Next</button></div>` : ''}<div class="file-preview-content" aria-busy="${Boolean(preview.loading)}">${content}</div>
  ${m.tid ? `<div class="row faint" style="font-size:12.5px">${ic('link', 13)}${tr('Attached to')} <button class="link" data-a="openTask" data-id="${m.tid}">${esc(task(m.tid)?.title)}</button></div>` : ''}${relationsPanel(`file:${f.id}`)}</div>
  <div class="modal-f"><button class="btn btn-secondary" data-a="copyLink" data-fid="${f.id}">${ic('link', 14)}Copy link</button>${f.storageName ? `<button class="btn btn-secondary" data-a="downloadStoredFile" data-id="${f.id}">${ic('download', 14)}Download</button>` : ''}<span class="sp"></span><button class="btn btn-primary" data-a="closeModal">Close</button></div>`;
}
