import '../styles/pages/research.css';
import { A, IN } from '../actions/registry.js';
import { S } from '../core/store.js';
import { researchRequest, downloadResearchZip, getActiveWorkspace, getSessionGeneration } from '../core/api.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { openModal } from '../overlays/modals.js';
import { go, render } from '../shell/render.js';
import { renderKnowledgeMarkdown } from '../shared/knowledge-markdown.js';
import { rw, researchKind, researchState, researchFailure, researchDate } from '../ui/research-copy.js';
import { researchTemplate, researchMetricDefaults, protocolResearchMetrics, repeatResearchRun } from '../shared/research-templates.js';
import { RESEARCH_LIMITS } from '../shared/research.js';
import { researchFormFields } from '../ui/research-form.js';
import { researchEvidenceHtml, researchDisclosure } from '../ui/research-evidence.js';
import { readPendingResearch, keepPendingResearch, clearPendingResearch } from '../core/research-pending.js';
import { researchComparisonHtml } from '../ui/research-comparison.js';
import { researchMetricsHtml } from '../ui/research-metrics.js';
import { RESEARCH_QUESTION_LABELS, researchReportMarkdown } from '../shared/research-report.js';
import { disclosureAttributes } from '../ui/disclosure.js';

const state = () => {
  const key = [getActiveWorkspace(), getSessionGeneration(), S.ui.params.id].join(':');
  if (S.ui.research?.key !== key)
    S.ui.research = { key, project: S.ui.params.id, view: 'experiments', query: '', rows: null, selected: null, error: '', loading: false, offset: 0 };
  return S.ui.research;
};
const active = model =>
  S.ui.route === 'project' &&
  S.ui.params.tab === 'research' &&
  S.ui.research === model &&
  model.key === [getActiveWorkspace(), getSessionGeneration(), S.ui.params.id].join(':');

