import { D, S } from '../core/store.js';
import { A, IN } from '../actions/actions.js';
import { knowledgeReviewRequest, getSessionGeneration } from '../core/api.js';
import { isRussian } from '../core/i18n.js';
import { esc, fmtTimestamp } from '../core/utils.js';
import { openModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';
import { refreshWorkspaceFromServer } from '../core/bootstrap.js';
import { workspaceSyncIsClean } from '../core/workspace-sync.js';
import { waitForPersonalPreferences } from '../core/personal-preferences.js';
import { ensureKnowledgeBody } from '../core/knowledge-bodies.js';
import { knowledgeReviewSnapshot } from '../shared/knowledge-governance.js';
import { disclosureAttributes } from '../ui/disclosure.js';
import '../styles/knowledge-review.css';

const word = (en, ru) => (isRussian() ? ru : en);
const active = () => (S.ui.modals.at(-1)?.knowledgeReview ? S.ui.modals.at(-1) : null);
const scope = () => JSON.stringify([getSessionGeneration(), D().ws.id || D().ws.url]);
const fresh = m => m.scope === scope() && D().knowledgeNotes.some(note => note.id === m.noteId);
const errorText = error => {
  if (error.code === 'KNOWLEDGE_REVIEW_INVALID')
    return word(
      'Check the owner, date and selection of one to five active reviewers.',
      'Проверьте ответственного, дату и выбор от одного до пяти действующих проверяющих.',
    );
  if (['KNOWLEDGE_VERSION_STALE', 'KNOWLEDGE_REVIEW_STALE'].includes(error.code))
    return word('The note or review changed. Refresh before continuing.', 'Заметка или состав проверки изменились. Обновите данные перед продолжением.');
  if (['KNOWLEDGE_REVIEW_FORBIDDEN', 'WORKSPACE_FORBIDDEN', 'ROLE_FORBIDDEN'].includes(error.code))
    return word('Your current permissions do not allow this review action.', 'Текущие права не позволяют выполнить это действие проверки.');
  if (error.code === 'KNOWLEDGE_REVIEW_INTEGRITY')
    return word('The review journal could not be verified. No decision was recorded.', 'Не удалось проверить журнал согласования. Решение не записано.');
  return word(
    'The operation could not be confirmed. Refresh its status or retry the same request.',
    'Не удалось подтвердить операцию. Обновите статус или повторите тот же запрос.',
  );
};
const localHash = async note =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(knowledgeReviewSnapshot(note)))))]
    .map(v => v.toString(16).padStart(2, '0'))
    .join('');

