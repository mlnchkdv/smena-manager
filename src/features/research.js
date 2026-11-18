import '../styles/pages/research.css';
import { A, IN } from '../actions/registry.js';
import { S } from '../core/store.js';
import { researchRequest, getActiveWorkspace, getSessionGeneration } from '../core/api.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { openModal } from '../overlays/modals.js';
import { go, render } from '../shell/render.js';
import { renderKnowledgeMarkdown } from '../shared/knowledge-markdown.js';
import { rw, researchKind, researchState, researchProfile, researchFailure, researchDate } from '../ui/research-copy.js';
import { RESEARCH_PROFILES } from '../shared/research.js';

const state = () => {
  const key = [getActiveWorkspace(), getSessionGeneration(), S.ui.params.id].join(':');
  if (S.ui.research?.key !== key)
    S.ui.research = { key, project: S.ui.params.id, view: 'experiments', query: '', rows: null, selected: null, error: '', loading: false, offset: 0 };
  return S.ui.research;
};
const active = model => S.ui.research === model && model.key === [getActiveWorkspace(), getSessionGeneration(), S.ui.params.id].join(':');
async function loadResearch(model = state()) {
  if (model.loading) return;
  model.loading = true;
  model.error = '';
  try {
    const result = await researchRequest(
      model.project,
      '?' +
        new URLSearchParams({
          q: model.query,
          offset: String(model.offset),
          limit: '50',
          ...(model.view === 'experiments'
            ? { kind: 'experiment' }
            : model.view === 'materials'
              ? { kind: 'source,dataset,protocol,article,review,handoff' }
              : {}),
        }),
    );
    if (active(model)) {
      model.catalog = result;
      model.rows = result.items;
    }
  } catch (error) {
    if (active(model)) model.error = researchFailure(error);
  } finally {
    if (active(model)) {
      model.loading = false;
      render();
    }
  }
}
const dataField = (name, label, value = '', type = 'text') =>
  `<label class="field">${esc(label)}<input class="input" type="${type}" data-in="researchField" data-field="${esc(name)}" value="${esc(value ?? '')}" maxlength="${name === 'title' ? 240 : 8000}"></label>`;
