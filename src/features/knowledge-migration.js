import { A, IN } from '../actions/actions.js';
import { S, D } from '../core/store.js';
import { getSessionGeneration, getKnowledgeMigration, startKnowledgeMigration, stepKnowledgeMigration } from '../core/api.js';
import { workspaceSyncIsClean } from '../core/workspace-sync.js';
import { refreshWorkspaceFromServer } from '../core/bootstrap.js';
import { openModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';
import { isRussian } from '../core/i18n.js';
import { esc } from '../core/utils.js';
import '../styles/knowledge-migration.css';
const T = (en, ru) => (isRussian() ? ru : en);
const current = () => {
  const m = S.ui.modals.at(-1);
  return m?.knowledgeMigration && m.owner === getSessionGeneration() ? m : null;
};
function form(m, H) {
  const p = m.plan,
    j = p?.job,
    remaining = p?.remaining || 0,
    resume = j && ['running', 'paused'].includes(j.state);
  return `${H(T('Knowledge storage', 'Хранение базы знаний'))}<div class="modal-b knowledge-storage-review" translate="no"><p>${T('Move current note text into separate verified objects. Folders and note IDs stay unchanged.', 'Перенос текущих текстов в отдельные проверяемые объекты. Папки и ID заметок сохраняются.')}</p>${!p ? '<p role="status">' + T('Loading review…', 'Подготовка расчёта…') + '</p>' : `<dl><dt>${T('Notes remaining', 'Осталось заметок')}</dt><dd>${remaining}</dd><dt>${T('Including trash', 'В том числе в корзине')}</dt><dd>${p.trash}</dd><dt>${T('Source text', 'Исходные тексты')}</dt><dd>${(p.sourceBytes / 1048576).toFixed(2)} MiB</dd><dt>${T('Metadata catalog', 'Каталог метаданных')}</dt><dd>${(p.catalogBytes / 1024).toFixed(1)} KiB</dd>${j ? `<dt>${T('Processed', 'Обработано')}</dt><dd>${j.processed}</dd><dt>${T('Backup', 'Резервная копия')}</dt><dd translate="no">${esc(j.backupId)}</dd>` : ''}</dl>${!p.enabled ? `<p class="alert warn">${T('The server rollout gate is off. Migration cannot start.', 'Серверный режим новой загрузки выключен. Перенос недоступен.')}</p>` : ''}${p.tooLarge.length ? `<p class="err">${T('Some bodies are invalid or exceed 8 MiB. Resolve them before migration.', 'Некоторые тексты некорректны или превышают 8 MiB. Исправьте их перед переносом.')}</p>` : ''}${remaining ? `<p class="hint">${T('A fresh independent backup is required before starting. Progress is saved after each three-note window. Closing this dialog stops further requests; continue here later. Older clients must reload before editing migrated notes.', 'Перед началом создаётся свежая независимая копия. Прогресс сохраняется после каждых трёх заметок. Закрытие окна останавливает следующие запросы; продолжить можно здесь. Старые клиенты должны обновиться перед правкой перенесённых заметок.')}</p><label class="row"><input type="checkbox" data-in="knowledgeMigrationReview" ${m.reviewed ? 'checked' : ''} ${m.busy ? 'disabled' : ''}>${T('I reviewed the scope, backup requirement and client compatibility.', 'Я проверил объём, требование резервной копии и совместимость клиентов.')}</label>` : `<p role="status">${T('All current bodies are separated.', 'Все текущие тексты хранятся отдельно.')}</p>`}`}${m.error ? `<p class="err" role="alert">${esc(m.error)}</p>` : ''}</div><div class="modal-f"><button class="btn btn-secondary" data-a="closeModal">${T('Close', 'Закрыть')}</button>${m.busy ? `<button class="btn btn-secondary" data-a="pauseKnowledgeMigration" ${m.stopping ? 'disabled' : ''}>${T('Pause after this window', 'Пауза после текущей порции')}</button>` : p && remaining ? `<button class="btn btn-primary" data-a="runKnowledgeMigration" ${!p.enabled || !m.reviewed || p.tooLarge.length ? 'disabled' : ''}>${resume ? T('Continue', 'Продолжить') : T('Create backup and start', 'Создать копию и начать')}</button>` : ''}</div>`;
}
export async function openKnowledgeMigration() {
  if (S.ui.currentUser?.role !== 'admin') return;
  const m = { type: 'knowledgeTool', knowledgeMigration: true, owner: getSessionGeneration(), plan: null, reviewed: false, render: form };
  openModal(m);
  const dialog = current();
  try {
    const plan = await getKnowledgeMigration();
    if (current() === dialog) {
      dialog.plan = plan;
      render();
    }
  } catch {
    if (current() === dialog) {
      dialog.error = T('Unable to prepare the review. Retry later.', 'Не удалось подготовить расчёт. Повторите позже.');
      render();
    }
  }
}
IN.knowledgeMigrationReview = el => {
  const m = current();
  if (m) {
    m.reviewed = el.checked;
    render();
  }
};
A.pauseKnowledgeMigration = () => {
  const m = current();
  if (m) {
    m.stopping = true;
    render();
  }
};
A.runKnowledgeMigration = async () => {
  const m = current();
  if (!m || m.busy || !m.reviewed || !workspaceSyncIsClean(D()) || S.ui.atomicOperation) return;
  m.busy = true;
  S.ui.atomicOperation = true;
  render();
  try {
    if (!['running', 'paused'].includes(m.plan.job?.state)) m.plan = await startKnowledgeMigration(m.plan.reviewKey);
    while (current() === m && m.plan.job.state !== 'complete' && !m.stopping) {
      m.plan = await stepKnowledgeMigration(m.plan.job.id);
      render();
    }
    if (current() === m && m.stopping) m.plan = await stepKnowledgeMigration(m.plan.job.id, true);
    if (m.owner === getSessionGeneration()) await refreshWorkspaceFromServer({ force: true });
  } catch {
    if (current() === m) {
      m.error = T('Progress is retained. Refresh this review before retrying.', 'Прогресс сохранён. Обновите расчёт перед повтором.');
      m.plan = await getKnowledgeMigration().catch(() => m.plan);
    }
  } finally {
    if (m.owner === getSessionGeneration()) {
      S.ui.atomicOperation = false;
      m.busy = false;
      m.stopping = false;
      render();
    }
  }
};
