import { S, D } from '../core/store.js';
import { esc, fmtTimestamp } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { isRussian, t as tr } from '../core/i18n.js';
import { disclosureAttributes } from './disclosure.js';
import { deliveryTriage } from '../shared/delivery-triage.js';
import { reviewNotificationDelivery, getNotificationDeliveryStatus, getActiveWorkspace, getSessionGeneration } from '../core/api.js';
import { render } from '../shell/render.js';
import { toast } from './toast.js';

function queueReviewPanel(status) {
  const review = status.review;
  if (!review) return '';
  const copy = (en, ru) => (isRussian() ? ru : en);
  const button = (action, en, ru) =>
    `<button class="btn btn-secondary btn-sm" data-a="reviewNotificationDelivery" data-action="${action}" ${S.ui.notificationDeliveryLoading ? 'disabled' : ''}>${copy(en, ru)}</button>`;
  return `<details ${disclosureAttributes('notification-queue-review')} translate="no"><summary>${copy('Review delivery queue', 'Проверить очередь доставки')} · ${copy(review.paused ? 'Paused' : 'Enabled', review.paused ? 'На паузе' : 'Включена')}</summary>
    <p class="hint">${copy('Resuming enables automatic delivery to the recipients below. Pause stops new attempts; an active attempt may finish. Skipping retains an audit record and does not send.', 'Возобновление разрешит автоматическую доставку получателям ниже. Пауза останавливает новые попытки; начатая может завершиться. Пропуск сохраняет запись и ничего не отправляет.')}</p>
    <p>${copy('Pending jobs', 'Заданий в ожидании')}: ${review.jobs} · ${copy('Older than 7 days', 'Старше 7 дней')}: ${review.olderThanWeek}</p>
    <div class="row" style="flex-wrap:wrap;gap:8px">${review.paused ? button('resume', 'Enable reviewed queue', 'Включить проверенную очередь') : button('pause', 'Pause delivery', 'Приостановить доставку')}${review.olderThanWeek ? button('skip-before', 'Skip items older than 7 days', 'Пропустить старше 7 дней') : ''}</div>
    ${review.preview.length ? `<ul class="notification-delivery-issues">${review.preview.map(job => `<li>${esc(job.recipient)} · ${esc(job.channels.join(', '))} · ${settingsTimestamp(job.createdAt)}</li>`).join('')}</ul>` : ''}
    ${review.truncated ? `<p class="hint">${copy('First 50 jobs shown. Inspect and skip the oldest batch before enabling a large backlog.', 'Показаны первые 50 заданий. Разберите старые задания перед включением большой очереди.')}</p>` : ''}
    ${status.channels?.push?.migrationRequired ? `<p class="hint">${copy('Devices requiring reconnection after domain/key change', 'Устройства, требующие повторного подключения после смены домена/ключа')}: ${status.channels.push.migrationRequired}</p>` : ''}
  </details>`;
}

