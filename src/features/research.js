import '../styles/pages/research.css';
import { A, IN } from '../actions/registry.js';
import { S } from '../core/store.js';
import { researchRequest, downloadResearchZip, getActiveWorkspace, getSessionGeneration } from '../core/api.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { closeModal, openModal } from '../overlays/modals.js';
import { toast } from '../ui/toast.js';
import { go, render } from '../shell/render.js';
import { renderKnowledgeMarkdown } from '../shared/knowledge-markdown.js';
import { rw, researchKind, researchState, researchFailure, researchDate } from '../ui/research-copy.js';
import { researchTemplate, researchMetricDefaults, protocolResearchMetrics, repeatResearchRun } from '../shared/research-templates.js';
import { RESEARCH_LIMITS } from '../shared/research.js';
import { researchFormFields } from '../ui/research-form.js';
import { researchEvidenceHtml, researchDisclosure } from '../ui/research-evidence.js';
import {
  readPendingResearch,
  pendingResearchCommands,
  keepPendingResearch,
  clearPendingResearch,
  listResearchDrafts,
  keepResearchDraft,
  clearResearchDraft,
} from '../core/research-pending.js';
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

window.addEventListener('storage', event => {
  if (event.key?.startsWith('smena:research:') && S.ui.route === 'project' && S.ui.params.tab === 'research' && !S.ui.modals.length) render();
});

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
function formDraft(m) {
  const { draftId: id, record, original, rawConfig, rawManifest, rawMetrics, metricSeed, nextState } = m;
  return { id, record, original, rawConfig, rawManifest, rawMetrics, metricSeed, nextState, operationId: m.command?.operationId };
}
const draftStatus = m => m.draftError || (m.dirty ? rw('Draft saved on this device.', 'Черновик сохранён на этом устройстве.') : '');
function saveFormDraft(m) {
  m.dirty = true;
  try {
    keepResearchDraft(m.draftScope, formDraft(m));
    m.draftError = '';
  } catch {
    m.draftError = rw(
      'This device could not store the draft. Copy it before leaving.',
      'Не удалось сохранить черновик на устройстве. Скопируйте его перед выходом.',
    );
  }
  if (S.ui.modals.at(-1) === m) {
    const status = document.querySelector('[data-research-draft-status]');
    const recovery = status?.parentElement.querySelector('[data-research-draft-recovery]');
    const message = draftStatus(m);
    if (status && status.textContent !== message) status.textContent = message;
    if (recovery) recovery.hidden = !m.draftError || m.saveRecovery;
  }
}

function formDraftStatus(m) {
  return `<div class="research-draft-feedback"><p data-research-draft-status role="status">${esc(draftStatus(m))}</p><div class="research-actions" data-research-draft-recovery ${m.draftError && !m.saveRecovery ? '' : 'hidden'}><button class="btn btn-secondary" data-a="researchRetryDraft" ${m.busy ? 'disabled' : ''}>${rw('Retry draft save', 'Повторить сохранение черновика')}</button><button class="btn btn-ghost" data-a="researchCopyDraft">${rw('Copy draft', 'Скопировать черновик')}</button></div>${m.draftExport ? `<label class="field">${rw('Select and copy this draft', 'Выделите и скопируйте черновик')}<textarea readonly class="textarea" data-research-draft-copy rows="4">${esc(m.draftExport)}</textarea></label>` : ''}</div>`;
}

function removableResearchDrafts(m) {
  const pending = new Set(pendingResearchCommands(...m.draftScope).map(command => command.operationId));
  return listResearchDrafts(m.draftScope).filter(item => item.id !== m.draftId && !pending.has(item.operationId));
}

function draftCleanupPanel(m) {
  if (!m.draftCleanup) return '';
  const drafts = removableResearchDrafts(m);
  return `<section class="research-draft-cleanup" aria-labelledby="research-cleanup-heading"><h3 id="research-cleanup-heading" tabindex="-1">${rw('Other drafts on this device', 'Другие черновики на этом устройстве')}</h3><p class="hint">${rw('Free space by removing a draft you no longer need. Your current draft is kept open.', 'Освободите место, удалив ненужный черновик. Текущий черновик останется открытым.')}</p>${drafts.length ? `<ul>${drafts.map(draft => `<li><span>${esc(draft.record.title || rw('Untitled draft', 'Черновик без названия'))}</span><button class="btn btn-ghost" data-a="researchRemoveLocalDraft" data-id="${esc(draft.id)}" aria-pressed="${m.cleanupSelection === draft.id}">${rw('Select for removal', 'Выбрать для удаления')}</button></li>`).join('')}</ul>` : `<p>${rw('No other removable drafts in this project.', 'В этом проекте нет других черновиков, доступных для удаления.')}</p>`}${m.cleanupSelection ? `<div class="research-actions"><button class="btn btn-danger" data-a="researchConfirmRemoveLocalDraft">${rw('Remove selected draft from this device', 'Удалить выбранный черновик с устройства')}</button></div>` : ''}${m.cleanupMessage ? `<p role="status">${esc(m.cleanupMessage)}</p>` : ''}</section>`;
}