function reviewView(m, H) {
  const model = m.model,
    governance = model?.governance,
    current = governance?.current,
    disabled = m.busy ? 'disabled' : '';
  const labels = {
    unreviewed: word('Not reviewed', 'Не проверено'),
    pending: word('Awaiting review', 'Ожидает проверки'),
    approved: word('Approved version', 'Версия согласована'),
    changes: word('Changes requested', 'Нужны правки'),
    stale: word('Content changed', 'Содержание изменено'),
    unavailable: word('Review unavailable', 'Проверка недоступна'),
  };
  const name = id => model?.members.find(member => member.id === id)?.name || id;
  const stamp = at => fmtTimestamp(at);
  const editors = model?.members.filter(member => member.active && member.role !== 'viewer') || [];
  const editable = model?.canWrite && model.canConfigure;
  const status = model
    ? `<div class="knowledge-review-status" id="knowledge-review-status" role="status" tabindex="-1" aria-live="polite" aria-atomic="true"><strong>${labels[model.status.status]}</strong>${model.status.overdue ? `<span>${word('Review due', 'Пора пересмотреть')}</span>` : ''}</div><p class="hint">${word('Snapshot', 'Версия')}: <code>${esc(model.reviewHash.slice(0, 12))}</code>. ${word('This decision applies to the loaded content and note properties.', 'Решение относится к загруженному содержанию и свойствам заметки.')}</p>`
    : '';
  const configuration = model
    ? `<details class="knowledge-review-section" ${disclosureAttributes('knowledge-review:' + m.noteId + ':configuration')}><summary>${word('Knowledge owner and review date', 'Ответственный и дата пересмотра')}</summary><div class="knowledge-review-fields"><label class="field"><span class="label">${word('Knowledge owner', 'Ответственный за актуальность')}</span><select class="select" data-in="knowledgeReviewField" data-field="ownerId" ${!editable || m.busy ? 'disabled' : ''}>${!editors.some(member => member.id === m.ownerId) ? `<option value="${esc(m.ownerId)}" selected disabled>${esc(name(m.ownerId))} · ${word('not eligible', 'нельзя назначить')}</option>` : ''}${editors.map(member => `<option value="${esc(member.id)}" ${m.ownerId === member.id ? 'selected' : ''}>${esc(member.name)}</option>`).join('')}</select></label><label class="field"><span class="label">${word('Review on', 'Пересмотреть до')}</span><input class="input" type="date" min="1970-01-01" max="9999-12-31" data-in="knowledgeReviewField" data-field="reviewDue" value="${esc(m.reviewDue || '')}" ${!editable || m.busy ? 'disabled' : ''}></label></div>${editable ? `<button class="btn btn-secondary btn-sm" data-a="knowledgeReviewSend" data-command="configure" ${disabled}>${word('Save responsibility', 'Сохранить настройки проверки')}</button>` : ''}</details>`
    : '';
  const request = editable
    ? `<details class="knowledge-review-section" ${disclosureAttributes('knowledge-review:' + m.noteId + ':request')}><summary>${word('Request a new review', 'Запросить новую проверку')}</summary><p class="hint">${word('Select up to five reviewers. A new request keeps earlier decisions in history. Self-review is recorded under your name.', 'Выберите до пяти проверяющих. Новый запрос сохранит прежние решения в журнале. Самопроверка записывается под вашим именем.')}</p><fieldset class="knowledge-review-people"><legend class="label">${word('Reviewers', 'Проверяющие')}</legend>${editors.map(member => `<label><input type="checkbox" data-in="knowledgeReviewField" data-field="reviewer" value="${esc(member.id)}" ${m.reviewers?.includes(member.id) ? 'checked' : ''} ${m.busy || (!m.reviewers?.includes(member.id) && m.reviewers?.length >= 5) ? 'disabled' : ''}><span>${esc(member.name)}${member.id === model.actor ? ' · ' + word('you', 'вы') : ''}</span></label>`).join('')}</fieldset><button class="btn btn-primary btn-sm" data-a="knowledgeReviewSend" data-command="request" ${disabled}>${word('Request review of this version', 'Запросить проверку этой версии')}</button></details>`
    : '';
  const assigned = model?.canWrite && current?.hash === model.reviewHash && current.reviewers.includes(model.actor);
  const recorded = current?.decisions.some(item => item.by === model.actor);
  const decisionTag = recorded ? 'details' : 'section';
  const decision = assigned
    ? `<${decisionTag} class="knowledge-review-section" ${recorded ? disclosureAttributes('knowledge-review:' + m.noteId + ':decision') : ''}>${recorded ? `<summary>${word('Update your decision', 'Изменить своё решение')}</summary>` : `<h3>${word('Your decision', 'Ваше решение')}</h3>`}<label class="field"><span class="label">${word('Comment (required for changes)', 'Пояснение (обязательно для правок)')}</span><textarea class="textarea" id="knowledge-review-comment" aria-invalid="${!!m.commentError}" ${m.commentError ? 'aria-describedby="knowledge-review-error"' : ''} rows="3" maxlength="1000" data-in="knowledgeReviewField" data-field="comment" ${disabled}>${esc(m.comment || '')}</textarea></label><div class="knowledge-review-buttons"><button class="btn btn-primary btn-sm" data-a="knowledgeReviewSend" data-command="approved" ${disabled}>${word('Approve this version', 'Подтвердить эту версию')}</button><button class="btn btn-secondary btn-sm" data-a="knowledgeReviewSend" data-command="changes" ${disabled}>${word('Request changes', 'Нужны правки')}</button></div></${decisionTag}>`
    : '';
  const reviewers = current
    ? `<section class="knowledge-review-section"><h3>${word('Current request', 'Текущий запрос')}</h3><p class="hint"><code>${esc(current.hash.slice(0, 12))}</code> · ${esc(name(current.by))} · ${esc(stamp(current.at))}</p><ul class="knowledge-review-results">${current.reviewers
        .map(id => {
          const result = current.decisions.find(item => item.by === id);
          return `<li><strong>${esc(name(id))}</strong><span>${result ? (result.outcome === 'approved' ? word('Approved', 'Подтверждено') : word('Changes requested', 'Нужны правки')) : word('Pending', 'Ожидает')}${!editors.some(member => member.id === id) ? ' · ' + word('account unavailable', 'аккаунт недоступен') : ''}</span>${result?.comment ? `<p>${esc(result.comment)}</p>` : ''}</li>`;
        })
        .join('')}</ul></section>`
    : '';
  const eventLabel = {
    configure: word('Responsibility updated', 'Настройки проверки изменены'),
    request: word('Review requested', 'Проверка запрошена'),
    decide: word('Decision recorded', 'Решение записано'),
  };
  const events = governance?.events || [];
  const history = events.length
    ? `<details class="knowledge-review-section" ${disclosureAttributes('knowledge-review:' + m.noteId + ':history')}><summary>${word('Decision history', 'Журнал решений')} · ${events.length}</summary><ol class="knowledge-review-history">${events
        .slice(-(m.historyLimit || 10))
        .reverse()
        .map(
          event =>
            `<li><strong>${esc(eventLabel[event.action])}</strong><small>${esc(name(event.by))} · ${esc(stamp(event.at))}</small><code>${esc(event.hash.slice(0, 12))}</code>${event.outcome ? `<span>${event.outcome === 'approved' ? word('Approved', 'Подтверждено') : word('Changes requested', 'Нужны правки')}</span>` : ''}${event.comment ? `<p>${esc(event.comment)}</p>` : ''}${event.ownerId ? `<p>${word('Knowledge owner', 'Ответственный')}: ${esc(name(event.ownerId))} · ${word('Review date', 'Дата пересмотра')}: ${esc(event.reviewDue || '—')}</p>` : ''}${event.reviewers ? `<p>${word('Reviewers', 'Проверяющие')}: ${event.reviewers.map(id => esc(name(id))).join(', ')}</p>` : ''}</li>`,
        )
        .join(
          '',
        )}</ol>${events.length > (m.historyLimit || 10) ? `<button class="btn btn-ghost btn-sm" data-a="knowledgeReviewHistory">${word('Show more', 'Показать ещё')}</button>` : ''}${governance.omitted ? `<p class="hint">${word('Earlier events omitted from this bounded journal', 'Более ранние события вне ограниченного журнала')}: ${governance.omitted}. ${word('Retained limit', 'Хранимый лимит')}: ${model.eventLimit}.</p>` : ''}</details>`
    : '';
  return `${H(word('Review note', 'Проверка заметки'))}<div class="modal-b knowledge-review" translate="no">${m.error ? `<div class="knowledge-review-error" id="knowledge-review-error" role="alert">${esc(m.error)}</div>` : ''}${m.loading ? `<p role="status">${word('Loading the current version…', 'Загружаем текущую версию…')}</p>` : ''}${m.busy ? `<p role="status">${word('Recording review…', 'Записываем проверку…')}</p>` : ''}${status}${configuration}${request}${decision}${reviewers}${history}${!m.loading ? `<div class="knowledge-review-buttons"><button class="btn btn-ghost btn-sm" data-a="knowledgeReviewReload" ${disabled}>${word('Refresh status', 'Обновить статус')}</button>${m.failed ? `<button class="btn btn-secondary btn-sm" data-a="knowledgeReviewRetry" ${disabled}>${word('Retry same request', 'Повторить тот же запрос')}</button>` : ''}</div>` : ''}</div><div class="modal-f"><button class="btn btn-secondary" data-a="closeModal">${word('Close', 'Закрыть')}</button></div>`;
}