const researchLocation = (model, id) => ({ id: model.project, tab: 'research', ...(id ? { researchId: id } : {}) });
async function loadResearch(model = state()) {
  const { appliedQuery: query = '', archived, view, offset } = model;
  const key = JSON.stringify([query, archived, view, offset]);
  if (model.listRequest?.key === key) return;
  const request = { key };
  model.listRequest = request;
  model.loading = true;
  model.error = '';
  const current = () => active(model) && model.listRequest === request;
  try {
    const result = await researchRequest(
      model.project,
      '?' +
        new URLSearchParams({
          q: query,
          archived: archived ? 'true' : 'false',
          offset: String(offset),
          limit: '50',
          ...(view === 'experiments' ? { kind: 'experiment' } : view === 'materials' ? { kind: 'source,dataset,protocol,article,review,handoff' } : {}),
        }),
    );
    if (current()) {
      model.catalog = result;
      if (model.selected) {
        const r = model.selected;
        model.catalog.canReview =
          (result.canConfigure || r.data.reviewerId === result.actorId) && r.createdBy !== result.actorId && r.updatedBy !== result.actorId;
      }
      if (offset && offset >= result.total) {
        model.offset = Math.max(0, Math.floor((result.total - 1) / 50) * 50);
        return loadResearch(model);
      }
      model.rows = result.items;
      model.unsent = readPendingResearch(getActiveWorkspace(), result.actorId, model.project);
    }
  } catch (error) {
    if (current()) model.error = researchFailure(error);
  } finally {
    if (model.listRequest === request) {
      model.listRequest = null;
      model.loading = false;
      if (active(model)) render();
    }
  }
}
function seedTemplate(kind, model) {
  return researchTemplate(kind, { russian: rw(false, true), ownerId: model.catalog?.actorId || '' });
}
function resetRaw(m) {
  m.rawConfig = JSON.stringify(m.record.data.config || {}, null, 2);
  m.rawManifest = JSON.stringify(m.record.data.manifest || {}, null, 2);
  m.rawMetrics = JSON.stringify(m.record.data.metrics || [], null, 2);
}
function form(model, record, kind = 'experiment') {
  const generation = getSessionGeneration();
  const m = {
    type: 'researchForm',
    project: model.project,
    generation,
    record: structuredClone(record || seedTemplate(kind, model)),
    original: !!record,
    draftId: crypto.randomUUID(),
    reviewers: model.catalog?.reviewers || [],
    render: (m, H) =>
      `${H(m.original ? rw('Edit research record', 'Изменить запись исследования') : rw('New research record', 'Новая запись исследования'))}<div class="modal-b research-form" translate="no"><fieldset ${m.busy || m.command ? 'disabled' : ''}>${researchFormFields(m)}</fieldset>${m.templatePending ? `<div class="research-error" role="alert"><p>${rw('Replace the draft body and properties with this template? The title is kept.', 'Заменить описание и свойства черновика выбранным шаблоном? Название сохранится.')}</p><button class="btn btn-secondary" data-a="researchApplyTemplate">${rw('Replace draft', 'Заменить черновик')}</button><button class="btn btn-ghost" data-a="researchCancelTemplate">${rw('Keep draft', 'Оставить черновик')}</button></div>` : ''}${m.error ? `<p role="alert">${esc(m.error)}</p>` : ''}</div><div class="modal-f"><button class="btn btn-secondary" data-a="closeModal" ${m.busy ? 'disabled' : ''}>${rw('Cancel', 'Отмена')}</button><button class="btn btn-primary" data-a="researchSave" ${m.busy ? 'disabled' : ''}>${m.busy ? rw('Saving…', 'Сохраняем…') : rw('Save record', 'Сохранить запись')}</button></div>`,
  };
  resetRaw(m);
  m.metricSeed = m.original ? '' : JSON.stringify(m.record.data.metrics || []);
  m.onClose = () => m.referenceController?.abort();
  openModal(m);
  if (['run', 'article', 'handoff'].includes(m.record.kind)) void loadReferences(m);
  return m;
}
IN.researchField = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'researchForm' || m.busy) return;
  if (['title', 'body'].includes(el.dataset.field)) m.record[el.dataset.field] = el.value;
  else if (el.dataset.field === 'seed') {
    if (el.value === '') delete m.record.data.seed;
    else m.record.data.seed = Number(el.value);
  } else if (el.dataset.field === 'profile') {
    m.record.data.profile = el.value;
    if (m.metricSeed === JSON.stringify(m.record.data.metrics || [])) {
      m.record.data.metrics = researchMetricDefaults(el.value, rw('Not measured yet', 'Ещё не измерено'));
      m.metricSeed = JSON.stringify(m.record.data.metrics);
      if (m.record.data.protocolId) void loadProtocolMetrics(m, false);
    }
    render();
  } else {
    if (['datasetId', 'protocolId'].includes(el.dataset.field) && m.record.data[el.dataset.field] !== el.value)
      delete m.record.data[el.dataset.field === 'datasetId' ? 'datasetVersion' : 'protocolVersion'];
    m.record.data[el.dataset.field] = el.value;
    if (el.dataset.field === 'protocolId') {
      m.protocolMetricMessage = '';
      const untouched = m.metricSeed === JSON.stringify(m.record.data.metrics || []);
      if (el.value && untouched) void loadProtocolMetrics(m, false);
      else {
        if (!el.value && untouched) {
          m.record.data.metrics = researchMetricDefaults(m.record.data.profile, rw('Not measured yet', 'Ещё не измерено'));
          m.metricSeed = JSON.stringify(m.record.data.metrics);
        }
        render();
      }
    }
  }
};
async function loadProtocolMetrics(m, explicit) {
  const protocolId = m.record.data.protocolId;
  if (!protocolId || m.record.data.protocolVersion || m.busy || m.command) return;
  const request = { protocolId };
  m.protocolMetricRequest = request;
  const open = () => S.ui.modals.includes(m) && m.generation === getSessionGeneration() && m.protocolMetricRequest === request;
  const current = () => open() && !m.busy && !m.command && m.record.kind === 'run' && m.record.data.protocolId === protocolId;
  render();
  try {
    const { record } = await researchRequest(m.project, '/records/' + encodeURIComponent(protocolId));
    if (!current() || record.kind !== 'protocol') return;
    const reason = rw('Not measured yet', 'Ещё не измерено');
    const fromProtocol = protocolResearchMetrics(record.data.config, reason);
    const currentMetrics = m.record.data.metrics || [];
    if (m.metricSeed === JSON.stringify(currentMetrics)) {
      m.record.data.metrics = fromProtocol.length ? fromProtocol : researchMetricDefaults(m.record.data.profile, reason);
      m.metricSeed = JSON.stringify(m.record.data.metrics);
    } else if (explicit && fromProtocol.length) {
      const merged = [...currentMetrics];
      for (const metric of fromProtocol) {
        if (merged.length === RESEARCH_LIMITS.metrics) break;
        if (!merged.some(existing => existing.key === metric.key && existing.unit === metric.unit && existing.scope === metric.scope)) merged.push(metric);
      }
      m.record.data.metrics = merged;
    }
    m.protocolMetricMessage = fromProtocol.length
      ? rw('Protocol metrics checked. Existing measurements are kept.', 'Метрики протокола проверены. Введённые измерения сохранены.')
      : rw('This protocol has no metric definitions. Profile metrics are available.', 'В протоколе нет определений метрик. Доступны метрики профиля.');
  } catch (error) {
    if (current()) m.protocolMetricMessage = researchFailure(error);
  } finally {
    if (open()) {
      m.protocolMetricRequest = null;
      render();
    }
  }
}
A.researchProtocolMetrics = () => {
  const m = S.ui.modals.at(-1);
  if (m?.type === 'researchForm' && m.record.kind === 'run' && m.record.data.state === 'planned') void loadProtocolMetrics(m, true);
};
IN.researchRaw = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type === 'researchForm' && !m.busy) m[{ config: 'rawConfig', manifest: 'rawManifest', metrics: 'rawMetrics' }[el.dataset.field]] = el.value;
};
IN.researchFileQuery = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type === 'researchForm') m.fileQuery = el.value;
};
IN.researchMetric = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'researchForm' || m.busy || m.command) return;
  const metric = m.record.data.metrics?.[Number(el.dataset.index)];
  if (!metric) return;
  const key = el.dataset.field;
  metric[key] = ['n', 'value'].includes(key) ? (el.value === '' ? null : Number(el.value)) : el.value;
  if (metric.status === 'measured') {
    metric.protocolId = m.record.data.protocolId || '';
    metric.scope ||= 'scene';
    metric.aggregation ||= 'mean';
  } else metric.value = null;
  if (key === 'status') render();
};
A.researchAddMetric = () => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'researchForm' || m.busy || m.command) return;
  m.record.data.metrics ||= [];
  m.record.data.metrics.push({
    key: 'metric_' + (m.record.data.metrics.length + 1),
    unit: '',
    value: null,
    status: 'missing',
    reason: rw('Not measured yet', 'Ещё не измерено'),
    origin: 'team',
  });
  render();
};
A.researchRemoveMetric = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'researchForm' || m.busy || m.command) return;
  m.record.data.metrics.splice(Number(el.dataset.index), 1);
  render();
};
A.researchCompare = () => {
  const model = state();
  const source = model.selected;
  if (!source) return;
  const m = {
    type: 'researchCompare',
    project: model.project,
    experiment: source.kind === 'experiment' ? source.id : source.data.experimentId,
    baseline: source.kind === 'run' ? source.id : '',
    ids: [],
    rows: null,
    records: new Map(),
    requests: new Set(),
    generation: getSessionGeneration(),
    render: (m, H) => H(rw('Compare runs', 'Сравнение запусков')) + researchComparisonHtml(m),
  };
  openModal(m);
  void loadComparisonRuns(m);
};
async function loadComparisonRuns(m) {
  m.loadingRows = true;
  m.error = '';
  render();
  try {
    if (!m.experiment) {
      m.rows = [];
      return;
    }
    const result = await researchRequest(m.project, '?kind=run&limit=100&experiment=' + encodeURIComponent(m.experiment));
    m.rows = result.items;
    if (m.baseline && m.rows.some(row => row.id === m.baseline)) m.ids = [m.baseline];
  } catch (error) {
    m.error = researchFailure(error);
  } finally {
    m.loadingRows = false;
    if (S.ui.modals.includes(m) && m.generation === getSessionGeneration()) render();
  }
}
function loadComparisonRecords(m) {
  if (m.ids.length < 2) return;
  for (const id of m.ids) {
    if (m.records.has(id) || m.requests.has(id)) continue;
    m.requests.add(id);
    void researchRequest(m.project, '/records/' + encodeURIComponent(id))
      .then(result => m.records.set(id, result.record))
      .catch(error => {
        if (m.ids.includes(id)) m.error = researchFailure(error);
      })
      .finally(() => {
        m.requests.delete(id);
        if (S.ui.modals.includes(m) && m.generation === getSessionGeneration()) render();
      });
  }
}
A.researchPickCompare = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'researchCompare' || !m.rows?.some(row => row.id === el.dataset.id)) return;
  if (m.ids.includes(el.dataset.id)) m.ids = m.ids.filter(id => id !== el.dataset.id);
  else if (m.ids.length < 4) m.ids.push(el.dataset.id);
  else return;
  m.error = '';
  loadComparisonRecords(m);
  render();
};
A.researchRetryCompare = () => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'researchCompare') return;
  if (!m.rows && !m.loadingRows) return loadComparisonRuns(m);
  m.error = '';
  loadComparisonRecords(m);
  render();
};
A.researchFindFiles = async () => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'researchForm' || m.busy || m.filesLoading) return;
  m.error = '';
  m.filesLoading = true;
  render();
  try {
    const result = await researchRequest(m.project, '/files?q=' + encodeURIComponent(m.fileQuery || ''));
    if (S.ui.modals.includes(m) && m.generation === getSessionGeneration()) {
      m.files = result.items;
      render();
    }
  } catch (error) {
    m.error = researchFailure(error);
    render();
  } finally {
    m.filesLoading = false;
    if (S.ui.modals.includes(m) && m.generation === getSessionGeneration()) render();
  }
};
A.researchAttachFile = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'researchForm' || m.busy) return;
  m.record.data.artifacts ||= [];
  if (m.record.data.artifacts.some(item => item.fileId === el.dataset.id))
    m.record.data.artifacts = m.record.data.artifacts.filter(item => item.fileId !== el.dataset.id);
  else m.record.data.artifacts.push({ fileId: el.dataset.id, role: 'evidence' });
  render();
};
IN.researchTemplate = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'researchForm' || m.original || m.busy || el.value === m.record.kind) return;
  m.templatePending = el.value;
  if (!m.record.title.trim() && m.record.body === seedTemplate(m.record.kind, state()).body) A.researchApplyTemplate();
  else render();
};
A.researchApplyTemplate = () => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'researchForm' || !m.templatePending) return;
  const title = m.record.title;
  m.record = seedTemplate(m.templatePending, state());
  m.record.title = title;
  m.templatePending = null;
  m.command = null;
  resetRaw(m);
  m.metricSeed = JSON.stringify(m.record.data.metrics || []);
  render();
  if (['run', 'article', 'handoff'].includes(m.record.kind) && !m.references) void loadReferences(m);
};
A.researchCancelTemplate = () => {
  const m = S.ui.modals.at(-1);
  if (m?.type === 'researchForm') {
    m.templatePending = null;
    render();
  }
};
IN.researchQuery = el => {
  const m = state();
  m.query = el.value;
};
A.researchSearch = () => {
  const m = state();
  m.appliedQuery = m.query.trim();
  m.offset = 0;
  void loadResearch(m);
  render();
};
A.researchClearSearch = () => {
  state().query = '';
  A.researchSearch();
  document.getElementById('research-query')?.focus();
};
A.researchRefresh = () => {
  const m = state();
  m.recordError = null;
  m.error = '';
  void loadResearch(m);
  render();
};
A.researchView = el => {
  const m = state();
  m.view = el.dataset.view;
  m.selected = null;
  m.offset = 0;
  void loadResearch(m);
  render();
};
A.researchToggleArchive = () => {
  const m = state();
  m.archived = !m.archived;
  m.offset = 0;
  void loadResearch(m);
  render();
};
IN.researchReferenceQuery = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type === 'researchForm') m.referenceQuery = el.value;
};
async function loadReferences(m, query = '') {
  m.referenceController?.abort();
  const controller = new AbortController();
  m.referenceController = controller;
  m.referenceStatus = 'loading';
  const current = () =>
    !controller.signal.aborted && m.referenceController === controller && S.ui.modals.includes(m) && m.generation === getSessionGeneration();
  render();
  try {
    const result = await researchRequest(m.project, '?kind=experiment,dataset,protocol&limit=100&q=' + encodeURIComponent(query), undefined, {
      signal: controller.signal,
    });
    if (current()) {
      const selected = [m.record.data.experimentId, m.record.data.datasetId, m.record.data.protocolId];
      m.selectedReferences = [
        ...new Map([...(m.selectedReferences || []), ...(m.references || [])].filter(row => selected.includes(row.id)).map(row => [row.id, row])).values(),
      ];
      m.references = result.items;
      m.referenceStatus = result.items.length ? 'ready' : 'empty';
    }
  } catch {
    if (current()) m.referenceStatus = 'error';
  } finally {
    if (current()) render();
  }
}
A.researchFindReferences = () => {
  const m = S.ui.modals.at(-1);
  if (m?.type === 'researchForm' && !m.busy && !m.command) void loadReferences(m, m.referenceQuery?.trim());
};
A.researchPage = el => {
  const m = state();
  m.offset = Math.max(0, m.offset + Number(el.dataset.step) * 50);
  void loadResearch(m);
  render();
};
A.researchNew = el => {
  const model = state();
  if (model.unsent) {
    model.error = rw('Resolve the pending save before creating another record.', 'Сначала завершите ожидающее сохранение.');
    render();
    return;
  }
  const m = form(model, null, el.dataset.kind || 'experiment');
  if (m.record.kind === 'run' && model.selected?.kind === 'experiment') m.record.data.experimentId = model.selected.id;
  render();
};
A.researchEdit = () => {
  const m = state();
  if (m.selected) form(m, m.selected);
};
A.researchBack = () => {
  go('project', researchLocation(state()));
};
A.researchOpen = el => go('project', researchLocation(state(), el.dataset.id));
async function loadResearchRecord(model, id) {
  const request = { id };
  model.recordRequest = request;
  model.recordError = null;
  const current = () => active(model) && S.ui.params.researchId === id && model.recordRequest === request;
  try {
    const result = await researchRequest(model.project, '/records/' + encodeURIComponent(id));
    if (current()) {
      model.selected = result.record;
      model.related = result.related || [];
      if (model.catalog) model.catalog.canReview = result.canReview;
    }
  } catch (error) {
    if (current()) model.recordError = { id, message: researchFailure(error) };
  } finally {
    const shouldRender = current();
    if (model.recordRequest === request) model.recordRequest = null;
    if (shouldRender) render();
  }
}
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
  const model = state(),
    workspace = getActiveWorkspace(),
    actorId = model.catalog?.actorId;
  if (model.project !== m.project || !actorId) return;
  if (model.savingForm || (model.unsent && model.unsent.operationId !== m.command?.operationId)) {
    m.error = rw('Finish the previous save before saving this record.', 'Завершите предыдущее сохранение перед записью этой формы.');
    render();
    return;
  }
  if (!m.record.title.trim()) {
    m.error = rw('Enter a title.', 'Введите название.');
    render();
    return;
  }
  try {
    if (['run', 'protocol'].includes(m.record.kind)) m.record.data.config = JSON.parse(m.rawConfig || '{}');
    if (m.record.kind === 'dataset') m.record.data.manifest = JSON.parse(m.rawManifest || '{}');
  } catch {
    m.error = rw(
      'Check the JSON fields: use double quotes and remove trailing commas.',
      'Проверьте JSON: используйте двойные кавычки и уберите лишние запятые.',
    );
    render();
    return;
  }
  if (m.nextState) m.record.data.state = m.nextState;
  m.busy = true;
  model.savingForm = true;
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
    keepPendingResearch(workspace, actorId, m.project, m.command);
    const result = await researchRequest(m.project, '/commands', m.command);
    if (m.generation !== getSessionGeneration()) return;
    const verified = await researchRequest(m.project, '/records/' + encodeURIComponent(result.record.id));
    if (verified.record.revision !== result.record.revision || verified.record.body !== result.record.body) throw new Error('RESEARCH_READBACK_PENDING');
    if (m.generation !== getSessionGeneration()) return;
    clearPendingResearch(workspace, actorId, m.project);
    model.unsent = null;
    model.rows = null;
    if (!active(model)) return;
    if (!S.ui.modals.includes(m)) return;
    if (S.ui.modals.at(-1) === m) S.ui.modals.pop();
    model.selected = verified.record;
    model.related = verified.related || [];
    model.catalog.canReview = verified.canReview;
    go('project', researchLocation(model, result.record.id));
    await loadResearch(model);
  } catch (error) {
    m.error = researchFailure(error);
    if (error.status >= 400 && error.status < 500) {
      clearPendingResearch(workspace, actorId, m.project);
      if (model.unsent?.operationId === m.command?.operationId) model.unsent = null;
      m.command = null;
    } else {
      if (active(model)) model.unsent = m.command;
    }
  } finally {
    m.busy = false;
    model.savingForm = false;
    if (m.generation === getSessionGeneration() && active(model)) render();
  }
};
A.researchRecover = async () => {
  const m = state();
  if (!m.unsent || m.pending || m.savingForm) return;
  m.pending = true;
  render();
  try {
    const status = await researchRequest(m.project, '/operations/' + encodeURIComponent(m.unsent.operationId));
    const result = status.state === 'completed' ? status : await researchRequest(m.project, '/commands', m.unsent);
    if (!active(m)) return;
    clearPendingResearch(getActiveWorkspace(), m.catalog.actorId, m.project);
    m.unsent = null;
    m.error = '';
    m.rows = null;
    go('project', researchLocation(m, result.record.id));
    await loadResearch(m);
  } catch (error) {
    if (active(m)) m.error = researchFailure(error);
  } finally {
    if (active(m)) {
      m.pending = false;
      render();
    }
  }
};
async function recordCommand(action) {
  const m = state();
  if (m.pending || !m.selected) return;
  m.pending = true;
  m.error = '';
  render();
  try {
    const result = await researchRequest(m.project, '/commands', {
      operationId: crypto.randomUUID(),
      action,
      id: m.selected.id,
      expectedRevision: m.selected.revision,
    });
    if (active(m)) {
      m.selected = result.record;
      await loadResearch(m);
    }
  } catch (error) {
    if (active(m)) m.error = researchFailure(error);
  } finally {
    if (active(m)) {
      m.pending = false;
      render();
    }
  }
}
A.researchArchive = () => recordCommand(state().selected?.archived ? 'restore' : 'archive');
A.researchReview = () => recordCommand('review');
A.researchDraftArticle = async () => {
  const model = state(),
    source = model.selected;
  if (!source || model.draftingArticle) return;
  model.draftingArticle = source.id;
  const current = () => active(model) && S.ui.params.researchId === source.id;
  render();
  try {
    const experiment = source.kind === 'experiment' ? source.id : source.data.experimentId;
    const listing = await researchRequest(model.project, '?kind=run&limit=100' + (experiment ? '&experiment=' + encodeURIComponent(experiment) : ''));
    const rows = listing.items.filter(row => row.experimentId === (source.kind === 'experiment' ? source.id : source.data.experimentId));
    if (listing.total > 100) throw { code: 'RESEARCH_EXPORT_LIMIT' };
    const runs = await Promise.all(rows.map(async row => (await researchRequest(model.project, '/records/' + encodeURIComponent(row.id))).record));
    if (!current()) return;
    const m = form(model, null, 'article');
    m.record.title = source.title + rw(' · findings', ' · результаты');
    m.record.body = researchReportMarkdown(source, runs, rw(false, true), { includeTitle: false });
    m.record.data.experimentId = source.kind === 'experiment' ? source.id : source.data.experimentId || '';
    render();
  } catch (error) {
    if (current()) model.error = researchFailure(error);
  } finally {
    model.draftingArticle = null;
    if (active(model)) render();
  }
};
A.researchExport = async () => {
  const m = state();
  const id = m.selected?.id;
  if (!id || (m.export?.id === id && ['preparing', 'saving'].includes(m.export.status))) return;
  if (m.export?.href) URL.revokeObjectURL(m.export.href);
  const job = { id, status: 'preparing' };
  m.export = job;
  render();
  try {
    const blob = await downloadResearchZip(m.project, id, rw('en', 'ru'));
    if (blob.type !== 'application/zip' || !blob.size) throw new Error('RESEARCH_EXPORT_INVALID');
    if (!active(m) || m.export !== job || S.ui.params.researchId !== id) {
      job.status = '';
      return;
    }
    const href = URL.createObjectURL(blob);
    Object.assign(job, { blob, href, filename: `research-${id}.zip`, status: 'ready' });
    setTimeout(() => {
      URL.revokeObjectURL(href);
      delete job.href;
      delete job.blob;
      if (job.status === 'ready') job.status = 'expired';
      if (active(m) && m.export === job && S.ui.params.researchId === id) render();
    }, 180000);
  } catch (error) {
    job.status = 'error';
    job.message =
      error.code === 'RESEARCH_EXPORT_LIMIT'
        ? researchFailure(error)
        : rw('Could not prepare the ZIP. Check your connection and try again.', 'Не удалось подготовить ZIP. Проверьте соединение и повторите.');
  } finally {
    if (active(m)) render();
  }
};
A.researchSaveZip = async () => {
  const m = state();
  const job = m.export;
  if (job?.id !== m.selected?.id || !job?.blob || job.status === 'saving') return;
  const blob = job.blob;
  const current = () => active(m) && m.export === job && S.ui.params.researchId === job.id;
  job.status = 'saving';
  job.saveError = '';
  try {
    const selection = window.showSaveFilePicker({
      suggestedName: job.filename,
      startIn: 'downloads',
      types: [{ description: rw('ZIP archive', 'Архив ZIP'), accept: { 'application/zip': ['.zip'] } }],
    });
    render();
    const handle = await selection;
    if (!current()) return;
    await blob.stream().pipeTo(await handle.createWritable());
    job.savedName = handle.name;
    job.status = 'saved';
  } catch (error) {
    if (error.name !== 'AbortError') {
      job.downloadOnly = ['SecurityError', 'NotAllowedError'].includes(error.name);
      job.saveError = rw('Could not save the ZIP to disk.', 'Не удалось сохранить ZIP на диск.');
    }
  } finally {
    if (job.status === 'saving') job.status = job.blob ? 'ready' : 'expired';
    if (current()) render();
  }
};
A.researchHistory = async () => {
  const model = state();
  if (!model.selected) return;
  const m = {
    type: 'researchHistory',
    project: model.project,
    current: model.selected,
    items: [],
    busy: true,
    canEdit: model.catalog.canEdit,
    generation: getSessionGeneration(),
    render: (m, H) =>
      `${H(rw('Record history', 'История записи'))}<div class="modal-b research-form" translate="no">${m.busy ? `<p role="status">${rw('Loading history…', 'Загружаем историю…')}</p>` : ''}${m.error ? `<p role="alert">${esc(m.error)}</p><button class="btn btn-secondary" data-a="researchMoreHistory">${rw('Retry loading history', 'Повторить загрузку истории')}</button>` : ''}${m.items.map((item, i) => `<details class="research-technical" ${researchDisclosure(m.current, 'revision:' + item.revision)}><summary>v${item.revision} · ${esc(researchDate(item.at, true))}</summary><article class="knowledge-body">${renderKnowledgeMarkdown(item.record.body)}</article><pre class="research-code">${esc(JSON.stringify(item.record.data, null, 2))}</pre>${m.canEdit ? `<button class="btn btn-secondary" data-a="researchRestoreVersion" data-index="${i}">${rw('Use as a new revision', 'Взять за основу новой редакции')}</button>` : ''}</details>`).join('') || (!m.busy && !m.error ? `<p>${rw('This is the first revision.', 'Это первая редакция.')}</p>` : '')}${m.cursor && !m.error ? `<button class="btn btn-secondary" data-a="researchMoreHistory" ${m.busy ? 'disabled' : ''}>${rw('Earlier revisions', 'Более ранние редакции')}</button>` : ''}</div><div class="modal-f"><button class="btn btn-secondary" data-a="closeModal">${rw('Close', 'Закрыть')}</button></div>`,
  };
  openModal(m);
  await loadHistory(m);
};
async function loadHistory(m) {
  m.busy = true;
  m.error = '';
  render();
  try {
    const result = await researchRequest(
      m.project,
      '/records/' + encodeURIComponent(m.current.id) + '/history' + (m.cursor ? '?cursor=' + encodeURIComponent(m.cursor) : ''),
    );
    if (S.ui.modals.includes(m) && m.generation === getSessionGeneration()) {
      m.items.push(...result.items);
      m.cursor = result.nextCursor;
    }
  } catch (error) {
    m.error = researchFailure(error);
  } finally {
    m.busy = false;
    if (S.ui.modals.includes(m)) render();
  }
}
A.researchMoreHistory = () => {
  const m = S.ui.modals.at(-1);
  if (m?.type === 'researchHistory' && !m.busy) void loadHistory(m);
};
A.researchRestoreVersion = el => {
  const m = S.ui.modals.at(-1),
    older = m?.items?.[Number(el.dataset.index)]?.record;
  if (m?.type !== 'researchHistory' || !older || !m.canEdit) return;
  S.ui.modals.pop();
  const restored = { ...older, revision: m.current.revision };
  const draft = form(state(), restored);
  draft.record.data.amendment = rw('Based on revision ', 'На основе редакции ') + older.revision;
  render();
};
A.researchTransition = el => {
  const model = state();
  if (!model.selected) return;
  const m = form(model, model.selected);
  m.nextState = el.dataset.state;
  render();
};
A.researchRepeat = () => {
  const model = state(),
    source = model.selected;
  if (source?.kind !== 'run') return;
  const m = form(model, null, 'run');
  m.record = repeatResearchRun(source, { russian: rw(false, true), ownerId: model.catalog.actorId });
  resetRaw(m);
  render();
};
A.researchLatestInputs = () => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'researchForm' || m.busy || m.command || m.record.data.state !== 'planned') return;
  delete m.record.data.datasetVersion;
  delete m.record.data.protocolVersion;
  render();
};
function researchRecordActions(record, canEdit) {
  const state = record.data.state || 'planned';
  const transitions = state === 'planned' ? ['running', 'cancelled'] : state === 'running' ? ['completed', 'failed', 'cancelled'] : [];
  const compare = ['experiment', 'run'].includes(record.kind)
    ? `<button class="btn btn-secondary" data-a="researchCompare">${rw('Compare runs', 'Сравнить запуски')}</button>`
    : '';
  if (record.archived) {
    const restore = canEdit
      ? `<button class="btn btn-secondary" data-a="researchArchive">${rw('Restore from archive', 'Восстановить из архива')}</button>`
      : '';
    return restore || compare ? `<div class="research-actions">${restore}${compare}</div>` : '';
  }
  const plan =
    canEdit && record.kind === 'experiment'
      ? `<button class="btn btn-primary" data-a="researchNew" data-kind="run">${rw('Plan run', 'Запланировать запуск')}</button>`
      : '';
  const run =
    canEdit && record.kind === 'run'
      ? transitions
          .map(
            next =>
              `<button class="btn ${['running', 'completed'].includes(next) ? 'btn-primary' : 'btn-secondary'}" data-a="researchTransition" data-state="${next}">${esc(next === 'running' ? rw('Start run', 'Начать запуск') : next === 'completed' ? rw('Complete run', 'Завершить запуск') : next === 'failed' ? rw('Record failure', 'Записать ошибку') : rw('Cancel run', 'Отменить запуск'))}</button>`,
          )
          .join('')
      : '';
  return plan || run || compare ? `<div class="research-actions">${plan}${run}${compare}</div>` : '';
}
function researchReadingActions(record, canEdit) {
  const model = state();
  const job = model.export?.id === record.id ? model.export : null;
  const busy = ['preparing', 'saving'].includes(job?.status);
  const download =
    job?.status === 'preparing'
      ? rw('Preparing ZIP…', 'Готовим ZIP…')
      : job?.status === 'error'
        ? rw('Retry ZIP preparation', 'Повторить подготовку ZIP')
        : rw('Prepare research ZIP', 'Подготовить ZIP исследования');
  const message = {
    ready: rw('ZIP is ready.', 'ZIP готов.'),
    saving: rw('Saving ZIP…', 'Сохраняем ZIP…'),
    saved: job?.savedName ? `${rw('Saved to disk', 'Сохранён на диск')} · ${job.savedName}` : '',
    expired: rw('The prepared ZIP expired. Prepare it again.', 'Срок хранения ZIP истёк. Подготовьте архив снова.'),
  }[job?.status];
  const error = job?.message || job?.saveError;
  const article =
    canEdit && ['run', 'experiment'].includes(record.kind)
      ? `<button class="btn btn-secondary" data-a="researchDraftArticle" ${model.draftingArticle ? 'disabled' : ''}>${model.draftingArticle === record.id ? rw('Preparing article…', 'Готовим мини-статью…') : rw('Draft findings article', 'Подготовить мини-статью')}</button>`
      : '';
  const save =
    job?.href && !busy
      ? typeof window.showSaveFilePicker === 'function' && !job.downloadOnly
        ? `<button class="btn btn-secondary btn-sm" data-a="researchSaveZip">${rw('Save ZIP', 'Сохранить ZIP')}</button>`
        : `<a class="btn btn-secondary btn-sm" href="${esc(job.href)}" download="${esc(job.filename)}">${rw('Save ZIP', 'Сохранить ZIP')}</a>`
      : '';
  const announcement = `${error ? `<p role="alert">${esc(error)}</p>` : ''}${message ? `<p role="status" class="hint">${esc(message)}</p>` : ''}${save}`;
  return `<details class="research-technical" ${researchDisclosure(record, 'reading-tools')}><summary>${rw('History, review and export', 'История, проверка и экспорт')}</summary><div class="research-actions"><button class="btn btn-secondary" data-a="researchHistory">${rw('History', 'История')}</button><button class="btn btn-secondary" data-a="researchExport" ${busy ? 'disabled aria-busy="true"' : ''}>${download}</button>${article}${model.catalog.canReview && record.review?.status !== 'reviewed' && !record.archived ? `<button class="btn btn-secondary" data-a="researchReview">${rw('Mark as reviewed', 'Отметить проверенным')}</button>` : ''}</div>${announcement}<p class="hint">${rw('ZIP contains Markdown, HTML, JSON, revision objects and checksums. Media bytes stay in Files; file access is unchanged.', 'ZIP содержит Markdown, HTML, JSON, объекты редакций и контрольные суммы. Медиа остаются в «Файлах» с текущими правами доступа.')}</p></details>`;
}
function details(record, canEdit) {
  const data = record.data;
  const editing = canEdit && !record.archived;
  return `<button class="btn btn-ghost" data-a="researchBack">${ic('arrow-left', 16)}${rw('Back to research', 'К списку исследований')}</button><header class="research-record-head"><div><p class="hint">${esc(researchKind(record.kind))} · ${rw('Revision', 'Редакция')} ${record.revision}</p><h2 translate="no">${esc(record.title)}</h2><div class="research-status-line">${record.archived ? `<span class="badge">${rw('Archived', 'В архиве')}</span>` : ''}${data.state ? `<span class="badge">${esc(researchState(data.state))}</span>` : ''}<span class="badge">${record.review?.status === 'reviewed' ? rw('Reviewed', 'Проверено') : rw('Not reviewed', 'Не проверено')}</span></div></div>${editing ? `<button class="btn btn-secondary" data-a="researchEdit">${ic('pencil', 16)}${rw('Edit', 'Изменить')}</button>` : ''}</header>${researchRecordActions(record, canEdit)}${researchReadingActions(record, editing)}<dl class="research-properties">${Object.entries(
    RESEARCH_QUESTION_LABELS,
  )
    .filter(([key]) => data[key])
    .map(([key, label]) => `<div><dt>${rw(...label)}</dt><dd>${esc(data[key])}</dd></div>`)
    .join('')}</dl><article class="knowledge-body research-body" translate="no">${renderKnowledgeMarkdown(record.body || '')}</article>${
    (state().related || []).length
      ? `<details class="research-technical" open><summary>${rw('Related records', 'Связанные записи')}</summary><div class="research-list">${state()
          .related.map(
            row =>
              `<button class="research-list-item" data-a="researchOpen" data-id="${esc(row.id)}"><span>${esc(row.title)}</span><span class="hint">${esc(researchKind(row.kind))}${row.state ? ' · ' + esc(researchState(row.state)) : ''}</span></button>`,
          )
          .join('')}</div></details>`
      : ''
  }${researchMetricsHtml(record)}${researchEvidenceHtml(record)}<details class="research-technical" ${researchDisclosure(record, 'passport')}><summary>${rw('Record details', 'Паспорт записи')}</summary><dl class="research-properties"><div><dt>ID</dt><dd>${esc(record.id)}</dd></div><div><dt>${rw('Last updated', 'Изменено')}</dt><dd>${esc(researchDate(record.updatedAt, true))}</dd></div></dl><pre class="research-code">${esc(JSON.stringify({ data: record.data, plan: record.plan || null }, null, 2))}</pre></details>${editing ? `<div class="research-actions">${record.kind === 'run' ? `<button class="btn btn-secondary" data-a="researchRepeat">${rw('Repeat as new run', 'Повторить новым запуском')}</button>` : ''}<button class="btn btn-ghost" data-a="researchArchive">${rw('Archive record', 'В архив')}</button></div>` : ''}`;
}
const materialKinds = ['source', 'dataset', 'protocol', 'article', 'review', 'handoff'];