function recordFields(m) {
  const record = m.record,
    data = record.data;
  return `${dataField('title', rw('Title', 'Название'), record.title)}${record.kind === 'experiment' ? `${dataField('hypothesis', rw('What are we testing?', 'Что проверяем?'), data.hypothesis)}${dataField('baseline', rw('Baseline', 'С чем сравниваем?'), data.baseline)}${dataField('factor', rw('What changes?', 'Что изменяем?'), data.factor)}${dataField('criterion', rw('Success criterion agreed before results', 'Критерий успеха до получения результата'), data.criterion)}` : ''}${record.kind === 'run' ? `<label class="field">${rw('Run profile', 'Профиль запуска')}<select class="select" data-in="researchField" data-field="profile">${RESEARCH_PROFILES.map(profile => `<option value="${profile}" ${data.profile === profile ? 'selected' : ''}>${esc(researchProfile(profile))}</option>`).join('')}</select></label>` : ''}<label class="field">${rw('Notes', 'Описание')}<textarea class="textarea" rows="6" data-in="researchField" data-field="body" maxlength="64000">${esc(record.body || '')}</textarea></label>`;
}
function form(model, record) {
  const generation = getSessionGeneration();
  openModal({
    type: 'researchForm',
    project: model.project,
    generation,
    record: structuredClone(record || { kind: 'experiment', title: '', body: '', data: {} }),
    original: !!record,
    render: (m, H) =>
      `${H(m.original ? rw('Edit research record', 'Изменить запись исследования') : rw('New research record', 'Новая запись исследования'))}<div class="modal-b research-form" translate="no">${recordFields(m)}${m.error ? `<p role="alert">${esc(m.error)}</p>` : ''}</div><div class="modal-f"><button class="btn btn-secondary" data-a="closeModal" ${m.busy ? 'disabled' : ''}>${rw('Cancel', 'Отмена')}</button><button class="btn btn-primary" data-a="researchSave" ${m.busy ? 'disabled' : ''}>${m.busy ? rw('Saving…', 'Сохраняем…') : rw('Save record', 'Сохранить запись')}</button></div>`,
  });
}
IN.researchField = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'researchForm' || m.busy) return;
  if (['title', 'body'].includes(el.dataset.field)) m.record[el.dataset.field] = el.value;
  else m.record.data[el.dataset.field] = el.value;
};
IN.researchQuery = el => {
  const m = state();
  m.query = el.value;
};
A.researchSearch = () => {
  const m = state();
  m.offset = 0;
  void loadResearch(m);
};
A.researchRefresh = () => {
  const m = state();
  m.rows = null;
  void loadResearch(m);
  render();
};
A.researchView = el => {
  const m = state();
  m.view = el.dataset.view;
  m.selected = null;
  m.offset = 0;
  m.rows = null;
  void loadResearch(m);
  render();
};
A.researchPage = el => {
  const m = state();
  m.offset = Math.max(0, m.offset + Number(el.dataset.step) * 50);
  void loadResearch(m);
  render();
};
A.researchNew = el => {
  const model = state();
  form(model, null);
  const m = S.ui.modals.at(-1);
  m.record.kind = el.dataset.kind || 'experiment';
  render();
};
A.researchEdit = () => {
  const m = state();
  if (m.selected) form(m, m.selected);
};
A.researchBack = () => {
  state().selected = null;
  go('project', { id: state().project, tab: 'research' });
};
A.researchOpen = async el => {
  const model = state();
  model.error = '';
  try {
    const result = await researchRequest(model.project, '/records/' + encodeURIComponent(el.dataset.id));
    if (active(model)) {
      model.selected = result.record;
      go('project', { id: model.project, tab: 'research', researchId: result.record.id });
    }
  } catch (error) {
    if (active(model)) model.error = researchFailure(error);
  }
  if (active(model)) render();
};
A.researchEnable = async () => {
  const m = state();
  if (m.pending) return;
  m.pending = true;
  render();
  try {
    await researchRequest(m.project, '/commands', { operationId: crypto.randomUUID(), action: 'enable', enabled: true });
    if (active(m)) await loadResearch(m);
  } catch (error) {
    if (active(m)) m.error = researchFailure(error);
  } finally {
    if (active(m)) {
      m.pending = false;
      render();
    }
  }
};
A.researchSave = async () => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'researchForm' || m.busy || m.generation !== getSessionGeneration()) return;
  if (!m.record.title.trim()) {
    m.error = rw('Enter a title.', 'Введите название.');
    render();
    return;
  }
  m.busy = true;
  m.error = '';
  render();
  const draft = { kind: m.record.kind, title: m.record.title, body: m.record.body, data: m.record.data, tags: m.record.tags || [] };
  m.command ||= {
    operationId: crypto.randomUUID(),
    action: m.original ? 'update' : 'create',
    id: m.original ? m.record.id : crypto.randomUUID(),
    ...(m.original ? { expectedRevision: m.record.revision } : {}),
    record: draft,
  };
  try {
    const result = await researchRequest(m.project, '/commands', m.command);
    if (m.generation !== getSessionGeneration()) return;
    if (S.ui.modals.at(-1) === m) S.ui.modals.pop();
    const model = state();
    model.selected = result.record;
    model.rows = null;
    go('project', { id: model.project, tab: 'research', researchId: result.record.id });
    await loadResearch(model);
  } catch (error) {
    m.error = researchFailure(error);
    if (error.status >= 400 && error.status < 500) m.command = null;
  } finally {
    m.busy = false;
    if (m.generation === getSessionGeneration()) render();
  }
};
function details(record, canEdit) {
  const data = record.data;
  const labels = {
    hypothesis: rw('Hypothesis', 'Гипотеза'),
    baseline: rw('Baseline', 'Базовый вариант'),
    criterion: rw('Success criterion', 'Критерий успеха'),
    factor: rw('Changed factor', 'Изменяемый фактор'),
    conclusion: rw('Conclusion', 'Вывод'),
    nextStep: rw('Next step', 'Следующий шаг'),
  };
  return `<button class="btn btn-ghost" data-a="researchBack">${ic('arrow-left', 16)}${rw('All research', 'Все исследования')}</button><header class="research-record-head"><div><p class="hint">${esc(researchKind(record.kind))} · ${rw('Revision', 'Редакция')} ${record.revision}</p><h2 translate="no">${esc(record.title)}</h2></div>${canEdit ? `<button class="btn btn-secondary" data-a="researchEdit">${ic('pencil', 16)}${rw('Edit', 'Изменить')}</button>` : ''}</header><div class="research-status-line"><span>${data.state ? esc(researchState(data.state)) : rw('Draft', 'Черновик')}</span><span>${record.review?.status === 'reviewed' ? rw('Reviewed', 'Проверено') : rw('Not reviewed', 'Не проверено')}</span></div><dl class="research-properties">${Object.entries(
    labels,
  )
    .filter(([key]) => data[key])
    .map(([key, label]) => `<div><dt>${label}</dt><dd>${esc(data[key])}</dd></div>`)
    .join(
      '',
    )}</dl><article class="knowledge-body research-body" translate="no">${renderKnowledgeMarkdown(record.body || '')}</article><details class="research-technical"><summary>${rw('Record details', 'Паспорт записи')}</summary><dl class="research-properties"><div><dt>ID</dt><dd>${esc(record.id)}</dd></div><div><dt>${rw('Last updated', 'Изменено')}</dt><dd>${esc(researchDate(record.updatedAt, true))}</dd></div></dl></details>`;
}
export function researchHtml() {
  const m = state();
  const requested = S.ui.params.researchId || '';
  if (requested && m.selected?.id !== requested && m.requestedAttempt !== requested) {
    m.requestedAttempt = requested;
    void A.researchOpen({ dataset: { id: requested } });
  }
  if (!m.rows && !m.loading && !m.error) void loadResearch(m);
  if (!m.catalog && m.loading) return `<div class="research-page" role="status">${rw('Loading research…', 'Загружаем исследования…')}</div>`;
  const error = m.error
    ? `<div class="research-error" role="alert">${esc(m.error)}<button class="btn btn-secondary" data-a="researchRefresh">${rw('Retry', 'Повторить')}</button></div>`
    : '';
  if (!m.catalog) return `<section class="research-page">${error}</section>`;
  if (!m.catalog.enabled)
    return `<section class="research-page research-empty" translate="no"><h2>${rw('Research journal', 'Журнал исследований')}</h2><p>${rw('Keep hypotheses, runs, evidence and decisions together in this project.', 'Соберите гипотезы, запуски, доказательства и решения в этом проекте.')}</p>${m.catalog.canConfigure ? `<button class="btn btn-primary" data-a="researchEnable" ${m.pending ? 'disabled' : ''}>${rw('Enable research for this project', 'Включить исследования для проекта')}</button>` : `<p>${rw('Ask the project owner to enable the journal.', 'Попросите руководителя проекта включить журнал.')}</p>`}${error}</section>`;
  if (m.selected) return `<section class="research-page" translate="no">${error}${details(m.selected, m.catalog.canEdit)}</section>`;
  const rows = m.view === 'materials' ? (m.rows || []).filter(row => !['experiment', 'run', 'observation'].includes(row.kind)) : m.rows || [];
  return `<section class="research-page" translate="no"><header class="research-toolbar"><div class="seg" role="group" aria-label="${rw('Research views', 'Представления исследований')}">${[
    ['experiments', rw('Experiments', 'Эксперименты')],
    ['journal', rw('Journal', 'Журнал')],
    ['materials', rw('Materials', 'Материалы')],
  ]
    .map(
      ([id, name]) => `<button class="${m.view === id ? 'on' : ''}" data-a="researchView" data-view="${id}" aria-pressed="${m.view === id}">${name}</button>`,
    )
    .join(
      '',
    )}</div>${m.catalog.canEdit ? `<div class="row"><button class="btn btn-secondary" data-a="researchNew" data-kind="observation">${ic('notebook-pen', 16)}${rw('Quick note', 'Быстрая запись')}</button><button class="btn btn-primary" data-a="researchNew" data-kind="experiment">${ic('plus', 16)}${rw('New experiment', 'Новый эксперимент')}</button></div>` : ''}</header><form class="research-search" data-submit="researchSearch"><label class="sr" for="research-query">${rw('Search research', 'Поиск исследований')}</label><input id="research-query" class="input" data-in="researchQuery" value="${esc(m.query)}" placeholder="${rw('Search research', 'Поиск исследований')}" maxlength="200"><button class="btn btn-secondary">${rw('Search', 'Найти')}</button></form>${error}${m.loading ? `<p role="status">${rw('Updating…', 'Обновляем…')}</p>` : ''}<div class="research-list">${rows.map(row => `<button class="research-list-item" data-a="researchOpen" data-id="${esc(row.id)}"><span class="research-list-title">${esc(row.title)}</span><span class="hint">${esc(researchKind(row.kind))}${row.state ? ' · ' + esc(researchState(row.state)) : ''}</span><span class="hint">${esc(researchDate(row.updatedAt))}</span></button>`).join('') || `<div class="research-empty"><h2>${rw('Start with a question', 'Начните с вопроса')}</h2><p>${rw('Create an experiment or capture an observation. Runs and evidence will stay linked to it.', 'Создайте эксперимент или запишите наблюдение. Запуски и доказательства останутся связаны с ним.')}</p></div>`}</div><footer class="research-pagination"><span class="hint">${rw('Records', 'Записей')}: ${m.catalog.total}</span><button class="btn btn-ghost" data-a="researchPage" data-step="-1" ${m.offset ? '' : 'disabled'}>${rw('Previous', 'Назад')}</button><button class="btn btn-ghost" data-a="researchPage" data-step="1" ${m.offset + 50 < m.catalog.total ? '' : 'disabled'}>${rw('Next', 'Далее')}</button></footer></section>`;
}