A.researchReviewLocalDrafts = () => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'researchForm' || m.busy || !m.saveRecovery) return;
  m.draftCleanup = true;
  render();
  document.getElementById('research-cleanup-heading')?.focus();
};
A.researchRemoveLocalDraft = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'researchForm' || m.busy || !m.draftCleanup || !removableResearchDrafts(m).some(item => item.id === el.dataset.id)) return;
  m.cleanupSelection = m.cleanupSelection === el.dataset.id ? '' : el.dataset.id;
  render();
};
A.researchConfirmRemoveLocalDraft = () => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'researchForm' || m.busy || !m.draftCleanup || !removableResearchDrafts(m).some(item => item.id === m.cleanupSelection)) return;
  try {
    clearResearchDraft(m.draftScope, m.cleanupSelection);
    m.cleanupSelection = '';
    m.cleanupMessage = rw('Draft removed. Try saving your record again.', 'Черновик удалён. Попробуйте сохранить запись ещё раз.');
  } catch {
    m.cleanupMessage = rw(
      'The browser could not remove this draft. Copy your current draft before closing.',
      'Браузер не смог удалить черновик. Скопируйте текущий черновик перед закрытием.',
    );
  }
  render();
  document.getElementById('research-cleanup-heading')?.focus();
};

A.researchRetryDraft = () => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'researchForm' || m.busy || !m.draftError) return;
  saveFormDraft(m);
  render();
  const status = document.querySelector('[data-research-draft-status]');
  status?.setAttribute('tabindex', '-1');
  status?.focus({ preventScroll: true });
};
A.researchCopyDraft = async () => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'researchForm') return;
  const draft = JSON.stringify(formDraft(m), null, 2);
  try {
    await navigator.clipboard.writeText(draft);
    if (S.ui.modals.at(-1) === m) toast(rw('Draft copied.', 'Черновик скопирован.'));
  } catch {
    if (S.ui.modals.at(-1) !== m) return;
    m.draftExport = draft;
    render();
    const field = document.querySelector('[data-research-draft-copy]');
    field?.focus();
    field?.select();
  }
};

function formClosePrompt(m) {
  if (!m.closing) return '';
  return `<aside class="research-error" aria-label="${rw('Unsaved research', 'Несохранённое исследование')}"><p role="status">${m.draftError || rw('Keep the draft on this device for later?', 'Оставить черновик на этом устройстве?')}</p><div class="research-actions"><button class="btn btn-primary" data-a="researchCloseDraft" data-choice="continue">${rw('Continue editing', 'Продолжить редактирование')}</button><button class="btn btn-secondary" data-a="researchCloseDraft" data-choice="keep">${rw('Keep draft', 'Сохранить черновик')}</button><button class="btn btn-ghost danger" data-a="researchCloseDraft" data-choice="discard">${rw('Discard draft', 'Удалить черновик')}</button></div></aside>`;
}

function conflictFields(m) {
  const fields = [
    ['title', rw('Title', 'Название')],
    ['body', rw('Text', 'Текст')],
    ['tags', rw('Tags', 'Теги')],
    ...[...new Set([...Object.keys(m.record.data), ...Object.keys(m.latest.data)])].map(key => ['data.' + key, key]),
  ];
  return fields
    .map(([key, label]) => {
      const read = record => (key.startsWith('data.') ? record.data[key.slice(5)] : record[key]);
      return { key, label, local: read(m.record), latest: read(m.latest) };
    })
    .filter(row => JSON.stringify(row.local) !== JSON.stringify(row.latest));
}