function researchListContent(m) {
  if (m.loading || m.error) return '';
  const rows = m.rows || [];
  if (rows.length)
    return rows
      .map(
        row =>
          `<button class="research-list-item" data-a="researchOpen" data-id="${esc(row.id)}"><span class="research-list-title">${esc(row.title)}</span><span class="hint">${esc(researchKind(row.kind))}${row.state ? ' · ' + esc(researchState(row.state)) : ''}</span><span class="hint">${esc(researchDate(row.updatedAt))}</span></button>`,
      )
      .join('');
  if (m.appliedQuery)
    return `<div class="research-empty"><h2>${rw('No matching records', 'Записи не найдены')}</h2><p>${rw('Try another search or clear it to see all records in this view.', 'Уточните запрос или очистите его, чтобы увидеть все записи в этом представлении.')}</p></div>`;
  if (m.archived) return `<div class="research-empty"><h2>${rw('Archive is empty', 'Архив пуст')}</h2></div>`;
  if (m.view === 'materials')
    return `<div class="research-empty"><h2>${rw('No materials yet', 'Материалов пока нет')}</h2><p>${rw('Add a source, dataset or protocol for the team.', 'Добавьте источник, набор данных или протокол для команды.')}</p></div>`;
  return `<div class="research-empty"><h2>${rw('Start with a question', 'Начните с вопроса')}</h2><p>${rw('Create an experiment or capture an observation. Runs and evidence will stay linked to it.', 'Создайте эксперимент или запишите наблюдение. Запуски и доказательства останутся связаны с ним.')}</p></div>`;
}

