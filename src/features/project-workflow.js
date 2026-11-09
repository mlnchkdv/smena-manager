import { A, IN } from '../actions/actions.js';
import { D, S, proj } from '../core/store.js';
import { getSessionGeneration, projectWorkflowRequest } from '../core/api.js';
import { isRussian, t } from '../core/i18n.js';
import { esc, uid, fmtDate, fmtTimestamp } from '../core/utils.js';
import { ST } from '../core/constants.js';
import { WORKFLOW_STATES, WORKFLOW_READY_RULES, validProjectWorkflow, sameProjectWorkflow } from '../shared/project-workflow.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';
import { workspaceSyncIsClean } from '../core/workspace-sync.js';
import { waitForPersonalPreferences } from '../core/personal-preferences.js';
import { refreshWorkspaceFromServer } from '../core/bootstrap.js';
import { disclosureAttributes } from '../ui/disclosure.js';
import '../styles/project-workflow.css';

const word = (en, ru) => (isRussian() ? ru : en);
const active = () => (S.ui.modals.at(-1)?.projectWorkflow ? S.ui.modals.at(-1) : null);
const scope = () => JSON.stringify([getSessionGeneration(), D().ws.id || D().ws.url]);
const fresh = m => active() === m && m.scope === scope() && !!proj(m.projectId);
const invalidLimits = m => Object.values(m.limitDraft || {}).some(value => !/^\d{1,3}$/.test(value) || Number(value) > 999);
const dirty = m => !!m.model && (invalidLimits(m) || !sameProjectWorkflow(m.model.workflow, m.draft));
const label = state => t(ST[state]?.name || state);
const ruleLabels = () =>
  isRussian()
    ? {
        assignee: 'Доступный исполнитель',
        description: 'Описание',
        due: 'Срок',
        subtasks: 'Все подзадачи завершены',
        dependencies: 'Доступные зависимости завершены',
      }
    : {
        assignee: 'Available assignee',
        description: 'Description',
        due: 'Due date',
        subtasks: 'All subtasks completed',
        dependencies: 'Accessible dependencies completed',
      };
function message(error) {
  if (error.local) return word('Wait until workspace changes are saved, then try again.', 'Дождитесь сохранения изменений пространства и повторите действие.');
  if (error.code === 'WORKFLOW_STALE')
    return word(
      'Another participant changed the process. Keep your draft or discard it and refresh before saving.',
      'Другой участник изменил процесс. Сохраните черновик или сбросьте его и обновите данные перед записью.',
    );
  if (['WORKFLOW_FORBIDDEN', 'WORKSPACE_FORBIDDEN', 'ROLE_FORBIDDEN', 'PROJECT_NOT_FOUND'].includes(error.code))
    return word('The project or configuration permission is no longer available.', 'Проект или право настройки больше недоступны.');
  if (error.code === 'WORKFLOW_CYCLE_UNAVAILABLE')
    return word(
      'A cycle is still used by existing or archived tasks. Keep its identity; archive it instead of removing it.',
      'Цикл используется существующими или архивными задачами. Сохраните его идентичность; используйте архивирование.',
    );
  if (error.code === 'WORKFLOW_INVALID')
    return word('Check transitions, WIP limits, cycle names and dates.', 'Проверьте переходы, лимиты WIP, названия и даты циклов.');
  return word(
    'The result could not be confirmed. Retry the same save or refresh. Your draft is retained.',
    'Не удалось подтвердить результат. Повторите ту же запись или обновите данные. Черновик сохранён.',
  );
}
const field = (name, inner) => `<label class="field"><span class="label">${name}</span>${inner}</label>`;
const input = (key, value, attributes = '') =>
  `<input class="input" data-in="projectWorkflowCycleField" data-field="${key}" value="${esc(value || '')}" ${attributes}>`;
