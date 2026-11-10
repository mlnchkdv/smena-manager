import { A, IN } from '../actions/actions.js';
import { D, S, proj } from '../core/store.js';
import { getSessionGeneration, projectAutomationsRequest } from '../core/api.js';
import { isRussian, t } from '../core/i18n.js';
import { esc, uid, fmtTimestamp } from '../core/utils.js';
import { ST, PR } from '../core/constants.js';
import { validProjectAutomations, projectAutomationsSignature, AUTOMATION_LIMITS } from '../shared/project-automations.js';
import { WORKFLOW_STATES } from '../shared/project-workflow.js';
import { canReadProject } from '../shared/project-access.js';
import { workspaceMemberRole } from '../shared/workspace-access.js';
import { isActiveMember } from '../shared/workspace-membership.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';
import { workspaceSyncIsClean } from '../core/workspace-sync.js';
import { waitForPersonalPreferences } from '../core/personal-preferences.js';
import { refreshWorkspaceFromServer } from '../core/bootstrap.js';
import { disclosureAttributes } from '../ui/disclosure.js';
import '../styles/project-automations.css';

const word = (en, ru) => (isRussian() ? ru : en);
const active = () => (S.ui.modals.at(-1)?.type === 'projectAutomations' ? S.ui.modals.at(-1) : null);
const scope = () => JSON.stringify([getSessionGeneration(), D().ws.id || D().ws.url]);
const fresh = m => !!m && active() === m && m.scope === scope() && !!proj(m.projectId);
const valid = m => validProjectAutomations(m.draft);
const dirty = m => !!m.model && (!valid(m) || projectAutomationsSignature(m.model.program) !== projectAutomationsSignature(m.draft));
const selected = m => m.draft?.rules.find(rule => rule.id === m.ruleId);
const statusLabel = id => (id === 'created' ? word('Created', 'Создана') : t(ST[id]?.name || id));
const field = (label, inner) => `<label class="field"><span class="label">${label}</span>${inner}</label>`;
const options = (values, chosen) =>
  values.map(([value, label]) => `<option value="${esc(value)}" ${String(chosen) === String(value) ? 'selected' : ''}>${esc(label)}</option>`).join('');
const select = (id, handler, values, chosen, disabled = '') =>
  `<select class="select" id="${id}" data-in="${handler}" ${disabled}>${options(values, chosen)}</select>`;