function conflictPanel(m) {
  if (!m.stale) return '';
  if (!m.latest)
    return `<button class="btn btn-secondary" data-a="researchCompareLatest" ${m.busy ? 'disabled' : ''}>${rw('Compare with latest version', 'Сравнить со свежей версией')}</button>`;
  const show = value => esc(typeof value === 'string' ? value : (JSON.stringify(value, null, 2) ?? '—'));
  return `<section class="research-conflict"><h3>${rw('Choose the version of each changed field', 'Выберите версию каждого изменённого поля')}</h3>${conflictFields(
    m,
  )
    .map(
      ({ key, label, local, latest }) =>
        `<fieldset><legend>${esc(label)}</legend>${[
          ['local', rw('My draft', 'Мой черновик'), local],
          ['latest', rw('Server version', 'На сервере'), latest],
        ]
          .map(
            ([side, name, value]) =>
              `<label><input type="radio" name="merge-${esc(key)}" data-in="researchMergeChoice" data-field="${esc(key)}" value="${side}" ${m.choices[key] === side ? 'checked' : ''}>${name}<pre>${show(value)}</pre></label>`,
          )
          .join('')}</fieldset>`,
    )
    .join(
      '',
    )}<button class="btn btn-secondary" data-a="researchApplyMerge" ${conflictFields(m).some(row => !m.choices[row.key]) ? 'disabled' : ''}>${rw('Apply choices to draft', 'Применить выбор к черновику')}</button></section>`;
}
A.researchCompareLatest = async () => {
  const m = S.ui.modals.at(-1);
  if (!m?.stale || m.busy) return;
  m.busy = true;
  render();
  try {
    const { record } = await researchRequest(m.project, '/records/' + encodeURIComponent(m.record.id));
    if (m.generation !== getSessionGeneration() || !S.ui.modals.includes(m)) return;
    m.latest = record;
    m.choices = {};
    m.error = '';
  } catch (error) {
    m.error = researchFailure(error);
  } finally {
    m.busy = false;
    if (S.ui.modals.includes(m)) render();
  }
};
IN.researchMergeChoice = el => {
  const m = S.ui.modals.at(-1);
  if (!m?.latest) return;
  m.choices[el.dataset.field] = el.value;
  render();
};
A.researchApplyMerge = () => {
  const m = S.ui.modals.at(-1);
  if (!m?.latest) return;
  const fields = conflictFields(m);
  if (fields.some(row => !m.choices[row.key])) return;
  const merged = structuredClone(m.latest);
  for (const row of fields.filter(row => m.choices[row.key] === 'local')) {
    const nested = row.key.startsWith('data.');
    const obj = nested ? merged.data : merged;
    const key = nested ? row.key.slice(5) : row.key;
    if (row.local === undefined) delete obj[key];
    else obj[key] = structuredClone(row.local);
  }
  Object.assign(m, { record: merged, stale: false, latest: null, nextState: null, error: '' });
  resetRaw(m);
  saveFormDraft(m);
  render();
};

function form(model, record, kind = 'experiment', draft = null) {
  const generation = getSessionGeneration();
  const m = {
    type: 'researchForm',
    project: model.project,
    generation,
    record: structuredClone(record || seedTemplate(kind, model)),
    original: !!record,
    draftId: draft?.id || crypto.randomUUID(),
    draftScope: [getActiveWorkspace(), model.catalog?.actorId, model.project],
    reviewers: model.catalog?.reviewers || [],
    render: (m, H) =>
      `${H(m.original ? rw('Edit research record', 'Изменить запись исследования') : rw('New research record', 'Новая запись исследования'))}<div class="modal-b research-form" translate="no">${formDraftStatus(m)}${formClosePrompt(m)}<fieldset ${m.busy || m.stale || m.command || m.closing ? 'disabled' : ''}>${researchFormFields(m)}</fieldset>${m.templatePending ? `<div class="research-error" role="alert"><p>${rw('Replace the draft body and properties with this template? The title is kept.', 'Заменить описание и свойства черновика выбранным шаблоном? Название сохранится.')}</p><button class="btn btn-secondary" data-a="researchApplyTemplate">${rw('Replace draft', 'Заменить черновик')}</button><button class="btn btn-ghost" data-a="researchCancelTemplate">${rw('Keep draft', 'Оставить черновик')}</button></div>` : ''}${conflictPanel(m)}${draftCleanupPanel(m)}${m.error && !m.saveRecovery ? `<p role="alert">${esc(m.error)}</p>` : ''}</div><div class="modal-f research-form-footer" translate="no">${m.saveRecovery ? `<div class="research-save-recovery"><p role="alert">${esc(m.error)}</p><div class="research-actions"><button class="btn btn-secondary" data-a="researchCopyDraft">${rw('Copy draft', 'Скопировать черновик')}</button><button class="btn btn-secondary" data-a="researchReviewLocalDrafts">${rw('Manage drafts on this device', 'Управлять черновиками на устройстве')}</button></div></div>` : ''}<button class="btn btn-secondary" data-a="closeModal" ${m.busy ? 'disabled' : ''}>${rw('Cancel', 'Отмена')}</button><button class="btn btn-primary" data-a="researchSave" ${m.busy || m.stale ? 'disabled' : ''}>${m.busy ? rw('Saving…', 'Сохраняем…') : m.saveRecovery ? rw('Retry saving', 'Повторить сохранение') : rw('Save record', 'Сохранить запись')}</button></div>`,
  };
  resetRaw(m);
  m.metricSeed = m.original ? '' : JSON.stringify(m.record.data.metrics || []);
  if (draft) {
    const { rawConfig, rawManifest, rawMetrics, metricSeed, nextState } = draft;
    Object.assign(m, { original: draft.original, rawConfig, rawManifest, rawMetrics, metricSeed, nextState, dirty: true });
  }
  m.beforeClose = () => {
    if (m.command || m.allowClose) return true;
    if (m.busy) return false;
    if (!m.dirty) return true;
    m.closing = true;
    render();
    document.querySelector('.research-form [data-choice="continue"]')?.focus();
    return false;
  };
  m.onClose = () => m.referenceController?.abort();
  openModal(m);
  if (['run', 'article', 'handoff'].includes(m.record.kind)) void loadReferences(m);
  return m;
}
A.researchCloseDraft = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'researchForm' || !m.closing || m.busy) return;
  if (el.dataset.choice === 'continue') {
    m.closing = false;
    m.afterDraftClose = null;
    render();
    document.querySelector('.research-form [data-field="title"]')?.focus();
    return;
  }
  try {
    if (el.dataset.choice === 'discard') clearResearchDraft(m.draftScope, m.draftId);
    else {
      saveFormDraft(m);
      if (m.draftError) return render();
    }
  } catch {
    m.draftError = rw('Could not remove the draft from this device.', 'Не удалось удалить черновик с этого устройства.');
    return render();
  }
  m.allowClose = true;
  closeModal();
  m.afterDraftClose?.();
};