function researchCreateActions(view) {
  if (view === 'materials')
    return `<details class="ui-menu" ${disclosureAttributes('research:material-types')}><summary class="btn btn-primary">${ic('plus', 16)}${rw('Add material', 'Добавить материал')}</summary><div class="ui-menu-content">${materialKinds.map(kind => `<button class="btn btn-ghost" data-a="researchNew" data-kind="${kind}">${esc(researchKind(kind))}</button>`).join('')}</div></details>`;
  return `<div class="row"><button class="btn btn-secondary" data-a="researchNew" data-kind="observation">${ic('notebook-pen', 16)}${rw('Quick note', 'Быстрая запись')}</button><button class="btn btn-primary" data-a="researchNew" data-kind="experiment">${ic('plus', 16)}${rw('New experiment', 'Новый эксперимент')}</button></div>`;
}

export function researchHtml() {
  const m = state();
  const requested = S.ui.params.researchId || '';
  if (!requested) {
    m.selected = null;
    m.related = [];
    m.recordRequest = null;
    m.recordError = null;
  } else if (m.selected?.id !== requested && m.recordRequest?.id !== requested && m.recordError?.id !== requested) {
    void loadResearchRecord(m, requested);
  }
  if (!m.rows && !m.loading && !m.error) void loadResearch(m);
  if (!m.catalog && m.loading) return `<div class="research-page" role="status">${rw('Loading research…', 'Загружаем исследования…')}</div>`;
  const recovery = m.unsent
    ? `<div class="research-error" role="status"><span>${rw('A previous save needs confirmation. The exact operation is kept on this device.', 'Предыдущее сохранение требует подтверждения. Исходная операция сохранена на этом устройстве.')}</span><button class="btn btn-secondary" data-a="researchRecover" ${m.pending ? 'disabled' : ''}>${rw('Check and resume save', 'Проверить и завершить')}</button></div>`
    : '';
  const error = m.error
    ? `<div class="research-error" role="alert">${esc(m.error)}<button class="btn btn-secondary" data-a="researchRefresh">${rw('Retry', 'Повторить')}</button></div>`
    : '';
  if (!m.catalog) return `<section class="research-page">${error}</section>`;
  if (!m.catalog.enabled)
    return `<section class="research-page research-empty" translate="no"><h2>${rw('Research journal', 'Журнал исследований')}</h2><p>${rw('Keep hypotheses, runs, evidence and decisions together in this project.', 'Соберите гипотезы, запуски, доказательства и решения в этом проекте.')}</p>${m.catalog.canConfigure ? `<button class="btn btn-primary" data-a="researchEnable" ${m.pending ? 'disabled' : ''}>${rw('Enable research for this project', 'Включить исследования для проекта')}</button>` : `<p>${rw('Ask the project owner to enable the journal.', 'Попросите руководителя проекта включить журнал.')}</p>`}${error}</section>`;
  if (requested) {
    if (m.selected?.id === requested)
      return `<section class="research-page" translate="no">${recovery}${error}${details(m.selected, m.catalog.canEdit)}</section>`;
    return `<section class="research-page" translate="no">${recovery}<button class="btn btn-ghost" data-a="researchBack">${rw('All research', 'Все исследования')}</button>${m.recordError?.id === requested ? `<div class="research-error" role="alert">${esc(m.recordError.message)}<button class="btn btn-secondary" data-a="researchRefresh">${rw('Retry', 'Повторить')}</button></div>` : `<p role="status">${rw('Loading record…', 'Загружаем запись…')}</p>`}</section>`;
  }
  return `<section class="research-page" translate="no">${recovery}<header class="research-toolbar"><div class="seg" role="group" aria-label="${rw('Research views', 'Представления исследований')}">${[
    ['experiments', rw('Experiments', 'Эксперименты')],
    ['journal', rw('Journal', 'Журнал')],
    ['materials', rw('Materials', 'Материалы')],
  ]
    .map(
      ([id, name]) => `<button class="${m.view === id ? 'on' : ''}" data-a="researchView" data-view="${id}" aria-pressed="${m.view === id}">${name}</button>`,
    )
    .join(
      '',
    )}</div>${m.catalog.canEdit && !m.archived ? researchCreateActions(m.view) : ''}</header><form class="research-search" data-submit="researchSearch" role="search"><label class="sr" for="research-query">${rw('Search research', 'Поиск исследований')}</label><input id="research-query" class="input" type="search" data-in="researchQuery" value="${esc(m.query)}" placeholder="${rw('Search research', 'Поиск исследований')}" maxlength="200"><button class="btn btn-secondary">${rw('Search', 'Найти')}</button></form><div class="research-scope"><button class="btn btn-ghost" data-a="researchToggleArchive" aria-pressed="${!!m.archived}">${ic('archive', 16)}${rw('Archive', 'Архив')}</button>${m.archived ? `<p class="hint">${rw('Showing archived records', 'Показаны записи из архива')}</p>` : ''}${m.appliedQuery ? `<button class="btn btn-ghost" data-a="researchClearSearch">${ic('x', 14)}${rw('Clear search', 'Очистить поиск')}</button>` : ''}</div>${error}${m.loading ? `<p role="status">${rw('Updating…', 'Обновляем…')}</p>` : ''}<div class="research-list" aria-busy="${m.loading}">${researchListContent(m)}</div>${!m.loading && !m.error && m.catalog.total ? `<footer class="research-pagination"><span class="hint" role="status">${rw('Records', 'Записей')} ${m.offset + 1}–${m.offset + m.rows.length} / ${m.catalog.total}</span>${m.catalog.total > 50 ? `<button class="btn btn-ghost" data-a="researchPage" data-step="-1" ${m.offset ? '' : 'disabled'}>${rw('Previous', 'Назад')}</button><button class="btn btn-ghost" data-a="researchPage" data-step="1" ${m.offset + 50 < m.catalog.total ? '' : 'disabled'}>${rw('Next', 'Далее')}</button>` : ''}</footer>` : ''}</section>`;
}