const taskRows = m => D().tasks.filter(task => task.project === m.projectId && !task.archived);
function valueLabel(field, value, projectId) {
  if (field === 'priority') return t(PR[value]?.name || value);
  if (field === 'assignee')
    return value
      ? D().members.find(member => member.id === value)?.name || word('Unavailable member', 'Недоступный участник')
      : word('Unassigned', 'Без исполнителя');
  return value
    ? proj(projectId)?.workflow?.cycles?.find(cycle => cycle.id === value)?.name || word('Unavailable cycle', 'Недоступный цикл')
    : word('No cycle', 'Без цикла');
}
const fieldLabel = value => ({ priority: word('Priority', 'Приоритет'), assignee: word('Assignee', 'Исполнитель'), cycleId: word('Cycle', 'Цикл') })[value];
function message(error) {
  if (error.local) return word('Wait until workspace changes are saved, then retry.', 'Дождитесь сохранения изменений пространства и повторите действие.');
  if (error.code === 'AUTOMATION_STALE')
    return word(
      'Someone changed the rules. Your draft is retained in this window. Refresh to compare before saving.',
      'Правила изменены другим участником. Черновик остаётся в этом окне. Обновите данные перед записью.',
    );
  if (error.code === 'AUTOMATION_EXECUTION_UNAVAILABLE')
    return word('Execution is not available yet. Save disabled drafts only.', 'Выполнение пока недоступно. Можно сохранять только отключённые черновики.');
  if (['WORKFLOW_WIP', 'WORKFLOW_READY', 'WORKFLOW_TRANSITION', 'WORKFLOW_DEPENDENCY'].includes(error.code))
    return word(
      'This transition does not meet the project process requirements. Check readiness, dependencies and WIP.',
      'Переход не соответствует процессу проекта. Проверьте готовность, зависимости и лимит WIP.',
    );
  if (error.status === 403 || error.status === 404)
    return word('The project, task or required permission is no longer available.', 'Проект, задача или необходимое право больше недоступны.');
  if (['AUTOMATION_INVALID', 'AUTOMATION_PREVIEW_INVALID'].includes(error.code))
    return word(
      'Enter a rule name, at least one source status and at least one assignment.',
      'Укажите название правила, хотя бы один исходный статус и одно назначение.',
    );
  if (['AUTOMATION_ASSIGNEE_UNAVAILABLE', 'AUTOMATION_CYCLE_UNAVAILABLE', 'AUTOMATION_ACTION_CONFLICT'].includes(error.code))
    return word(
      'An enabled rule has an unavailable target or conflicts with another enabled rule. Check assignments or disable it.',
      'У включённого правила недоступно назначение или есть конфликт с другим правилом. Проверьте назначения или отключите правило.',
    );
  return word(
    'The result could not be confirmed. Your draft is retained in this window. Retry or refresh.',
    'Не удалось подтвердить результат. Черновик остаётся в этом окне. Повторите действие или обновите данные.',
  );
}
function editor(m, disabled) {
  const rule = selected(m),
    writable = m.model.canConfigure,
    p = proj(m.projectId);
  if (!rule)
    return `<p class="hint">${word('No rules yet. Add a draft to describe a routine assignment.', 'Правил пока нет. Добавьте черновик для типового назначения.')}</p>`;
  const assignments = new Map(rule.actions.map(action => [action.field, action.value]));
  const keep = ['__keep__', word('Keep current value', 'Не менять')];
  const members = D().members.filter(member => isActiveMember(member) && canReadProject(p, member.id, workspaceMemberRole(member)));
  const values = {
    priority: [keep, ...Object.values(PR).map(priority => [priority.id, t(priority.name)])],
    assignee: [keep, ['', word('Unassigned', 'Без исполнителя')], ...members.map(member => [member.id, member.name])],
    cycleId: [keep, ['', word('No cycle', 'Без цикла')], ...(p.workflow?.cycles || []).filter(cycle => !cycle.archived).map(cycle => [cycle.id, cycle.name])],
  };
  return `<fieldset class="automation-editor" ${disabled}><legend class="sr">${word('Rule settings', 'Настройки правила')}</legend>
    ${field(word('Rule name', 'Название правила'), `<input class="input" id="automation-name" data-in="automationName" maxlength="80" value="${esc(rule.name)}" translate="no">`)}
    <label class="automation-enabled"><input class="check" type="checkbox" data-in="automationEnabled" ${rule.enabled ? 'checked' : ''} ${!m.model.executionAvailable ? 'disabled' : ''}>${word('Rule enabled after saving', 'Правило включено после сохранения')}</label>
    <fieldset class="automation-sources"><legend>${word('When moving from', 'При переходе из')}</legend>${['created', ...WORKFLOW_STATES]
      .filter(state => state !== rule.trigger.to)
      .map(
        state =>
          `<label><input class="check" type="checkbox" data-in="automationSource" data-state="${state}" ${rule.trigger.from.includes(state) ? 'checked' : ''}>${statusLabel(state)}</label>`,
      )
      .join('')}</fieldset>
    ${field(
      word('To status', 'В статус'),
      select(
        'automation-destination',
        'automationDestination',
        WORKFLOW_STATES.map(state => [state, statusLabel(state)]),
        rule.trigger.to,
      ),
    )}
    <div class="automation-grid">${Object.entries(values)
      .map(([name, choices]) => {
        const chosen = assignments.has(name) ? (assignments.get(name) ?? '') : '__keep__';
        if (!choices.some(([value]) => value === chosen)) choices.push([chosen, valueLabel(name, chosen, m.projectId)]);
        return field(
          fieldLabel(name),
          `<select class="select" id="automation-action-${name}" data-in="automationAssignment" data-field="${name}" translate="no">${options(choices, chosen)}</select>`,
        );
      })
      .join('')}</div>
  </fieldset>${writable ? `<p class="hint">${word('Only saved, enabled rules run on future task creation or status changes. Saving rules does not change existing tasks.', 'Сохранённые включённые правила действуют при последующем создании задачи или смене статуса. Сохранение правил не меняет существующие задачи.')}</p>` : ''}`;
}
function report(m) {
  const result = m.result;
  if (!result) return '';
  const issueLabels = {
    AUTOMATION_ACTION_CONFLICT: word('Rules propose incompatible assignments.', 'Правила предлагают несовместимые назначения.'),
    AUTOMATION_ASSIGNEE_UNAVAILABLE: word('The assignee is unavailable to this project.', 'Исполнитель недоступен этому проекту.'),
    AUTOMATION_CYCLE_UNAVAILABLE: word('The cycle is archived or unavailable.', 'Цикл архивирован или недоступен.'),
    AUTOMATION_CANONICAL_VALIDATION: word('The resulting task would fail project requirements.', 'Результат не соответствует требованиям процесса проекта.'),
  };
  return `<div class="automation-result" id="automation-result" role="status" tabindex="-1" aria-live="polite"><strong>${result.blocked ? word('Preview blocked', 'Предпросмотр заблокирован') : result.changes.length ? word('Proposed assignments', 'Предполагаемые назначения') : word('No assignment changes', 'Назначения не изменятся')}</strong>
    <p>${word('Nothing has been applied to tasks.', 'К задачам ничего не применено.')}</p>
    ${result.issues?.length ? `<ul>${result.issues.map(issue => `<li>${issueLabels[issue.code] || word('The preview could not be completed. Review the rule and retry.', 'Не удалось завершить расчёт. Проверьте правило и повторите.')}</li>`).join('')}</ul>` : ''}
    ${result.changes.length ? `<ul>${result.changes.flatMap(change => change.fields.map(item => `<li>${fieldLabel(item.field)}: <span translate="no">${esc(valueLabel(item.field, item.from, m.projectId))}</span> → <strong translate="no">${esc(valueLabel(item.field, item.to, m.projectId))}</strong></li>`)).join('')}</ul>` : ''}
    <p class="hint">${word('Matched tasks', 'Совпавшие задачи')}: ${result.triggeredTasks} · ${word('Proposed fields', 'Предложено полей')}: ${result.proposedOperations}</p></div>`;
}
function preview(m, blocked) {
  if (!m.model.canPreview || !m.draft.rules.length) return '';
  const tasks = taskRows(m),
    query = (m.query || '').trim().toLocaleLowerCase();
  const found = tasks.filter(task => !query || `${task.key || ''} ${task.title}`.toLocaleLowerCase().includes(query));
  const shown = found.slice(0, 50),
    current = tasks.find(task => task.id === m.taskId);
  if (current && !shown.includes(current)) shown.unshift(current);
  return `<section class="automation-preview"><h3>${word('Try on a task', 'Проверить на задаче')}</h3><p class="hint">${word('Preview includes disabled rules and unsaved edits. The task stays unchanged.', 'Расчёт включает отключённые правила и несохранённые правки. Задача останется без изменений.')}</p>
    ${field(word('Find task', 'Найти задачу'), `<input class="input" id="automation-query" data-in="automationQuery" value="${esc(m.query || '')}" placeholder="${word('Task name or key', 'Название или номер задачи')}" ${blocked ? 'disabled' : ''}>`)}
    ${field(word('Task', 'Задача'), select('automation-task', 'automationTask', [['', word('Choose a task', 'Выберите задачу')], ...shown.map(task => [task.id, `${task.key || ''} ${task.title}`.trim()])], m.taskId || '', blocked ? 'disabled' : ''))}
    ${found.length > 50 ? `<p class="hint">${word('First 50 matches shown. Refine your search.', 'Показаны первые 50 совпадений. Уточните поиск.')}</p>` : ''}
    <div class="automation-preview-tools">${field(
      word('Proposed status', 'Предполагаемый статус'),
      select(
        'automation-preview-to',
        'automationPreviewTo',
        WORKFLOW_STATES.map(state => [state, statusLabel(state)]),
        m.previewTo || 'progress',
        blocked ? 'disabled' : '',
      ),
    )}<button class="btn btn-secondary" data-a="automationPreview" ${blocked || !current || !m.draft.rules.length || !valid(m) ? 'disabled' : ''}>${word('Preview result', 'Рассчитать результат')}</button></div>${report(m)}</section>`;
}
function history(m, blocked) {
  const rows = m.model.history || [],
    shown = rows.slice(0, m.historyCount || 5);
  return `<details class="automation-history" ${disclosureAttributes('project-rule-history:' + m.projectId)}><summary>${word('Execution history', 'История выполнения')} · ${rows.length}</summary><div class="automation-history-content"><p class="hint">${word('Recent saved runs. Older records are gradually removed. Refresh to load the latest runs.', 'Последние сохранённые запуски. Старые записи постепенно удаляются. Обновите данные, чтобы увидеть новые запуски.')}</p>
  ${
    !rows.length
      ? `<p class="hint">${word('Runs appear when a saved, enabled rule matches a task change.', 'Записи появятся после срабатывания сохранённого включённого правила.')}</p>`
      : `<ol>${shown
          .map(
            run =>
              `<li><strong translate="no">${fmtTimestamp(run.at)} · ${esc(D().members.find(member => member.id === run.actorId)?.name || word('Former participant', 'Бывший участник'))}</strong><p>${word('Matched tasks', 'Совпавшие задачи')}: ${run.matchedTasks} · ${word('Assignments', 'Назначения')}: ${run.assignments} · ${word('Already matched', 'Уже соответствуют')}: ${run.noops}</p><span class="hint">${run.programHash === m.model.programHash ? word('Current rule version', 'Текущая версия правил') : word('Previous rule version', 'Предыдущая версия правил')} · ${word('Save', 'Сохранение')} #${run.revision}</span><div class="automation-actions">${run.tasks
                .map(id => {
                  const task = D().tasks.find(task => task.id === id && task.project === m.projectId);
                  return task
                    ? `<button class="btn btn-ghost btn-sm automation-history-task" data-a="automationOpenTask" data-id="${esc(id)}" ${blocked || dirty(m) ? 'disabled' : ''} title="${esc(task.title)}"><span class="trunc" translate="no">${esc(task.key || task.title)}</span></button>`
                    : `<span class="hint">${word('Task moved or unavailable', 'Задача перенесена или недоступна')}</span>`;
                })
                .join('')}</div></li>`,
          )
          .join('')}</ol>`
  }
  ${rows.length > shown.length ? `<button class="btn btn-secondary btn-sm" data-a="automationMoreHistory">${word('More runs', 'Ещё записи')}</button>` : ''}</div></details>`;
}
function view(m, H) {
  const model = m.model,
    blocked = m.busy || m.loading || !!m.failed,
    disabled = !model?.canConfigure || blocked ? 'disabled' : '';
  return `${H(word('Project rules', 'Правила проекта'), `<span translate="no">${esc(model?.name || proj(m.projectId)?.name || '')}</span>`)}<div class="modal-b project-automations-body" data-keep="project-rules:${esc(m.projectId)}" translate="no" aria-busy="${!!(m.busy || m.loading)}">
    ${m.loading ? `<p role="status">${word('Loading rules…', 'Загрузка правил…')}</p>` : ''}
    ${m.error ? `<p class="alert err" role="alert">${esc(m.error)}</p>` : ''}
    ${m.confirm === 'activate' ? `<div class="alert warn automation-confirm" role="alert"><p>${word('Enabled rules will run on future task creation and status changes. Normal task notifications follow participant preferences. Existing tasks stay unchanged.', 'Включённые правила будут срабатывать при последующем создании задачи и смене статуса. Обычные уведомления зависят от настроек участников. Существующие задачи не изменятся.')}</p><div class="automation-actions"><button class="btn btn-primary" data-a="automationConfirmSave">${word('Save enabled rules', 'Сохранить включённые правила')}</button><button class="btn btn-ghost" data-a="automationKeep">${word('Keep editing', 'Продолжить редактирование')}</button></div></div>` : m.confirm ? `<div class="alert warn automation-confirm" role="alert"><p>${word('Discard the unsaved rule draft?', 'Сбросить несохранённый черновик правил?')}</p><div class="automation-actions"><button class="btn btn-secondary" data-a="automationDiscard">${word('Discard draft', 'Сбросить черновик')}</button><button class="btn btn-ghost" data-a="automationKeep">${word('Keep editing', 'Продолжить редактирование')}</button></div></div>` : ''}
    ${
      model
        ? `<p class="alert info">${model.executionAvailable ? word('Enabled rules run with task changes. Preview never applies changes.', 'Включённые правила выполняются вместе с изменением задачи. Предпросмотр ничего не применяет.') : word('Preview only. Draft rules do not run or send notifications.', 'Только предпросмотр. Черновики правил не выполняются и не отправляют уведомления.')}</p>${!model.canConfigure ? `<p class="hint">${word('Full project access is required to save rules.', 'Для сохранения правил нужен полный доступ к проекту.')}</p>` : ''}
      <div class="automation-rule-picker">${
        m.draft.rules.length
          ? field(
              word('Rule', 'Правило'),
              select(
                'automation-rule',
                'automationRule',
                m.draft.rules.map(rule => [rule.id, rule.name || word('Unnamed rule', 'Правило без названия')]),
                m.ruleId || '',
                blocked || !m.draft.rules.length ? 'disabled' : '',
              ),
            )
          : ''
      }${model.canConfigure ? `<button class="btn btn-secondary" data-a="automationAdd" ${disabled || m.draft.rules.length >= AUTOMATION_LIMITS.rules ? 'disabled' : ''}>${word('Add rule', 'Добавить правило')}</button>${selected(m) ? `<button class="btn btn-ghost" data-a="automationRemove" ${disabled}>${word('Remove', 'Убрать')}</button>` : ''}` : ''}</div>
      ${editor(m, disabled)}${preview(m, blocked)}${history(m, blocked)}<p class="hint" id="automation-status" role="status" aria-live="polite" tabindex="-1">${dirty(m) ? word('Unsaved changes in this window', 'Несохранённые изменения в этом окне') : word('Rules match saved settings', 'Правила соответствуют сохранённому')} · ${word('Revision', 'Ревизия')} ${model.revision}${model.updatedAt ? ` · ${fmtTimestamp(model.updatedAt)}` : ''}</p>`
        : ''
    }
    </div><div class="modal-f" translate="no"><button class="btn btn-secondary" data-a="automationReload" ${m.loading || m.busy ? 'disabled' : ''}>${word('Refresh', 'Обновить')}</button>${m.failed ? `<button class="btn btn-primary" data-a="automationRetry" ${m.busy ? 'disabled' : ''}>${word('Retry same save', 'Повторить запись')}</button>` : model?.canConfigure ? `<button class="btn btn-primary" data-a="automationSave" ${disabled || !dirty(m) || !valid(m) ? 'disabled' : ''}>${m.busy ? word('Saving…', 'Сохранение…') : word('Save rules', 'Сохранить правила')}</button>` : `<button class="btn btn-ghost" data-a="closeModal">${word('Close', 'Закрыть')}</button>`}</div>`;
}
async function load(m) {
  if (!fresh(m) || m.busy || m.loading) return;
  m.loading = true;
  m.error = '';
  render();
  try {
    await waitForPersonalPreferences();
    if (!workspaceSyncIsClean(D())) throw { local: true };
    await refreshWorkspaceFromServer();
    if (!fresh(m)) return;
    const model = await projectAutomationsRequest(m.projectId);
    if (fresh(m))
      Object.assign(m, { model, draft: structuredClone(model.program), ruleId: model.program.rules[0]?.id || '', failed: null, confirm: '', result: null });
  } catch (error) {
    if (fresh(m)) m.error = message(error);
  } finally {
    if (fresh(m)) {
      m.loading = false;
      render();
    }
  }
}
export function openProjectAutomations(id, opener) {
  if (active() || !proj(id)) return;
  const m = { type: 'projectAutomations', projectId: id, scope: scope(), render: view, previewTo: 'progress' };
  m.beforeClose = () => {
    if (m.busy) return false;
    if (!m.discarding && (dirty(m) || m.failed)) {
      m.confirm = 'close';
      render();
      document.querySelector('[data-a=automationKeep]')?.focus();
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
  if (!fresh(m) || !m.model?.canConfigure || m.busy || m.loading || m.failed) return;
  fn(m, selected(m));
  m.confirm = '';
  m.error = '';
  m.result = null;
  render();
};
IN.automationRule = el => {
  const m = active();
  if (m && !m.busy && m.draft?.rules.some(rule => rule.id === el.value)) {
    m.ruleId = el.value;
    render();
  }
};
IN.automationName = el =>
  edit((m, rule) => {
    if (rule) rule.name = el.value.slice(0, 80);
  });
IN.automationEnabled = el =>
  edit((m, rule) => {
    if (rule && m.model.executionAvailable) rule.enabled = el.checked;
  });
IN.automationSource = el =>
  edit((m, rule) => {
    if (!rule || !['created', ...WORKFLOW_STATES].includes(el.dataset.state) || el.dataset.state === rule.trigger.to) return;
    rule.trigger.from = el.checked ? [...new Set([...rule.trigger.from, el.dataset.state])] : rule.trigger.from.filter(state => state !== el.dataset.state);
  });
IN.automationDestination = el =>
  edit((m, rule) => {
    if (!rule || !WORKFLOW_STATES.includes(el.value)) return;
    rule.trigger.to = el.value;
    rule.trigger.from = rule.trigger.from.filter(state => state !== el.value);
  });
IN.automationAssignment = el =>
  edit((m, rule) => {
    if (!rule || !['priority', 'assignee', 'cycleId'].includes(el.dataset.field)) return;
    rule.actions = rule.actions.filter(action => action.field !== el.dataset.field);
    if (el.value !== '__keep__') rule.actions.push({ field: el.dataset.field, value: el.dataset.field === 'assignee' && !el.value ? null : el.value });
  });
for (const [handler, key] of [
  ['automationQuery', 'query'],
  ['automationTask', 'taskId'],
  ['automationPreviewTo', 'previewTo'],
])
  IN[handler] = el => {
    const m = active();
    if (m?.model?.canPreview && !m.busy && !m.loading) {
      m[key] = el.value;
      if (key !== 'query') m.result = null;
      render();
    }
  };
A.automationAdd = () =>
  edit(m => {
    if (m.draft.rules.length >= AUTOMATION_LIMITS.rules) return;
    const id = uid('rule');
    m.draft.rules.push({
      id,
      name: word('New rule', 'Новое правило'),
      enabled: false,
      trigger: { from: ['todo'], to: 'progress' },
      actions: [{ field: 'priority', value: 'high' }],
    });
    m.ruleId = id;
  });
A.automationRemove = () =>
  edit(m => {
    m.draft.rules = m.draft.rules.filter(rule => rule.id !== m.ruleId);
    m.ruleId = m.draft.rules[0]?.id || '';
  });
A.automationReload = () => {
  const m = active();
  if (!m || m.busy) return;
  if (dirty(m) || m.failed) {
    m.confirm = 'reload';
    render();
    document.querySelector('[data-a=automationKeep]')?.focus();
  } else return load(m);
};
A.automationKeep = () => {
  const m = active();
  if (m) {
    m.confirm = '';
    render();
  }
};
A.automationDiscard = () => {
  const m = active();
  if (!m || m.busy) return;
  if (m.confirm === 'close') {
    m.discarding = true;
    return closeModal();
  }
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
    const model = await projectAutomationsRequest(m.projectId, payload);
    saved = true;
    if (!fresh(m)) return;
    Object.assign(m, { model, draft: structuredClone(model.program), failed: null, confirm: '', result: null });
    await refreshWorkspaceFromServer();
  } catch (error) {
    if (fresh(m)) {
      m.error = saved
        ? word('Rules saved. Refresh workspace data before continuing.', 'Правила сохранены. Обновите данные пространства перед продолжением.')
        : message(error);
      m.failed = saved || error.local || (error.status >= 400 && error.status < 500 && error.code !== 'REVISION_CONFLICT') ? null : payload;
    }
  } finally {
    if (fresh(m)) {
      m.busy = false;
      render();
      if (!m.error) document.getElementById('automation-status')?.focus({ preventScroll: true });
    }
  }
}
A.automationSave = () => {
  const m = active();
  if (!fresh(m) || !m.model?.canConfigure || m.failed || m.busy || m.loading || !dirty(m) || !valid(m)) return;
  if (m.draft.rules.some(rule => rule.enabled)) {
    m.confirm = 'activate';
    render();
    document.querySelector('[data-a=automationConfirmSave]')?.focus();
    return;
  }
  return send(m, { program: structuredClone(m.draft), programHash: m.model.programHash });
};
A.automationConfirmSave = () => {
  const m = active();
  if (fresh(m) && m.confirm === 'activate' && m.model?.canConfigure && !m.failed && !m.loading && valid(m))
    return send(m, { program: structuredClone(m.draft), programHash: m.model.programHash });
};
A.automationMoreHistory = () => {
  const m = active();
  if (fresh(m)) {
    m.historyCount = (m.historyCount || 5) + 5;
    render();
  }
};
A.automationOpenTask = el => {
  const m = active();
  if (!fresh(m) || dirty(m) || m.busy || !D().tasks.some(task => task.id === el.dataset.id && task.project === m.projectId)) return;
  closeModal();
  if (active() !== m) return A.openTask(el);
};
A.automationRetry = () => {
  const m = active();
  if (m?.failed) return send(m, m.failed);
};
A.automationPreview = async () => {
  const m = active();
  if (!fresh(m) || !m.model?.canPreview || m.busy || m.loading || m.failed || !valid(m) || !taskRows(m).some(task => task.id === m.taskId)) return;
  m.busy = true;
  m.error = '';
  m.result = null;
  render();
  try {
    await waitForPersonalPreferences();
    if (!fresh(m) || !workspaceSyncIsClean(D())) throw { local: true };
    const result = await projectAutomationsRequest(
      m.projectId,
      { program: structuredClone(m.draft), transitions: [{ taskId: m.taskId, to: m.previewTo }] },
      '/preview',
    );
    if (fresh(m)) m.result = result;
  } catch (error) {
    if (fresh(m)) m.error = message(error);
  } finally {
    if (fresh(m)) {
      m.busy = false;
      render();
      if (m.result) document.getElementById('automation-result')?.focus({ preventScroll: true });
    }
  }
};
