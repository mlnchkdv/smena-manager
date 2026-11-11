import { A } from '../actions/actions.js';
import { S, D } from '../core/store.js';
import { getSessionGeneration, knowledgeInspectionRequest } from '../core/api.js';
import { isRussian } from '../core/i18n.js';
import { esc, fmtTimestamp } from '../core/utils.js';
import { fsize as formatBytes } from '../ui/helpers.js';
import { openModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';
import { disclosureAttributes } from '../ui/disclosure.js';
import '../styles/knowledge-inspection.css';

const T = (en, ru) => (isRussian() ? ru : en);
const workspace = () => D().ws.id || D().ws.url;
const active = job => ['backups', 'references', 'inventory', 'verification'].includes(job?.phase);
function current() {
  const m = S.ui.modals.at(-1);
  return m?.inspection && m.owner === getSessionGeneration() && m.workspace === workspace() && S.ui.currentUser?.role === 'admin' ? m : null;
}
const codeLabel = code =>
  ({
    INSPECTION_CAPACITY: T('The bounded inspection limit was reached. The report is incomplete.', 'Достигнут предел объёма проверки. Отчёт неполный.'),
    KNOWLEDGE_INVENTORY_CHANGED: T('The object inventory changed. Start a new check.', 'Каталог объектов изменился. Начните новую проверку.'),
    INSPECTION_CONFLICT: T('Progress changed in another window. Refresh the report.', 'Прогресс изменился в другом окне. Обновите отчёт.'),
    WORKSPACE_FORBIDDEN: T('Administrator access to this workspace is required.', 'Нужны права администратора этого пространства.'),
  })[code] ||
  T(
    'The next block could not be verified. Check storage availability and retry.',
    'Не удалось проверить следующую порцию. Проверьте доступность хранилища и повторите.',
  );
function form(m, H) {
  const j = m.job,
    p = j?.plan;
  const reasons =
    p && !p.complete
      ? [
          !p.rootCurrent && T('Workspace changed; the report is no longer current.', 'Пространство изменилось; отчёт больше не актуален.'),
          !p.rootsComplete && T('Backup references have not all been verified.', 'Проверены не все ссылки из резервных копий.'),
          !p.inventoryComplete && T('Object enumeration is not finished.', 'Перечисление объектов ещё не завершено.'),
          p.pending > 0 && T('Some references still need inspection.', 'Часть ссылок ещё ожидает проверки.'),
          p.missing > 0 && T('Some required objects could not be found.', 'Некоторые обязательные объекты не найдены.'),
          p.counts.unknown > 0 && T('Unknown objects are retained and cannot be candidates.', 'Неизвестные объекты сохраняются и не становятся кандидатами.'),
        ].filter(Boolean)
      : [];
  const phase = {
    backups: T('Backup roots', 'Корни резервных копий'),
    references: T('References', 'Ссылки'),
    inventory: T('Object inventory', 'Каталог объектов'),
    verification: T('Integrity checks', 'Проверка целостности'),
    complete: p?.complete ? T('Verified report', 'Проверенный отчёт') : T('Incomplete report', 'Неполный отчёт'),
    failed: T('Check stopped', 'Проверка остановлена'),
    stale: T('Workspace changed', 'Пространство изменилось'),
  }[j?.phase];
  const metric = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  const details = p
    ? `<details class="inspection-details" ${disclosureAttributes(`inspection-report:${j.id}`)}><summary>${T('Report details', 'Подробности отчёта')}</summary><dl class="inspection-metrics">${metric(T('Referenced', 'По ссылкам'), p.counts.reachable)}${metric(T('Unreferenced', 'Без ссылок'), p.counts.unreferenced)}${metric(T('Retained', 'Удерживаются'), p.counts.retained)}${metric(T('Unclassified', 'Не классифицированы'), p.counts.unclassified)}${metric(T('Unknown format', 'Неизвестный формат'), p.counts.unknown)}${metric(T('Candidates', 'Кандидаты'), p.counts.candidates)}${metric(T('Candidate size', 'Объём кандидатов'), formatBytes(p.counts.candidateBytes))}${metric(T('Missing references', 'Не найдено по ссылкам'), p.missing)}${metric(T('Unverified backups', 'Непроверенных копий'), j.skippedBackups)}</dl><p>${T('Newly unreferenced objects are retained for at least 30 days. This check cannot delete objects.', 'Вновь обнаруженные объекты без ссылок удерживаются минимум 30 дней. Эта проверка не удаляет объекты.')}</p>${reasons.length ? `<ul>${reasons.map(reason => `<li>${esc(reason)}</li>`).join('')}</ul>` : ''}${j.candidates.length ? `<ul>${j.candidates.map(c => `<li>${esc(c.kind)} · ${formatBytes(c.bytes)}</li>`).join('')}</ul>` : ''}</details>`
    : '';
  return `${H(T('Knowledge storage check', 'Проверка хранилища знаний'))}<div class="modal-b knowledge-inspection" data-keep="inspection:${esc(j?.id || 'empty')}" translate="no"><p>${T('Inspect note bodies, versions and backup references. Notes and files stay unchanged. Progress is saved; closing stops further requests after the current block.', 'Проверка текстов заметок, версий и ссылок из копий. Заметки и файлы не изменяются. Прогресс сохраняется; закрытие останавливает следующие запросы после текущей порции.')}</p>${m.loading && !j ? `<p role="status">${T('Loading progress…', 'Загрузка прогресса…')}</p>` : j ? `<div class="inspection-status" role="status"><strong>${phase}</strong>${active(j) ? `<span>${m.running ? T('Running', 'Выполняется') : T('Ready to continue', 'Ожидает продолжения')}</span>` : ''}<small>${fmtTimestamp(j.updatedAt)}</small></div><dl class="inspection-metrics">${metric(T('Objects found', 'Найдено объектов'), j.objects)}${metric(T('Known size', 'Известный объём'), formatBytes(j.bytes))}${metric(T('Backups found', 'Найдено копий'), j.backups)}${metric(T('Objects processed', 'Обработано объектов'), j.verified)}</dl>${j.phase === 'stale' ? `<p class="alert info">${T('The workspace changed after this check began. Start a new check for a current report.', 'Пространство изменилось после начала проверки. Для актуального отчёта начните новую.')}</p>` : ''}${j.code ? `<p class="alert warn">${esc(codeLabel(j.code))}</p>` : ''}${details}<div class="inspection-report-actions"><button class="btn btn-secondary btn-sm" data-a="downloadKnowledgeInspection">${T('Download report', 'Скачать отчёт')}</button><button class="btn btn-ghost btn-sm" data-a="reloadKnowledgeInspection" ${m.busy || m.loading ? 'disabled' : ''}>${m.loading ? T('Refreshing…', 'Обновление…') : T('Refresh', 'Обновить')}</button></div>` : `<p>${T('No check has been created for this workspace yet.', 'В этом пространстве ещё нет проверки.')}</p>`}${m.error ? `<p class="err" role="alert">${esc(m.error)}</p>` : ''}</div><div class="modal-f" translate="no"><button class="btn btn-secondary" data-a="closeModal">${T('Close', 'Закрыть')}</button>${m.running ? `<button class="btn btn-secondary" data-a="pauseKnowledgeInspection" ${m.stopping ? 'disabled' : ''}>${m.stopping ? T('Stopping…', 'Останавливаем…') : T('Pause', 'Пауза')}</button>` : `${(j && active(j)) || j?.phase === 'failed' ? `<button class="btn btn-primary" data-a="runKnowledgeInspection" ${m.busy ? 'disabled' : ''}>${T('Continue', 'Продолжить')}</button>` : ''}<button class="btn ${j ? 'btn-secondary' : 'btn-primary'}" data-a="startKnowledgeInspection" ${m.busy || m.loading ? 'disabled' : ''}>${j ? T('New check', 'Новая проверка') : T('Start check', 'Начать проверку')}</button>`}</div>`;
}
async function read(m) {
  m.loading = true;
  m.error = '';
  render();
  try {
    const result = await knowledgeInspectionRequest();
    if (current() === m) m.job = result.job;
  } catch (error) {
    if (current() === m) m.error = codeLabel(error.code);
  } finally {
    if (current() === m) {
      m.loading = false;
      render();
    }
  }
}
export function openKnowledgeInspection() {
  if (S.ui.currentUser?.role !== 'admin') return;
  const m = {
    type: 'knowledgeTool',
    inspection: true,
    workspace: workspace(),
    owner: getSessionGeneration(),
    render: form,
    onClose: () => {
      m.running = false;
    },
  };
  openModal(m);
  void read(m);
}
A.reloadKnowledgeInspection = () => {
  const m = current();
  if (m && !m.busy && !m.loading) void read(m);
};
A.startKnowledgeInspection = async () => {
  const m = current();
  if (!m || m.busy) return;
  m.busy = true;
  m.error = '';
  render();
  try {
    const result = await knowledgeInspectionRequest('start', m.job?.id);
    if (current() === m) m.job = result.job;
  } catch (error) {
    if (current() === m) m.error = codeLabel(error.code);
  } finally {
    if (current() === m) {
      m.busy = false;
      render();
    }
  }
};
A.runKnowledgeInspection = async () => {
  const m = current();
  if (!m?.job || m.busy) return;
  m.running = true;
  m.busy = true;
  m.stopping = false;
  m.error = '';
  render();
  try {
    let result = await knowledgeInspectionRequest('resume', m.job.id);
    if (current() !== m) return;
    m.job = result.job;
    while (current() === m && m.running && active(m.job) && !m.job.paused) {
      result = await knowledgeInspectionRequest('step', m.job.id);
      if (current() !== m) return;
      m.job = result.job;
      render();
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (current() === m && m.stopping && active(m.job)) m.job = (await knowledgeInspectionRequest('pause', m.job.id)).job;
  } catch (error) {
    if (current() === m) m.error = codeLabel(error.code);
  } finally {
    if (current() === m) {
      m.running = false;
      m.busy = false;
      m.stopping = false;
      render();
    }
  }
};
A.pauseKnowledgeInspection = () => {
  const m = current();
  if (m) {
    m.running = false;
    m.stopping = true;
    render();
  }
};
A.downloadKnowledgeInspection = () => {
  const m = current();
  if (!m?.job) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify({ format: 'smena-storage-inspection-report-v1', deletionEnabled: false, job: m.job }, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'smena-storage-inspection.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};