async function load(m) {
  if (!fresh(m)) return;
  m.loading = true;
  m.error = '';
  m.model = null;
  render();
  try {
    await waitForPersonalPreferences();
    if (!workspaceSyncIsClean(S.data)) throw { local: true };
    await refreshWorkspaceFromServer();
    if (!fresh(m) || !workspaceSyncIsClean(S.data)) throw { local: true };
    const note = await ensureKnowledgeBody(D().knowledgeNotes.find(note => note.id === m.noteId));
    const seenHash = await localHash(note),
      model = await knowledgeReviewRequest(m.noteId);
    if (!fresh(m)) return;
    if (seenHash !== model.reviewHash) throw { code: 'KNOWLEDGE_VERSION_STALE' };
    m.seenHash = seenHash;
    m.model = model;
    m.ownerId = model.governance?.ownerId || model.defaultOwner;
    m.reviewDue = model.governance?.reviewDue || '';
    const eligible = new Set(model.members.filter(member => member.active && member.role !== 'viewer').map(member => member.id));
    m.reviewers = (model.governance?.current?.reviewers || [model.actor]).filter(id => eligible.has(id));
    if (!m.reviewers.length && eligible.has(model.actor)) m.reviewers = [model.actor];
    m.comment = '';
    m.commentError = false;
    m.failed = null;
  } catch (error) {
    if (fresh(m))
      m.error = error.local
        ? word('Wait until your note changes are saved, then refresh.', 'Дождитесь сохранения правок заметки и обновите статус.')
        : errorText(error);
  } finally {
    m.loading = false;
    if (active() === m) render();
  }
}
export function openKnowledgeReview(id) {
  if (active()) return;
  if (!D().knowledgeNotes.some(note => note.id === id)) return;
  openModal({ type: 'knowledgeTool', knowledgeReview: true, noteId: id, scope: scope(), render: reviewView });
  return load(active());
}
IN.knowledgeReviewField = el => {
  const m = active();
  if (!m || m.busy) return;
  if (el.dataset.field === 'reviewer') {
    m.reviewers = el.checked ? [...new Set([...m.reviewers, el.value])] : m.reviewers.filter(id => id !== el.value);
    for (const input of document.querySelectorAll('.knowledge-review-people input')) input.disabled = !input.checked && m.reviewers.length >= 5;
  } else if (['ownerId', 'reviewDue', 'comment'].includes(el.dataset.field)) {
    m[el.dataset.field] = el.value;
    if (el.dataset.field === 'comment') {
      m.commentError = false;
      el.removeAttribute('aria-invalid');
      el.removeAttribute('aria-describedby');
    }
  }
};
A.knowledgeReviewReload = () => {
  const m = active();
  if (m && !m.busy) return load(m);
};
A.knowledgeReviewHistory = () => {
  const m = active();
  if (m) {
    m.historyLimit = (m.historyLimit || 10) + 10;
    render();
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
    const model = await knowledgeReviewRequest(m.noteId, payload);
    if (!fresh(m)) return;
    if (model.reviewHash !== m.seenHash) {
      m.model = null;
      m.failed = null;
      m.error = word(
        'The operation was confirmed, but the note has since changed. Refresh and read the current version.',
        'Операция подтверждена, но заметка уже изменилась. Обновите данные и прочитайте текущую версию.',
      );
      await refreshWorkspaceFromServer();
      return;
    }
    m.model = model;
    m.failed = null;
    m.comment = '';
    m.commentError = false;
    await refreshWorkspaceFromServer();
  } catch (error) {
    if (fresh(m)) {
      m.error = error.local
        ? word('Wait until local changes are saved, then refresh.', 'Дождитесь сохранения локальных изменений и обновите статус.')
        : errorText(error);
      m.failed = error.local || (error.status >= 400 && error.status < 500) ? null : payload;
    }
  } finally {
    m.busy = false;
    if (active() === m) {
      render();
      if (!m.error && payload.action === 'decide')
        requestAnimationFrame(() => {
          if (active() === m) document.getElementById('knowledge-review-status')?.focus();
        });
    }
  }
}
A.knowledgeReviewSend = el => {
  const m = active();
  if (!m?.model || m.busy) return;
  if (m.failed) {
    m.error = word('Refresh the status or retry the unconfirmed request first.', 'Сначала обновите статус или повторите неподтверждённый запрос.');
    render();
    return;
  }
  const action = el.dataset.command,
    model = m.model;
  if (!['configure', 'request', 'approved', 'changes'].includes(action)) return;
  if (action === 'request' && (!m.reviewers?.length || m.reviewers.length > 5)) {
    m.error = word('Select one to five reviewers.', 'Выберите от одного до пяти проверяющих.');
    render();
    return;
  }
  if (action === 'changes' && !m.comment?.trim()) {
    m.commentError = true;
    m.error = word('Explain which changes are needed.', 'Укажите, какие правки необходимы.');
    render();
    queueMicrotask(() => document.getElementById('knowledge-review-comment')?.focus());
    return;
  }
  const payload = {
    operationId: crypto.randomUUID(),
    reviewHash: model.reviewHash,
    reviewRevision: model.governance?.revision || 0,
    ...(action === 'configure'
      ? { action, ownerId: m.ownerId, reviewDue: m.reviewDue }
      : action === 'request'
        ? { action, reviewers: m.reviewers }
        : { action: 'decide', outcome: action, comment: m.comment || '' }),
  };
  return send(m, payload);
};
A.knowledgeReviewRetry = () => {
  const m = active();
  if (m?.failed) return send(m, m.failed);
};