function cyclesView(m, disabled) {
  const flow = m.draft,
    writable = m.model.canConfigure,
    query = (m.cycleQuery || '').trim().toLocaleLowerCase();
  const all = flow.cycles.filter(cycle => (!m.showArchived ? !cycle.archived : true) && (!query || cycle.name.toLocaleLowerCase().includes(query)));
  const start = Math.min(m.offset || 0, Math.max(0, Math.ceil(all.length / 20) * 20 - 20));
  const counts = new Map(m.model.cycles.map(cycle => [cycle.id, cycle]));
  return `<details class="workflow-section workflow-cycle-report" ${disclosureAttributes('project-cycles:' + m.projectId)}><summary>${word('Cycles', 'Циклы')} · ${flow.cycles.length}</summary><div class="workflow-cycle-content"><p class="hint">${word('Optional planning periods. Existing tasks keep their cycle when it is archived. Counts include active tasks only.', 'Необязательные периоды планирования. При архивировании привязка задач сохраняется. Счётчики учитывают только неархивные задачи.')}</p>
    ${field(word('Active cycle', 'Активный цикл'), `<select class="select" data-in="projectWorkflowField" data-field="activeCycleId" ${disabled}>${[['', word('No active cycle', 'Без активного цикла')], ...flow.cycles.filter(cycle => !cycle.archived).map(cycle => [cycle.id, cycle.name])].map(([id, name]) => `<option value="${esc(id)}" ${id === flow.activeCycleId ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select>`)}
    <div class="workflow-cycle-tools">${field(word('Find cycle', 'Поиск цикла'), `<input class="input" id="workflow-cycle-query" data-in="projectWorkflowCycleQuery" value="${esc(m.cycleQuery || '')}" placeholder="${word('Cycle name', 'Название цикла')}">`)}<label class="workflow-check"><input class="check" type="checkbox" data-in="projectWorkflowArchives" ${m.showArchived ? 'checked' : ''}>${word('Include archived', 'С архивными')}</label></div>
    <ul class="workflow-cycles">${
      all
        .slice(start, start + 20)
        .map(cycle => {
          const count = counts.get(cycle.id) || { tasks: 0, completed: 0 };
          return `<li><div class="min0"><strong translate="no">${esc(cycle.name)}</strong>${cycle.archived ? `<span class="faint"> · ${word('Archived', 'Архив')}</span>` : ''}<div class="hint">${fmtDate(cycle.start, true)} — ${fmtDate(cycle.end, true)}</div><span class="hint">${word('Open', 'Открыто')}: ${count.tasks - count.completed} · ${word('Completed', 'Завершено')}: ${count.completed}/${count.tasks}${count.tasks ? ` · ${Math.round((count.completed / count.tasks) * 100)}%` : ''}</span></div>${writable ? `<div class="workflow-cycle-actions"><button class="btn btn-ghost btn-sm" data-a="projectWorkflowEditCycle" data-id="${esc(cycle.id)}" ${m.busy || m.failed ? 'disabled' : ''}>${word('Edit', 'Изменить')}</button><button class="btn btn-ghost btn-sm" data-a="projectWorkflowArchiveCycle" data-id="${esc(cycle.id)}" ${m.busy || m.failed ? 'disabled' : ''}>${cycle.archived ? word('Restore', 'Вернуть') : word('Archive', 'В архив')}</button></div>` : ''}</li>`;
        })
        .join('') || `<li class="hint">${word('No matching cycles.', 'Подходящих циклов нет.')}</li>`
    }</ul>
    ${all.length > 20 ? `<nav class="workflow-pages" aria-label="${word('Cycle pages', 'Страницы циклов')}"><button class="btn btn-secondary btn-sm" data-a="projectWorkflowPage" data-offset="${start - 20}" ${!start ? 'disabled' : ''}>${word('Previous', 'Назад')}</button><span>${start + 1}–${Math.min(start + 20, all.length)} / ${all.length}</span><button class="btn btn-secondary btn-sm" data-a="projectWorkflowPage" data-offset="${start + 20}" ${start + 20 >= all.length ? 'disabled' : ''}>${word('Next', 'Далее')}</button></nav>` : ''}
    ${writable ? `<details class="workflow-cycle-form" ${m.editCycleId || m.cycleFormOpen ? 'open' : ''}><summary>${m.editCycleId ? word('Edit cycle', 'Изменение цикла') : word('Add cycle', 'Добавить цикл')}</summary><div class="workflow-cycle-fields">${field(word('Name', 'Название'), input('name', m.cycleName, `maxlength="80" ${disabled}`))}${field(word('Start', 'Начало'), input('start', m.cycleStart, `type="date" min="1970-01-01" max="9999-12-31" ${disabled}`))}${field(word('End', 'Окончание'), input('end', m.cycleEnd, `type="date" min="1970-01-01" max="9999-12-31" ${disabled}`))}</div><div class="workflow-cycle-actions"><button class="btn btn-secondary btn-sm" data-a="projectWorkflowKeepCycle" ${disabled}>${word('Apply to draft', 'Применить к черновику')}</button><button class="btn btn-ghost btn-sm" data-a="projectWorkflowCancelCycle" ${disabled}>${word('Cancel cycle edit', 'Отменить правку цикла')}</button><span class="hint">${flow.cycles.length} / 500</span></div></details>` : ''}
  </div></details>`;
}
function view(m, H) {
  const model = m.model,
    writable = model?.canConfigure,
    blocked = !writable || m.busy || m.loading || !!m.failed,
    disabled = blocked ? 'disabled' : '';
  const state = m.state || 'progress',
    flow = m.draft,
    ready = ruleLabels();
  return `${H(word('Project process', 'Процесс проекта'), esc(model?.name || proj(m.projectId)?.name || ''))}<div class="modal-b project-workflow-body" translate="no" aria-busy="${!!(m.busy || m.loading)}">
    ${m.loading ? `<p role="status">${word('Loading process…', 'Загрузка процесса…')}</p>` : ''}
    ${m.error ? `<p class="alert err" role="alert">${esc(m.error)}</p>` : ''}
      ${m.confirm ? `<div class="alert warn" role="alert"><p>${word('Discard the unsaved process draft?', 'Сбросить несохранённый черновик процесса?')}</p><div class="workflow-cycle-actions"><button class="btn btn-secondary" data-a="projectWorkflowDiscard">${word('Discard draft', 'Сбросить черновик')}</button><button class="btn btn-ghost" data-a="projectWorkflowKeep">${word('Keep editing', 'Продолжить редактирование')}</button></div></div>` : ''}
    ${
      model
        ? `<p class="hint">${word('Checks apply when entering a status. Existing work is retained.', 'Проверки действуют при входе в статус. Существующая работа сохраняется.')}</p>${!writable ? `<p class="alert info">${word('View only. Full project access is required to change this process.', 'Только просмотр. Для изменения процесса нужен полный доступ к проекту.')}</p>` : ''}
      <section class="workflow-section"><h3>${word('Transitions and readiness', 'Переходы и готовность')}</h3>${field(word('Configure status', 'Настроить статус'), `<select class="select" id="workflow-state" data-in="projectWorkflowState">${WORKFLOW_STATES.map(id => `<option value="${id}" ${state === id ? 'selected' : ''}>${label(id)} · ${model.counts[id]}</option>`).join('')}</select>`)}
      <fieldset class="workflow-rules workflow-transitions" ${disabled}><legend>${word('May move from this status to', 'Из этого статуса можно перейти в')}</legend>${WORKFLOW_STATES.filter(
        id => id !== state,
      )
        .map(
          id =>
            `<label class="workflow-check"><input class="check" type="checkbox" data-in="projectWorkflowTransition" data-id="${id}" ${flow.transitions[state].includes(id) ? 'checked' : ''}>${label(id)}</label>`,
        )
        .join('')}</fieldset>
      <div class="workflow-limit">${field(word('WIP limit', 'Лимит WIP'), `<input class="input" type="number" min="0" max="999" step="1" id="workflow-wip" data-in="projectWorkflowLimit" value="${esc(m.limitDraft?.[state] ?? String(flow.wip[state]))}" ${state === 'done' ? 'disabled' : disabled}>`)}<span class="hint">${word('0 = unlimited. Lowering a limit keeps existing tasks; new entries must fit the final count.', '0 — без ограничения. При снижении лимита старые задачи сохраняются; новые должны укладываться в итоговое количество.')}</span></div>
      <fieldset class="workflow-rules" ${disabled}><legend>${word('Before entering this status, require', 'Для входа в этот статус нужны')}</legend>${WORKFLOW_READY_RULES.map(rule => `<label class="workflow-check"><input class="check" type="checkbox" data-in="projectWorkflowReady" data-id="${rule}" ${flow.ready[state][rule] ? 'checked' : ''}>${ready[rule]}</label>`).join('')}</fieldset></section>
      ${cyclesView(m, disabled)}
      <p class="hint" id="project-workflow-status" role="status" tabindex="-1" aria-live="polite">${dirty(m) ? word('Unsaved draft', 'Несохранённый черновик') : word('Settings match the loaded process', 'Настройки соответствуют загруженному процессу')} · ${word('Revision', 'Ревизия')} ${model.revision}${model.updatedAt ? ` · ${fmtTimestamp(model.updatedAt)}` : ''}</p>`
        : ''
    }
    </div><div class="modal-f" translate="no"><button class="btn btn-secondary" data-a="projectWorkflowReload" ${m.loading || m.busy ? 'disabled' : ''}>${word('Refresh', 'Обновить')}</button>${m.failed ? `<button class="btn btn-primary" data-a="projectWorkflowRetry" ${m.busy ? 'disabled' : ''}>${word('Retry same save', 'Повторить запись')}</button>` : writable ? `<button class="btn btn-primary" data-a="projectWorkflowSave" ${blocked || !dirty(m) || m.loading ? 'disabled' : ''}>${m.busy ? word('Saving…', 'Сохранение…') : word('Save process', 'Сохранить процесс')}</button>` : ''}${!writable ? `<button class="btn btn-ghost" data-a="closeModal">${word('Close', 'Закрыть')}</button>` : ''}</div>`;
}
async function load(m) {
  if (!fresh(m) || m.busy) return;
  m.loading = true;
  m.error = '';
  render();
  try {
    await waitForPersonalPreferences();
    if (!workspaceSyncIsClean(D())) throw { local: true };
    await refreshWorkspaceFromServer();
    if (!fresh(m)) return;
    const model = await projectWorkflowRequest(m.projectId);
    if (fresh(m)) {
      m.model = model;
      m.draft = structuredClone(model.workflow);
      m.limitDraft = {};
      m.failed = null;
      m.confirm = '';
    }
  } catch (error) {
    if (fresh(m)) m.error = message(error);
  } finally {
    if (fresh(m)) {
      m.loading = false;
      render();
    }
  }
}
export function openProjectWorkflow(id, opener) {
  if (active() || !proj(id)) return;
  const m = { type: 'projectWorkflow', projectWorkflow: true, projectId: id, scope: scope(), state: 'progress', render: view };
  m.beforeClose = () => {
    if (m.busy) return false;
    if (!m.discarding && (dirty(m) || m.cycleName || m.cycleStart || m.cycleEnd || m.failed)) {
      m.confirm = 'close';
      render();
      document.querySelector('[data-a=projectWorkflowKeep]')?.focus();
      return false;
    }
    return true;
  };
  openModal(m);
  if (opener) S.ui.modalOpeners[S.ui.modals.length - 1] = opener;
  return load(m);
}
const edit = fn => {
  const m = active();
  if (!m?.model?.canConfigure || m.busy || m.failed || m.loading) return;
  fn(m);
  m.error = '';
  render();
};
IN.projectWorkflowState = el => {
  const m = active();
  if (m && WORKFLOW_STATES.includes(el.value)) {
    m.state = el.value;
    render();
  }
};
IN.projectWorkflowTransition = el =>
  edit(m => {
    const targets = m.draft.transitions[m.state];
    m.draft.transitions[m.state] = el.checked ? [...new Set([...targets, el.dataset.id])] : targets.filter(id => id !== el.dataset.id);
  });
IN.projectWorkflowReady = el =>
  edit(m => {
    m.draft.ready[m.state][el.dataset.id] = el.checked;
  });
IN.projectWorkflowLimit = el => {
  const m = active();
  if (!m?.model?.canConfigure || m.busy || m.loading || m.failed || m.state === 'done') return;
  (m.limitDraft ||= {})[m.state] = el.value;
  const n = Number(el.value);
  if (el.value !== '' && Number.isInteger(n) && n >= 0 && n <= 999) m.draft.wip[m.state] = n;
  render();
};
IN.projectWorkflowField = el =>
  edit(m => {
    m.draft.activeCycleId = el.value;
  });
IN.projectWorkflowCycleField = el => {
  const m = active();
  if (!m?.model?.canConfigure || m.busy || m.loading || m.failed) return;
  m.cycleFormOpen = true;
  m['cycle' + { name: 'Name', start: 'Start', end: 'End' }[el.dataset.field]] = el.value;
};
IN.projectWorkflowCycleQuery = el => {
  const m = active();
  if (m) {
    m.cycleQuery = el.value;
    m.offset = 0;
    render();
  }
};
IN.projectWorkflowArchives = el => {
  const m = active();
  if (m) {
    m.showArchived = el.checked;
    m.offset = 0;
    render();
  }
};
A.projectWorkflowPage = el => {
  const m = active();
  if (m) {
    m.offset = Math.max(0, Number(el.dataset.offset) || 0);
    render();
  }
};
A.projectWorkflowEditCycle = el =>
  edit(m => {
    const cycle = m.draft.cycles.find(cycle => cycle.id === el.dataset.id);
    if (cycle) Object.assign(m, { editCycleId: cycle.id, cycleName: cycle.name, cycleStart: cycle.start, cycleEnd: cycle.end });
  });
A.projectWorkflowCancelCycle = () => edit(m => Object.assign(m, { editCycleId: '', cycleName: '', cycleStart: '', cycleEnd: '', cycleFormOpen: false }));
A.projectWorkflowArchiveCycle = el =>
  edit(m => {
    const cycle = m.draft.cycles.find(cycle => cycle.id === el.dataset.id);
    if (cycle) {
      cycle.archived = !cycle.archived;
      if (cycle.archived && m.draft.activeCycleId === cycle.id) m.draft.activeCycleId = '';
    }
  });
A.projectWorkflowKeepCycle = () => {
  const m = active();
  if (!m?.model?.canConfigure || m.busy || m.loading || m.failed) return;
  const cycle = {
    id: m.editCycleId || uid('cycle'),
    name: (m.cycleName || '').trim(),
    start: m.cycleStart || '',
    end: m.cycleEnd || '',
    archived: m.draft.cycles.find(cycle => cycle.id === m.editCycleId)?.archived || false,
  };
  const proposed = { ...m.draft, cycles: m.editCycleId ? m.draft.cycles.map(item => (item.id === m.editCycleId ? cycle : item)) : [...m.draft.cycles, cycle] };
  m.cycleFormOpen = true;
  if (!validProjectWorkflow(proposed)) {
    m.error = message({ code: 'WORKFLOW_INVALID' });
    render();
    return;
  }
  m.draft = proposed;
  m.error = '';
  Object.assign(m, { editCycleId: '', cycleName: '', cycleStart: '', cycleEnd: '', cycleFormOpen: false });
  render();
};
A.projectWorkflowReload = () => {
  const m = active();
  if (!m || m.busy) return;
  if (dirty(m) || m.failed || m.cycleName || m.cycleStart || m.cycleEnd) {
    m.confirm = 'reload';
    render();
    document.querySelector('[data-a=projectWorkflowKeep]')?.focus();
  } else return load(m);
};
A.projectWorkflowKeep = () => {
  const m = active();
  if (m) {
    m.confirm = '';
    render();
  }
};
A.projectWorkflowDiscard = () => {
  const m = active();
  if (!m || m.busy) return;
  if (m.confirm === 'close') {
    m.discarding = true;
    return closeModal();
  }
  Object.assign(m, { confirm: '', failed: null, cycleName: '', cycleStart: '', cycleEnd: '', editCycleId: '' });
  return load(m);
};
async function send(m, payload) {
  if (!fresh(m) || m.busy) return;
  m.busy = true;
  m.error = '';
  render();
  let saved = false;
  try {
    await waitForPersonalPreferences();
    if (!fresh(m) || !workspaceSyncIsClean(D())) throw { local: true };
    const model = await projectWorkflowRequest(m.projectId, payload);
    saved = true;
    if (!fresh(m)) return;
    m.confirm = '';
    m.model = model;
    m.draft = structuredClone(model.workflow);
    m.limitDraft = {};
    m.failed = null;
    await refreshWorkspaceFromServer();
  } catch (error) {
    if (fresh(m)) {
      m.error = saved
        ? word('The process was saved. Refresh workspace data before changing tasks.', 'Процесс сохранён. Обновите данные пространства перед изменением задач.')
        : message(error);
      m.failed = saved || error.local || (error.status >= 400 && error.status < 500 && error.code !== 'REVISION_CONFLICT') ? null : payload;
    }
  } finally {
    if (fresh(m)) {
      m.busy = false;
      render();
      if (!m.error) document.getElementById('project-workflow-status')?.focus({ preventScroll: true });
    }
  }
}
A.projectWorkflowSave = () => {
  const m = active();
  if (!m?.model?.canConfigure || m.busy || m.failed || !dirty(m)) return;
  if (m.cycleName || m.cycleStart || m.cycleEnd) {
    m.error = word('Apply or cancel the cycle edit before saving the process.', 'Примените или отмените правку цикла перед сохранением процесса.');
    render();
    return;
  }
  if (invalidLimits(m) || !validProjectWorkflow(m.draft)) {
    m.error = message({ code: 'WORKFLOW_INVALID' });
    render();
    return;
  }
  return send(m, { workflowHash: m.model.workflowHash, workflow: structuredClone(m.draft) });
};
A.projectWorkflowRetry = () => {
  const m = active();
  if (m?.failed) return send(m, m.failed);
};