window.addEventListener('beforeunload', event => {
  if (!S.ui.modals.some(m => m.type === 'researchForm' && m.dirty && m.draftError)) return;
  event.preventDefault();
  event.returnValue = '';
});
A.researchResumeDraft = el => {
  const model = state();
  if (!model.catalog?.canEdit || model.unsent || model.pending) return;
  const draft = listResearchDrafts([getActiveWorkspace(), model.catalog.actorId, model.project]).find(item => item.id === el.dataset.id);
  if (draft) form(model, draft.record, draft.record.kind, draft);
};
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
  saveFormDraft(m);
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
    if (m.dirty || explicit) saveFormDraft(m);
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
  if (m?.type !== 'researchForm' || m.busy) return;
  m[{ config: 'rawConfig', manifest: 'rawManifest', metrics: 'rawMetrics' }[el.dataset.field]] = el.value;
  saveFormDraft(m);
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
  saveFormDraft(m);
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
  saveFormDraft(m);
  render();
};
A.researchRemoveMetric = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'researchForm' || m.busy || m.command) return;
  m.record.data.metrics.splice(Number(el.dataset.index), 1);
  saveFormDraft(m);
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
  saveFormDraft(m);
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
  saveFormDraft(m);
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
  if (m?.type !== 'researchForm' || m.busy || m.stale || m.closing || m.generation !== getSessionGeneration()) return;
  const model = state(),
    workspace = getActiveWorkspace(),
    actorId = model.catalog?.actorId;
  if (model.project !== m.project || !actorId) return;
  if (model.pending || model.savingForm) {
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
  m.saveRecovery = false;
  render();
  const draft = { kind: m.record.kind, title: m.record.title, body: m.record.body, data: m.record.data, tags: m.record.tags || [] };
  m.command ||= {
    operationId: crypto.randomUUID(),
    action: m.original ? 'update' : 'create',
    id: m.original ? m.record.id : crypto.randomUUID(),
    ...(m.original ? { expectedRevision: m.record.revision } : {}),
    record: draft,
  };
  let stored = false;
  let accepted = false;
  try {
    keepPendingResearch(workspace, actorId, m.project, m.command);
    stored = true;
    saveFormDraft(m);
    model.unsent = m.command;
    const result = await researchRequest(m.project, '/commands', m.command);
    accepted = true;
    if (m.generation !== getSessionGeneration()) return;
    const verified = await researchRequest(m.project, '/records/' + encodeURIComponent(result.record.id));
    if (
      verified.record.revision < result.record.revision ||
      (verified.record.revision === result.record.revision && verified.record.body !== result.record.body)
    )
      throw new Error('RESEARCH_READBACK_PENDING');
    if (m.generation !== getSessionGeneration()) return;
    clearPendingResearch(workspace, actorId, m.project, m.command.operationId);
    try {
      clearResearchDraft(m.draftScope, m.draftId);
    } catch {
      /* The server confirmed the record. */
    }
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
    if (error.code === 'RESEARCH_STALE') m.stale = true;
    m.saveRecovery = !stored;
    m.error = stored
      ? researchFailure(error)
      : error.message === 'RESEARCH_DRAFT_LIMIT'
        ? rw(
            'The recovery copy is too large. Copy the draft and shorten the record before retrying.',
            'Копия для восстановления слишком большая. Скопируйте черновик и сократите запись перед повтором.',
          )
        : rw(
            'The record was not sent. The browser could not store its recovery copy.',
            'Запись не отправлена. Браузер не смог сохранить копию для восстановления.',
          );
    if (!stored || (!accepted && error.status >= 400 && error.status < 500 && ![401, 403, 408, 429].includes(error.status))) {
      clearPendingResearch(workspace, actorId, m.project, m.command.operationId);
      if (model.unsent?.operationId === m.command?.operationId) model.unsent = null;
      m.command = null;
    } else model.unsent = m.command;
  } finally {
    m.busy = false;
    model.savingForm = false;
    if (m.generation === getSessionGeneration() && active(model)) render();
  }
};
A.researchRecover = async el => {
  const m = state();
  const command = pendingResearchCommands(getActiveWorkspace(), m.catalog.actorId, m.project).find(item => item.operationId === el.dataset.operation);
  if (!command || m.pending || m.savingForm) return;
  const workspace = getActiveWorkspace(),
    actorId = m.catalog.actorId,
    generation = getSessionGeneration(),
    originalRecordId = S.ui.params.researchId;
  m.pending = true;
  render();
  try {
    const status = await researchRequest(m.project, '/operations/' + encodeURIComponent(command.operationId));
    if (generation !== getSessionGeneration()) return;
    const result = status.state === 'completed' ? status : await researchRequest(m.project, '/commands', command);
    const verified = await researchRequest(m.project, '/records/' + encodeURIComponent(result.record.id));
    if (generation !== getSessionGeneration()) return;
    if (
      verified.record.revision < result.record.revision ||
      (verified.record.revision === result.record.revision && verified.record.body !== result.record.body)
    )
      throw new Error('RESEARCH_READBACK_PENDING');
    clearPendingResearch(workspace, actorId, m.project, command.operationId);
    const draftScope = [workspace, actorId, m.project];
    const draft = listResearchDrafts(draftScope).find(item => item.operationId === command.operationId);
    if (draft) {
      try {
        clearResearchDraft(draftScope, draft.id);
      } catch {
        /* The server confirmed the record. */
      }
    }
    if (m.unsent?.operationId === command.operationId) m.unsent = null;
    m.error = '';
    m.rows = null;
    if (!active(m)) return;
    if (S.ui.params.researchId === originalRecordId) {
      m.selected = null;
      m.recordError = null;
      go('project', researchLocation(m, result.record.id));
    }
    await loadResearch(m);
  } catch (error) {
    if (!active(m)) return;
    m.error = researchFailure(error);
    if (error.code === 'RESEARCH_STALE' && command.action === 'update') {
      const draft = listResearchDrafts([workspace, actorId, m.project]).find(item => item.operationId === command.operationId);
      if (draft) {
        clearPendingResearch(workspace, actorId, m.project, command.operationId);
        const editor = form(m, draft.record, draft.record.kind, draft);
        editor.stale = true;
        editor.error = m.error;
      }
    }
  } finally {
    m.pending = false;
    if (active(m)) render();
  }
};
async function recordCommand(action) {
  const m = state();
  if (m.pending || !m.selected) return;
  m.pending = true;
  const { id, revision } = m.selected;
  m.recordAction = { id, action };
  m.error = '';
  render();
  try {
    const result = await researchRequest(m.project, '/commands', {
      operationId: crypto.randomUUID(),
      action,
      id,
      expectedRevision: revision,
    });
    m.rows = null;
    if (active(m)) {
      if (S.ui.params.researchId === id) m.selected = result.record;
      void loadResearch(m);
    }
  } catch (error) {
    if (active(m)) m.error = researchFailure(error);
  } finally {
    m.recordAction = null;
    m.pending = false;
    if (active(m)) render();
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
    saveFormDraft(m);
    render();
  } catch (error) {
    if (current()) model.error = researchFailure(error);
  } finally {
    model.draftingArticle = null;
    if (active(model)) render();
  }
};
function preparedResearchExport(model, record = model.selected) {
  const job = model.export;
  return job?.id === record?.id && job?.revision === record?.revision && job?.language === rw('en', 'ru') ? job : null;
}
A.researchExport = async () => {
  const m = state();
  const record = m.selected;
  if (!record || ['preparing', 'saving'].includes(preparedResearchExport(m)?.status)) return;
  const { id, revision } = record;
  if (m.export?.href) URL.revokeObjectURL(m.export.href);
  const job = { id, revision, language: rw('en', 'ru'), status: 'preparing' };
  m.export = job;
  render();
  try {
    const blob = await downloadResearchZip(m.project, id, job.language, job.revision);
    if (blob.type !== 'application/zip' || !blob.size) throw new Error('RESEARCH_EXPORT_INVALID');
    if (!active(m) || preparedResearchExport(m) !== job || S.ui.params.researchId !== id) {
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
    job.status = error.code === 'RESEARCH_EXPORT_STALE' ? 'stale' : 'error';
    job.message =
      job.status === 'stale'
        ? rw('The record changed. Reload it to prepare the latest ZIP.', 'Запись изменилась. Обновите её, чтобы подготовить актуальный ZIP.')
        : error.code === 'RESEARCH_EXPORT_LIMIT'
          ? researchFailure(error)
          : rw('Could not prepare the ZIP. Check your connection and try again.', 'Не удалось подготовить ZIP. Проверьте соединение и повторите.');
  } finally {
    if (active(m)) render();
  }
};
A.researchReloadExport = () => {
  const model = state();
  const id = model.selected?.id;
  if (!id) return;
  model.export = null;
  model.selected = null;
  void loadResearchRecord(model, id);
  render();
};
A.researchSaveZip = async () => {
  const m = state();
  const job = preparedResearchExport(m);
  if (!job?.blob || job.status === 'saving') return;
  const blob = job.blob;
  const current = () => active(m) && preparedResearchExport(m) === job && S.ui.params.researchId === job.id;
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
  saveFormDraft(draft);
  render();
};
A.researchTransition = el => {
  const model = state();
  if (!model.selected) return;
  const m = form(model, model.selected);
  m.nextState = el.dataset.state;
  saveFormDraft(m);
  render();
};
A.researchRepeat = () => {
  const model = state(),
    source = model.selected;
  if (source?.kind !== 'run') return;
  const m = form(model, null, 'run');
  m.record = repeatResearchRun(source, { russian: rw(false, true), ownerId: model.catalog.actorId });
  resetRaw(m);
  saveFormDraft(m);
  render();
};
A.researchLatestInputs = () => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'researchForm' || m.busy || m.command || m.record.data.state !== 'planned') return;
  delete m.record.data.datasetVersion;
  delete m.record.data.protocolVersion;
  saveFormDraft(m);
  render();
};
const recordActionLabels = {
  archive: ['Archive record', 'В архив', 'Archiving record…', 'Переносим запись в архив…'],
  restore: ['Restore from archive', 'Восстановить из архива', 'Restoring record…', 'Восстанавливаем запись…'],
  review: ['Mark as reviewed', 'Отметить проверенным', 'Saving review…', 'Сохраняем проверку…'],
};
function recordActionButton(record, action, style) {
  const model = state();
  const busy = model.recordAction?.id === record.id && model.recordAction.action === action;
  const [en, ru, busyEn, busyRu] = recordActionLabels[action];
  return `<button class="btn ${style}" data-a="${action === 'review' ? 'researchReview' : 'researchArchive'}" ${model.pending ? 'disabled' : ''} ${busy ? 'aria-busy="true"' : ''}>${busy ? rw(busyEn, busyRu) : rw(en, ru)}</button>${busy ? `<span class="sr" role="status">${rw(busyEn, busyRu)}</span>` : ''}`;
}
function researchRecordActions(record, canEdit) {
  const state = record.data.state || 'planned';
  const transitions = state === 'planned' ? ['running', 'cancelled'] : state === 'running' ? ['completed', 'failed', 'cancelled'] : [];
  const compare = ['experiment', 'run'].includes(record.kind)
    ? `<button class="btn btn-secondary" data-a="researchCompare">${rw('Compare runs', 'Сравнить запуски')}</button>`
    : '';
  if (record.archived) {
    const restore = canEdit ? recordActionButton(record, 'restore', 'btn-secondary') : '';
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
  const job = preparedResearchExport(model, record);
  const busy = ['preparing', 'saving'].includes(job?.status);
  const stale = job?.status === 'stale';
  const download =
    job?.status === 'preparing'
      ? rw('Preparing ZIP…', 'Готовим ZIP…')
      : stale
        ? rw('Reload record', 'Обновить запись')
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
  return `<details class="research-technical" ${researchDisclosure(record, 'reading-tools')}><summary>${rw('History, review and export', 'История, проверка и экспорт')}</summary><div class="research-actions"><button class="btn btn-secondary" data-a="researchHistory">${rw('History', 'История')}</button><button class="btn btn-secondary" data-a="${stale ? 'researchReloadExport' : 'researchExport'}" ${busy ? 'disabled aria-busy="true"' : ''}>${download}</button>${article}${model.catalog.canReview && record.review?.status !== 'reviewed' && !record.archived ? recordActionButton(record, 'review', 'btn-secondary') : ''}</div>${announcement}<p class="hint">${rw('ZIP contains Markdown, HTML, JSON, revision objects and checksums. Media bytes stay in Files; file access is unchanged.', 'ZIP содержит Markdown, HTML, JSON, объекты редакций и контрольные суммы. Медиа остаются в «Файлах» с текущими правами доступа.')}</p></details>`;
}
function runConditions(record) {
  if (record.kind !== 'run') return '';
  const plan = record.plan || {};
  const inputs = [
    ['experiment', rw('Hypothesis', 'Гипотеза')],
    ['dataset', rw('Dataset', 'Набор данных')],
    ['protocol', rw('Protocol', 'Протокол')],
  ].map(([key, label]) => {
    const version = plan[key],
      id = version?.id || record.data[key + 'Id'];
    if (!id) return '';
    return `<div><dt>${label}</dt><dd>${version ? `${rw('Revision at launch', 'Редакция при запуске')} ${esc(version.revision)} · ` : ''}<button class="btn btn-ghost btn-sm" data-a="researchOpen" data-id="${esc(id)}">${rw('Open current record', 'Открыть текущую запись')}</button></dd></div>`;
  });
  const revision = plan.codeRevision || record.data.codeRevision;
  if (revision) inputs.push(`<div><dt>${rw('Code revision', 'Версия кода')}</dt><dd translate="no">${esc(revision)}</dd></div>`);
  if (record.data.seed != null) inputs.push(`<div><dt>Seed</dt><dd>${esc(record.data.seed)}</dd></div>`);
  return inputs.some(Boolean)
    ? `<details class="research-technical" ${researchDisclosure(record, 'inputs')}><summary>${rw('Run conditions', 'Условия запуска')}</summary><dl class="research-properties">${inputs.join('')}</dl></details>`
    : '';
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
  }${runConditions(record)}${researchMetricsHtml(record)}${researchEvidenceHtml(record)}<details class="research-technical" ${researchDisclosure(record, 'passport')}><summary>${rw('Record details', 'Паспорт записи')}</summary><dl class="research-properties"><div><dt>ID</dt><dd>${esc(record.id)}</dd></div><div><dt>${rw('Last updated', 'Изменено')}</dt><dd>${esc(researchDate(record.updatedAt, true))}</dd></div></dl><pre class="research-code">${esc(JSON.stringify({ data: record.data, plan: record.plan || null }, null, 2))}</pre></details>${editing ? `<div class="research-actions">${record.kind === 'run' ? `<button class="btn btn-secondary" data-a="researchRepeat">${rw('Repeat as new run', 'Повторить новым запуском')}</button>` : ''}${recordActionButton(record, 'archive', 'btn-ghost')}</div>` : ''}`;
}
const materialKinds = ['source', 'dataset', 'protocol', 'article', 'review', 'handoff'];

function researchListContent(m) {
  if (m.loading || m.error) return '';
  const rows = m.rows || [];
  if (rows.length)
    return rows
      .map(
        row =>
          `<button class="research-list-item" data-a="researchOpen" data-id="${esc(row.id)}"><span class="research-list-title">${esc(row.title)}</span><span class="hint">${esc(row.state ? researchState(row.state) : researchKind(row.kind))}</span><time class="hint" datetime="${esc(row.updatedAt)}">${esc(researchDate(row.updatedAt))}</time></button>`,
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
  return `<details class="ui-menu research-create" ${disclosureAttributes('research:create')}><summary class="btn btn-primary">${ic('plus', 16)}${rw('Create', 'Создать')}</summary><div><button class="btn btn-ghost" data-a="researchNew" data-kind="experiment">${rw('New experiment', 'Новый эксперимент')}</button><button class="btn btn-ghost" data-a="researchNew" data-kind="observation">${rw('Quick note', 'Быстрая запись')}</button></div></details>`;
}

function researchDrafts(model) {
  if (!model.catalog?.canEdit || model.unsent) return '';
  const drafts = listResearchDrafts([getActiveWorkspace(), model.catalog.actorId, model.project]);
  if (!drafts.length) return '';
  return `<details class="research-technical" ${disclosureAttributes('research:local-drafts')}><summary>${rw('Drafts on this device', 'Черновики на этом устройстве')} · ${drafts.length}</summary><div class="research-list">${drafts.map(draft => `<button class="research-list-item" data-a="researchResumeDraft" data-id="${esc(draft.id)}"><span>${esc(draft.record.title || rw('Untitled draft', 'Черновик без названия'))}</span><span class="hint">${esc(researchKind(draft.record.kind))}</span></button>`).join('')}</div></details>`;
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
  const operations = m.catalog ? pendingResearchCommands(getActiveWorkspace(), m.catalog.actorId, m.project) : [];
  m.unsent = operations[0] || null;
  const recovery = operations
    .map(
      command =>
        `<div class="research-error" role="status"><strong>${esc(command.record?.title || researchKind(command.record?.kind || 'experiment'))}</strong><span>${rw('A previous save needs confirmation. The exact operation is kept on this device.', 'Предыдущее сохранение требует подтверждения. Исходная операция сохранена на этом устройстве.')}</span><button class="btn btn-secondary" data-a="researchRecover" data-operation="${esc(command.operationId)}" ${m.pending ? 'disabled' : ''}>${rw('Check and resume save', 'Проверить и завершить')}</button></div>`,
    )
    .join('');
  const error = m.error
    ? `<div class="research-error" role="alert">${esc(m.error)}<button class="btn btn-secondary" data-a="researchRefresh">${rw('Retry', 'Повторить')}</button></div>`
    : '';
  if (!m.catalog) return `<section class="research-page">${error}</section>`;
  if (!m.catalog.enabled)
    return `<section class="research-page research-empty" translate="no"><h2>${rw('Research journal', 'Журнал исследований')}</h2><p>${rw('Keep hypotheses, runs, evidence and decisions together in this project.', 'Соберите гипотезы, запуски, доказательства и решения в этом проекте.')}</p>${m.catalog.canConfigure ? `<button class="btn btn-primary" data-a="researchEnable" ${m.pending ? 'disabled' : ''}>${rw('Enable research for this project', 'Включить исследования для проекта')}</button>` : `<p>${rw('Ask the project owner to enable the journal.', 'Попросите руководителя проекта включить журнал.')}</p>`}${error}</section>`;
  if (requested) {
    if (m.selected?.id === requested)
      return `<section class="research-page" translate="no">${recovery}${researchDrafts(m)}${error}${details(m.selected, m.catalog.canEdit)}</section>`;
    return `<section class="research-page" translate="no">${recovery}<button class="btn btn-ghost" data-a="researchBack">${rw('All research', 'Все исследования')}</button>${m.recordError?.id === requested ? `<div class="research-error" role="alert">${esc(m.recordError.message)}<button class="btn btn-secondary" data-a="researchRefresh">${rw('Retry', 'Повторить')}</button></div>` : `<p role="status">${rw('Loading record…', 'Загружаем запись…')}</p>`}</section>`;
  }
  return `<section class="research-page" translate="no">${recovery}${researchDrafts(m)}<div class="research-catalog-tools"><header class="research-toolbar"><div class="seg" role="group" aria-label="${rw('Research views', 'Представления исследований')}">${[
    ['experiments', rw('Experiments', 'Эксперименты')],
    ['journal', rw('Journal', 'Журнал')],
    ['materials', rw('Materials', 'Материалы')],
  ]
    .map(
      ([id, name]) => `<button class="${m.view === id ? 'on' : ''}" data-a="researchView" data-view="${id}" aria-pressed="${m.view === id}">${name}</button>`,
    )
    .join(
      '',
    )}</div>${m.catalog.canEdit && !m.archived ? researchCreateActions(m.view) : ''}</header><form class="research-search" data-submit="researchSearch" role="search"><label class="sr" for="research-query">${rw('Search research', 'Поиск исследований')}</label><input id="research-query" class="input" type="search" data-in="researchQuery" value="${esc(m.query)}" placeholder="${rw('Search', 'Поиск')}" maxlength="200"><button class="btn btn-secondary">${rw('Search', 'Найти')}</button><details class="ui-menu research-list-menu"><summary class="ibtn" aria-label="${rw('List options', 'Параметры списка')}">${ic('ellipsis', 16)}</summary><div><button class="btn btn-ghost" data-a="researchToggleArchive" aria-pressed="${!!m.archived}">${ic('archive', 16)}${rw('Archive', 'Архив')}</button></div></details></form></div><div class="research-scope">${m.archived ? `<p class="hint">${rw('Showing archived records', 'Показаны записи из архива')}</p>` : ''}${m.appliedQuery ? `<button class="btn btn-ghost" data-a="researchClearSearch">${ic('x', 14)}${rw('Clear search', 'Очистить поиск')}</button>` : ''}</div>${error}${m.loading ? `<p role="status">${rw('Updating…', 'Обновляем…')}</p>` : ''}<div class="research-list" aria-busy="${m.loading}">${researchListContent(m)}</div>${!m.loading && !m.error && m.catalog.total ? `<footer class="research-pagination"><span class="hint" role="status">${rw('Records', 'Записей')} ${m.offset + 1}–${m.offset + m.rows.length} / ${m.catalog.total}</span>${m.catalog.total > 50 ? `<button class="btn btn-ghost" data-a="researchPage" data-step="-1" ${m.offset ? '' : 'disabled'}>${rw('Previous', 'Назад')}</button><button class="btn btn-ghost" data-a="researchPage" data-step="1" ${m.offset + 50 < m.catalog.total ? '' : 'disabled'}>${rw('Next', 'Далее')}</button>` : ''}</footer>` : ''}</section>`;
}
