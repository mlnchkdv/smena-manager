import { D, S } from '../core/store.js';
import { A, IN } from '../actions/actions.js';
import { knowledgeIntakeRequest, getKnowledgeIntakeQueue, searchKnowledgePage, getSessionGeneration } from '../core/api.js';
import { isRussian } from '../core/i18n.js';
import { esc, fmtTimestamp } from '../core/utils.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';
import { workspaceSyncIsClean } from '../core/workspace-sync.js';
import { waitForPersonalPreferences } from '../core/personal-preferences.js';
import { refreshWorkspaceFromServer } from '../core/bootstrap.js';
import { disclosureAttributes } from '../ui/disclosure.js';
import '../styles/knowledge-review.css';
import '../styles/knowledge-intake.css';

const word = (en, ru) => (isRussian() ? ru : en);
const active = () => (S.ui.modals.at(-1)?.knowledgeIntake ? S.ui.modals.at(-1) : null);
const scope = () => JSON.stringify([getSessionGeneration(), D().ws.id || D().ws.url]);
const fresh = m => !!m && active() === m && m.scope === scope();
let remembered = null;
const outcome = value =>
  ({
    knowledge: word('Keep as knowledge', 'Оставить в базе знаний'),
    project: word('Hand off to project', 'Передать в проект'),
    duplicate: word('Duplicate', 'Дубликат'),
    dismissed: word('No action needed', 'Не требует работы'),
  })[value] || '';
const label = value =>
  ({
    enroll: word('Added to intake', 'Добавлено на разбор'),
    assign: word('Responsibility changed', 'Назначен ответственный'),
    resolve: word('Resolved', 'Разобрано'),
    reopen: word('Reopened', 'Возвращено на разбор'),
  })[value] || value;
const message = error => {
  if (error.code === 'REVISION_CONFLICT')
    return word(
      'The workspace changed while saving. Retry this request or refresh its status.',
      'Пространство изменилось во время сохранения. Повторите этот запрос или обновите статус.',
    );
  if (error.code === 'INTAKE_STALE')
    return word('This material changed in intake. Refresh before deciding.', 'Разбор этого материала уже изменился. Обновите данные перед решением.');
  if (['INTAKE_FORBIDDEN', 'WORKSPACE_FORBIDDEN', 'ROLE_FORBIDDEN'].includes(error.code))
    return word('Your current permissions do not allow this action.', 'Текущие права не позволяют выполнить это действие.');
  if (error.code === 'INTAKE_INVALID') return word('Check responsibility, outcome, target and reason.', 'Проверьте ответственного, итог, цель и пояснение.');
  if (error.code === 'INTAKE_INTEGRITY') return word('The intake journal could not be verified.', 'Не удалось проверить журнал разбора.');
  return word('The operation was not confirmed. Refresh or retry the same request.', 'Операция не подтверждена. Обновите данные или повторите тот же запрос.');
};
const option = (id, name, selected) => `<option value="${esc(id)}" ${selected === id ? 'selected' : ''}>${esc(name)}</option>`;
const footer = m =>
  `<div class="modal-f" translate="no">${m.noteId ? `<button class="btn btn-secondary" data-a="knowledgeIntakeBack">${word('Queue', 'Очередь')}</button>` : ''}<button class="btn btn-secondary" data-a="knowledgeIntakeReload" ${m.busy || m.loading ? 'disabled' : ''}>${word('Refresh', 'Обновить')}</button><button class="btn btn-secondary" data-a="closeModal">${word('Close', 'Закрыть')}</button></div>`;