export async function reviewQueue(el) {
  const review = S.ui.notificationDeliveryStatus?.review;
  if (!review || S.ui.currentUser?.role !== 'admin' || S.ui.notificationDeliveryLoading) return;
  const identity = () => JSON.stringify([getActiveWorkspace(), getSessionGeneration()]);
  const before = identity(),
    input = { action: el.dataset.action, revision: review.revision, cutoff: review.cutoff };
  S.ui.notificationDeliveryLoading = true;
  render();
  try {
    await reviewNotificationDelivery(input);
    const status = await getNotificationDeliveryStatus();
    if (before === identity()) S.ui.notificationDeliveryStatus = status;
  } catch (error) {
    if (before === identity()) toast(error.message, { kind: 'err' });
  } finally {
    if (before === identity()) {
      S.ui.notificationDeliveryLoading = false;
      render();
    }
  }
}
const settingsTimestamp = value => (value && Number.isFinite(new Date(value).getTime()) ? fmtTimestamp(new Date(value)) : '—');
export function deliveryStatusPanel() {
  if (S.ui.currentUser?.role !== 'admin') return '';
  const status = S.ui.notificationDeliveryStatus;
  if (!status) {
    return `<div class="sblock notification-delivery-card"><div class="row between"><div><h2>Delivery diagnostics</h2><p class="muted">Check server-side email and Web Push delivery.</p></div><button class="btn btn-secondary btn-sm" data-a="refreshNotificationDelivery">${ic('refresh-cw', 13)}Check status</button></div></div>`;
  }
  const emailReady = status.channels?.email?.configured && status.channels?.email?.authorized;
  const pushReady = status.channels?.push?.configured;
  const copy = (en, ru) => (isRussian() ? ru : en);
  const queue = status.outbox || {};
  const lastCron = status.delivery?.lastCron;
  const lastRun = status.delivery?.lastRun;
  const recentEmailFailure = Number(lastRun?.email?.failed || 0) > 0;
  const emailTestAccepted = Number(S.ui.testNotificationResults?.email?.delivered || 0) > 0;
  const emailLabel = !emailReady
    ? 'Needs attention'
    : emailTestAccepted
      ? 'Test accepted by provider'
      : recentEmailFailure
        ? 'Recent delivery failed'
        : 'Authorized';
  const operational = status.operational;
  const coordinationMode =
    status.workspace?.coordination?.mode === 'local-queue'
      ? 'Local write queue'
      : status.workspace?.coordination?.mode === 'redis'
        ? 'Distributed lock'
        : status.workspace?.coordination?.mode === 'drive-etag'
          ? 'Version and ETag checks'
          : status.workspace?.coordination?.mode || '—';
  const issueMessages = {
    storage: 'Workspace storage needs attention.',
    coordination: 'Write coordination needs attention.',
    email: 'Email authorization needs attention.',
    push: 'Web Push is not configured.',
    cron_stale: copy(
      'No recent automatic run. Check the scheduler on your hosting server.',
      'Нет недавнего автоматического запуска. Проверьте планировщик на вашем хостинге.',
    ),
    cron_degraded: 'The last automatic run reported errors.',
    delivery: 'The latest notification delivery reported errors.',
    outbox_stale: 'Some notifications have been waiting for more than one hour.',
  };
  const healthLabel = operational?.status === 'healthy' ? 'Healthy' : operational?.status === 'critical' ? 'Critical' : 'Needs attention';
  const cronLabel = !lastCron
    ? 'No run recorded yet'
    : lastCron.status === 'ok'
      ? 'Completed successfully'
      : lastCron.status === 'degraded'
        ? 'Completed with delivery errors'
        : 'Automatic run failed';
  const state = (ready, label) => `<span class="badge ${ready ? 'green' : 'amber'}"><span class="dot"></span>${esc(tr(label))}</span>`;
  const nextChecks = deliveryTriage(operational?.issues, isRussian() ? 'ru' : 'en');
  return `<div class="sblock notification-delivery-card">
    <div class="row between notification-delivery-head"><div><h2>Delivery diagnostics</h2><p class="muted">Server-side channel health and recent delivery results.</p></div><div class="row">${state(operational?.status === 'healthy', healthLabel)}<button class="btn btn-secondary btn-sm" data-a="refreshNotificationDelivery" ${S.ui.notificationDeliveryLoading ? 'disabled' : ''}>${ic('refresh-cw', 13)}${S.ui.notificationDeliveryLoading ? 'Checking…' : 'Refresh'}</button></div></div>
    ${
      operational?.issues?.length
        ? `<ul class="notification-delivery-issues">${operational.issues
            .filter(issue => issueMessages[issue.code])
            .map(issue => `<li>${esc(tr(issueMessages[issue.code]))}</li>`)
            .join('')}</ul>`
        : ''
    }
    ${nextChecks.length ? `<details class="notification-delivery-next" ${disclosureAttributes('delivery-next-checks')}><summary translate="no">${copy('What to check next', 'Что проверить дальше')}</summary><ul class="notification-delivery-issues">${nextChecks.map(check => `<li data-diagnostic-code="${check.code}" translate="no">${esc(check.text)}${check.section ? ` <button class="btn btn-sm btn-ghost" data-a="go" data-r="settings" data-sec="${check.section}">${esc(copy('Open settings', 'Открыть настройки'))}</button>` : ''}</li>`).join('')}</ul></details>` : ''}
    <div class="row" style="gap:8px;flex-wrap:wrap;margin:12px 0"><button class="btn btn-secondary btn-sm" data-a="testNotificationDelivery" data-channel="email" ${S.ui.testNotificationSending ? 'disabled' : ''}>Send test email to me</button><button class="btn btn-secondary btn-sm" data-a="testNotificationDelivery" data-channel="push" ${S.ui.testNotificationSending ? 'disabled' : ''}>Send test push to me</button></div>
    <p class="hint">Tests go only to your account, not to the team. Provider acceptance does not confirm receipt on your device.</p>
    ${Object.values(S.ui.testNotificationResults || {})
      .map(
        result =>
          `<div role="status" class="alert ${result.delivered ? 'success' : 'warn'}"><span>${esc(tr(result.channel === 'email' ? 'Test email' : 'Test push'))}: ${esc(result.recipient)} · ${esc(tr('Accepted'))}: ${Number(result.delivered || 0)} · ${esc(tr('Failed'))}: ${Number(result.failed || 0)} · ${esc(tr('Attempted'))}: ${Number(result.attempted || 0)} · ${settingsTimestamp(result.at)}</span></div>`,
      )
      .join('')}
    <p class="hint" translate="no">${copy('Workspace', 'Пространство')}: ${esc(D().ws.name)} · ${copy('Data synchronization and notification delivery are independent.', 'Синхронизация данных и доставка уведомлений проверяются отдельно.')}</p>
    ${queue.pending ? `<div class="alert warn"><div><b>${copy('Delivery queue needs attention', 'Очередь доставки требует внимания')}</b><p>${copy('Email', 'Почта')}: ${Number(queue.channels?.email || 0)} · Push: ${Number(queue.channels?.push || 0)}</p><p>${copy('Oldest pending item', 'Самое старое ожидание')}: ${settingsTimestamp(queue.oldestPendingAt)}</p><p>${copy('Channel unavailable', 'Канал недоступен')}: ${Number(queue.reasons?.channel_unavailable || 0)} · ${copy('Provider error', 'Ошибка провайдера')}: ${Number(queue.reasons?.provider_error || 0)} · ${copy('Cause not recorded', 'Причина не записана')}: ${Number(queue.reasons?.unknown || 0)}</p><p>${copy('Check channel authorization and device subscriptions before retrying. A successful latest attempt does not clear the remaining queue.', 'Проверьте авторизацию канала и подписки устройств перед повтором. Успешная последняя попытка не означает разбор оставшейся очереди.')}</p></div></div>` : ''}
    ${queueReviewPanel(status)}
    <div class="notification-delivery-grid">
      <div><span class="label">Google Drive</span>${state(status.workspace?.storage?.connected && status.workspace?.storage?.persistent, status.workspace?.storage?.connected ? 'Connected' : 'Needs attention')}<p class="hint">Workspace storage</p></div>
      <div><span class="label">Coordination</span>${state(status.workspace?.coordination?.healthy, status.workspace?.coordination?.healthy ? 'Ready' : 'Critical')}<p class="hint">${esc(tr(coordinationMode))}</p></div>
      <div><span class="label">Email</span>${state(emailReady && (emailTestAccepted || !recentEmailFailure), emailLabel)}<p class="hint">Gmail API</p>${emailReady && !emailTestAccepted && !Number(lastRun?.email?.delivered || 0) ? `<p class="hint">${tr('OAuth access is verified; successful email delivery is not confirmed yet.')}</p>` : ''}</div>
      <div><span class="label">Pending deliveries</span><b>${Number(status.outbox?.pending || 0)}</b><p class="hint">${tr('Retrying')}: ${Number(status.outbox?.retrying || 0)}</p>${status.outbox?.pending ? `<button class="btn btn-secondary btn-sm" data-a="retryNotificationDelivery" ${S.ui.notificationDeliveryLoading || status.review?.paused ? 'disabled' : ''}>${ic('refresh-cw', 13)}Send pending</button>` : ''}</div>
      <div><span class="label">Web Push</span>${state(pushReady, pushReady ? 'Configured' : 'Needs attention')}<p class="hint">${Number(status.channels?.push?.subscriptions || 0)} active devices</p></div>
      <div><span class="label">Last automatic run</span><b>${settingsTimestamp(lastCron?.at)}</b><p class="hint">${cronLabel}</p></div>
      <div><span class="label">Latest delivery</span><b>${settingsTimestamp(lastRun?.at)}</b><p class="hint">${Number(lastRun?.push?.delivered || 0)} push · ${Number(lastRun?.email?.delivered || 0)} email · ${Number(lastRun?.push?.failed || 0) + Number(lastRun?.email?.failed || 0)} failed</p></div>
    </div>
  </div>`;
}