function detail(m) {
  const model = m.model,
    value = model.intake,
    pending = model.summary?.state === 'open',
    owner = model.members.find(member => member.id === value?.ownerId);
  const people = model.members.filter(member => member.active && member.role !== 'viewer');
  const control = model.canManage && !m.busy && !m.loading && !m.failed;
  const stamp = value ? fmtTimestamp(value.at) : '';
  const result = value?.result;
  return `<div class="knowledge-intake-heading"><h3 translate="no">${esc(model.title)}</h3><button class="btn btn-secondary" data-a="knowledgeIntakePreview">${word('Read note', 'Прочитать заметку')}</button></div>
    <p class="knowledge-intake-state" id="knowledge-intake-state" tabindex="-1" role="status" aria-live="polite">${value?.state === 'closed' ? word('Resolved', 'Разобрано') : pending ? word('To process', 'На разбор') : word('Not in intake', 'Ещё не на разборе')}${owner ? ` · <span translate="no">${esc(owner.name)}</span>` : ''}${stamp ? ` · ${esc(stamp)}` : ''}</p>
    ${!model.summary && model.canWrite ? `<button class="btn btn-primary" data-a="knowledgeIntakeSend" data-command="enroll" ${control ? '' : 'disabled'}>${word('Add to team intake', 'Добавить на разбор команды')}</button>` : ''}
    ${!model.canManage ? `<p class="hint">${model.canWrite ? word('The responsible member or an administrator manages this material.', 'Материалом управляет ответственный или администратор.') : word('View only', 'Только просмотр')}</p>` : ''}
    ${model.summary && model.canManage ? `<details class="knowledge-review-section knowledge-intake-responsibility" ${disclosureAttributes(`knowledge-intake-responsibility:${m.noteId}:${value?.state || 'open'}`)}><summary>${word('Responsibility settings', 'Назначение ответственного')}</summary><div class="knowledge-review-fields"><label class="field">${word('Responsible', 'Ответственный')}<select class="select" data-in="knowledgeIntakeField" data-field="ownerId" ${control ? '' : 'disabled'}>${owner && !people.some(member => member.id === owner.id) ? `<option value="${esc(owner.id)}" selected disabled>${esc(owner.name)} · ${word('Unavailable', 'Недоступен')}</option>` : ''}${people.map(member => option(member.id, member.name, m.ownerId)).join('')}</select></label><div class="knowledge-review-buttons"><button class="btn btn-secondary" data-a="knowledgeIntakeSend" data-command="assign" ${control ? '' : 'disabled'}>${word('Assign', 'Назначить')}</button></div></div></details>` : ''}
    ${result ? `<div class="knowledge-intake-result"><strong>${esc(outcome(result.outcome))}</strong>${result.reason ? `<p translate="no">${esc(result.reason)}</p>` : ''}<div class="knowledge-review-buttons">${target(result, model)}${model.canManage ? `<button class="btn btn-secondary" data-a="knowledgeIntakeSend" data-command="reopen" ${control ? '' : 'disabled'}>${word('Reopen', 'Вернуть на разбор')}</button>` : ''}</div></div>` : ''}
    ${
      pending && model.canManage
        ? `<section class="knowledge-review-section"><h3>${word('Outcome', 'Итог разбора')}</h3><label class="field">${word('Choose outcome', 'Выберите итог')}<select class="select" data-in="knowledgeIntakeField" data-field="outcome" ${control ? '' : 'disabled'}>${['knowledge', 'project', 'duplicate', 'dismissed'].map(value => option(value, outcome(value), m.outcome)).join('')}</select></label>
      ${m.outcome === 'project' ? `<label class="field">${word('Project', 'Проект')}<select class="select" data-in="knowledgeIntakeField" data-field="projectId" ${control ? '' : 'disabled'}><option value="">${word('Choose project', 'Выберите проект')}</option>${model.projects.map(project => option(project.id, project.name, m.projectId)).join('')}</select></label><p class="hint">${word('Handoff records a project link. The note stays shared with the workspace; no copy or permission change.', 'Передача сохраняет ссылку на проект. Заметка остаётся общей для пространства; копия не создаётся, права не меняются.')}</p>` : ''}
      ${m.outcome === 'duplicate' ? duplicatePicker(m, control) : ''}
      <label class="field">${word('Reason (required for duplicate or no action)', 'Пояснение (обязательно для дубликата и отказа)')}<textarea class="textarea" rows="3" maxlength="1000" data-in="knowledgeIntakeField" data-field="reason" ${control ? '' : 'disabled'}>${esc(m.reason || '')}</textarea></label>
      <button class="btn btn-primary" data-a="knowledgeIntakeSend" data-command="resolve" ${control ? '' : 'disabled'}>${word('Resolve material', 'Завершить разбор')}</button></section>`
        : ''
    }
    ${
      value
        ? `<details class="knowledge-review-section" ${disclosureAttributes(`knowledge-intake-history:${m.noteId}`)}><summary>${word('Intake history', 'История разбора')} · ${value.revision}</summary><p class="hint">${word('Last 50 events. Earlier omitted:', 'Последние 50 событий. Более ранних пропущено:')} ${value.omitted}</p><ul class="knowledge-review-history">${[
            ...value.events,
          ]
            .reverse()
            .slice(0, m.historyLimit || 10)
            .map(
              event =>
                `<li><strong>${esc(label(event.action))}${event.outcome ? ` · ${esc(outcome(event.outcome))}` : ''}</strong><span translate="no">${esc(model.members.find(member => member.id === event.by)?.name || event.by)}</span><span>${esc(fmtTimestamp(event.at))}</span>${event.reason ? `<p translate="no">${esc(event.reason)}</p>` : ''}</li>`,
            )
            .join(
              '',
            )}</ul>${value.events.length > (m.historyLimit || 10) ? `<button class="btn btn-secondary" data-a="knowledgeIntakeMore">${word('Show more', 'Показать ещё')}</button>` : ''}</details>`
        : ''
    }`;
}
function target(result, model) {
  if (result.targetUnavailable) return `<p class="hint">${word('The target is no longer accessible.', 'Цель больше недоступна.')}</p>`;
  if (result.projectId)
    return `<button class="btn btn-secondary" data-a="knowledgeIntakeProject" data-id="${esc(result.projectId)}">${esc(model.projects.find(project => project.id === result.projectId)?.name || word('Open project', 'Открыть проект'))}</button>`;
  if (result.duplicateId)
    return `<button class="btn btn-secondary" data-a="knowledgeIntakeTarget" data-id="${esc(result.duplicateId)}">${word('Open original', 'Открыть оригинал')}</button>`;
  return '';
}
function duplicatePicker(m, enabled) {
  return `<div class="knowledge-review-fields"><label class="field">${word('Search existing notes', 'Поиск существующих заметок')}<input class="input" maxlength="200" data-in="knowledgeIntakeField" data-field="duplicateQuery" value="${esc(m.duplicateQuery || '')}" ${enabled ? '' : 'disabled'}></label><div class="knowledge-review-buttons"><button class="btn btn-secondary" data-a="knowledgeIntakeSearch" ${enabled && !m.searching ? '' : 'disabled'}>${word('Find duplicates', 'Найти дубликаты')}</button></div></div><p class="hint">${word('Searches titles and indexed text. Matching notes are suggestions; choose the original explicitly.', 'Поиск по названиям и индексированному тексту. Совпадения — подсказки; оригинал нужно выбрать явно.')}</p>${m.searching ? `<p role="status">${word('Searching…', 'Поиск…')}</p>` : ''}${m.duplicates ? `<label class="field">${word('Original note', 'Оригинал')}<select class="select" data-in="knowledgeIntakeField" data-field="duplicateId" ${enabled ? '' : 'disabled'}><option value="">${word('Choose a note', 'Выберите заметку')}</option>${m.duplicates.map(note => option(note.id, note.title, m.duplicateId)).join('')}</select></label><p class="hint">${word('Matches shown:', 'Показано совпадений:')} ${m.duplicates.length}${m.duplicateTotal > m.duplicates.length ? ` / ${m.duplicateTotal}` : ''}</p>` : ''}`;
}
function queue(m) {
  const data = m.queue;
  return `<div class="knowledge-review-fields"><label class="field">${word('State', 'Состояние')}<select class="select" data-in="knowledgeIntakeFilter" data-field="state">${[
    ['open', word('To process', 'На разбор')],
    ['closed', word('Resolved', 'Разобрано')],
    ['all', word('All', 'Все')],
  ]
    .map(([id, name]) => option(id, name, m.state))
    .join(
      '',
    )}</select></label><label class="field">${word('Responsibility', 'Ответственность')}<select class="select" data-in="knowledgeIntakeFilter" data-field="owner">${option('', word('Anyone', 'Любой'), m.owner)}${option('me', word('Assigned to me', 'Назначено мне'), m.owner)}</select></label></div><label class="field">${word('Search titles, summaries and tags', 'Поиск по названиям, описаниям и тегам')}<input class="input" maxlength="200" data-in="knowledgeIntakeField" data-field="query" value="${esc(m.query || '')}"></label><button class="btn btn-secondary" data-a="knowledgeIntakeQueueSearch">${word('Search queue', 'Искать в очереди')}</button>
    ${data ? `<p role="status">${word('Materials:', 'Материалов:')} ${data.total}</p><ul class="knowledge-intake-list">${data.rows.map(row => `<li><button class="btn btn-ghost" data-a="knowledgeIntakeSelect" data-id="${esc(row.id)}"><span translate="no">${esc(row.title)}</span><small>${row.state === 'closed' ? word('Resolved', 'Разобрано') : row.state === 'unavailable' ? word('Unavailable', 'Недоступно') : word('To process', 'На разбор')}${row.ownerId ? ` · ${esc(D().members.find(member => member.id === row.ownerId)?.name || row.ownerId)}` : ` · ${word('Unassigned', 'Без ответственного')}`}</small></button></li>`).join('')}</ul><div class="knowledge-review-buttons"><button class="btn btn-secondary" data-a="knowledgeIntakePage" data-offset="${Math.max(0, m.offset - 25)}" ${m.offset > 0 ? '' : 'disabled'}>${word('Previous', 'Назад')}</button><button class="btn btn-secondary" data-a="knowledgeIntakePage" data-offset="${m.offset + 25}" ${m.offset + 25 < data.total ? '' : 'disabled'}>${word('Next', 'Далее')}</button></div>` : ''}`;
}
function view(m, H) {
  return `${H(word('Team intake', 'Командный разбор'))}<div class="modal-b knowledge-review knowledge-intake" translate="no" aria-busy="${!!m.busy}">${m.error ? `<p class="err" role="alert">${esc(m.error)}</p>` : ''}${m.failed ? `<button class="btn btn-secondary" data-a="knowledgeIntakeRetry" ${m.busy ? 'disabled' : ''}>${word('Retry unconfirmed request', 'Повторить неподтверждённый запрос')}</button>` : ''}${m.loading ? `<p role="status">${word('Loading…', 'Загрузка…')}</p>` : m.noteId ? (m.model ? detail(m) : '') : queue(m)}</div>${footer(m)}`;
}
async function load(m) {
  if (!fresh(m) || m.busy) return;
  const nonce = (m.nonce = (m.nonce || 0) + 1);
  m.loading = true;
  m.error = '';
  render();
  try {
    await waitForPersonalPreferences();
    if (!fresh(m) || !workspaceSyncIsClean(S.data)) throw { local: true };
    if (m.noteId) {
      const model = await knowledgeIntakeRequest(m.noteId);
      if (!fresh(m) || m.nonce !== nonce) return;
      m.model = model;
      m.ownerId = model.intake?.ownerId || model.actor;
      m.outcome = 'knowledge';
      m.reason = '';
      m.duplicates = null;
      m.duplicateId = '';
      m.projectId = '';
      m.failed = null;
    } else {
      remembered = { scope: m.scope, state: m.state, owner: m.owner, query: m.query || '', offset: m.offset };
      const result = await getKnowledgeIntakeQueue({ state: m.state, owner: m.owner, query: m.query, offset: m.offset });
      if (fresh(m) && m.nonce === nonce) m.queue = result;
    }
  } catch (error) {
    if (fresh(m) && m.nonce === nonce)
      m.error = error.local
        ? word('Wait until local changes are saved, then refresh.', 'Дождитесь сохранения локальных изменений и обновите данные.')
        : message(error);
  } finally {
    if (fresh(m) && m.nonce === nonce) {
      m.loading = false;
      render();
    }
  }
}
export function openKnowledgeIntake(id = '') {
  if (active()) return;
  const filters = remembered?.scope === scope() ? remembered : { state: 'open', owner: '', query: '', offset: 0 };
  openModal({ ...filters, type: 'knowledgeTool', knowledgeIntake: true, scope: scope(), noteId: id, render: view });
  return load(active());
}
IN.knowledgeIntakeField = el => {
  const m = active();
  if (!m || m.busy) return;
  m[el.dataset.field] = el.value;
  if (el.dataset.field === 'outcome') render();
};
IN.knowledgeIntakeFilter = el => {
  const m = active();
  if (m && !m.busy) {
    m[el.dataset.field] = el.value;
    m.offset = 0;
    return load(m);
  }
};
A.knowledgeIntakeReload = () => load(active());
A.knowledgeIntakeSelect = el => {
  const m = active();
  if (m && !m.busy) {
    m.noteId = el.dataset.id;
    m.model = null;
    return load(m);
  }
};
A.knowledgeIntakeBack = () => {
  const m = active();
  if (m && !m.busy) {
    m.noteId = '';
    m.model = null;
    m.failed = null;
    return load(m);
  }
};
A.knowledgeIntakePage = el => {
  const m = active();
  if (m) {
    m.offset = Number(el.dataset.offset);
    return load(m);
  }
};
A.knowledgeIntakeQueueSearch = () => {
  const m = active();
  if (m) {
    m.offset = 0;
    return load(m);
  }
};
A.knowledgeIntakeMore = () => {
  const m = active();
  if (m) {
    m.historyLimit = (m.historyLimit || 10) + 10;
    render();
  }
};
A.knowledgeIntakeSearch = async () => {
  const m = active();
  if (!m || m.searching || !m.duplicateQuery?.trim()) return;
  const query = m.duplicateQuery,
    note = m.noteId,
    nonce = (m.searchNonce = (m.searchNonce || 0) + 1);
  m.searching = true;
  m.error = '';
  render();
  try {
    const result = await searchKnowledgePage({ query, mode: 'workspace' });
    if (!fresh(m) || m.noteId !== note || nonce !== m.searchNonce || m.duplicateQuery !== query) return;
    m.duplicates = (result.ids || [])
      .filter(id => id !== note)
      .map(id => D().knowledgeNotes.find(row => row.id === id))
      .filter(Boolean);
    m.duplicateTotal = Math.max(0, (result.total || 0) - ((result.matches || []).includes(note) ? 1 : 0));
    m.duplicateId = '';
  } catch (error) {
    if (fresh(m)) m.error = message(error);
  } finally {
    if (fresh(m) && nonce === m.searchNonce) {
      m.searching = false;
      render();
    }
  }
};
async function send(m, payload) {
  if (!fresh(m) || m.busy) return;
  m.busy = true;
  m.error = '';
  render();
  try {
    await waitForPersonalPreferences();
    if (!fresh(m) || !workspaceSyncIsClean(S.data)) throw { local: true };
    const model = await knowledgeIntakeRequest(m.noteId, payload);
    if (!fresh(m)) return;
    m.model = model;
    m.ownerId = model.intake?.ownerId || model.actor;
    m.failed = null;
    m.reason = '';
    await refreshWorkspaceFromServer();
  } catch (error) {
    if (fresh(m)) {
      m.error = error.local ? word('Wait until local changes are saved.', 'Дождитесь сохранения локальных изменений.') : message(error);
      m.failed = error.local || (error.status >= 400 && error.status < 500 && error.code !== 'REVISION_CONFLICT') ? null : payload;
    }
  } finally {
    if (fresh(m)) {
      m.busy = false;
      render();
      if (!m.error)
        requestAnimationFrame(() => {
          if (fresh(m)) document.getElementById('knowledge-intake-state')?.focus();
        });
    }
  }
}
A.knowledgeIntakeSend = el => {
  const m = active();
  if (!m?.model || m.busy || m.failed) return;
  const action = el.dataset.command;
  const payload = {
    action,
    operationId: crypto.randomUUID(),
    intakeRevision: m.model.intake?.revision || 0,
    ...(action === 'assign'
      ? { ownerId: m.ownerId }
      : action === 'resolve'
        ? {
            outcome: m.outcome,
            reason: m.reason || '',
            ...(m.outcome === 'project' ? { projectId: m.projectId || '' } : m.outcome === 'duplicate' ? { duplicateId: m.duplicateId || '' } : {}),
          }
        : {}),
  };
  return send(m, payload);
};
A.knowledgeIntakeRetry = () => {
  const m = active();
  if (m?.failed) return send(m, m.failed);
};
function preview(id) {
  if (!D().knowledgeNotes.some(note => note.id === id)) return;
  closeModal();
  return A.previewKnowledgeNote({ dataset: { id }, isConnected: false });
}
A.knowledgeIntakePreview = () => {
  const m = active();
  if (m && !m.busy) return preview(m.noteId);
};
A.knowledgeIntakeTarget = el => preview(el.dataset.id);
A.knowledgeIntakeProject = el => {
  if (active()?.busy) return;
  const id = el.dataset.id;
  closeModal();
  return A.openProject({ dataset: { id } });
};
