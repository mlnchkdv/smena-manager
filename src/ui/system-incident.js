import { esc, fmtTimestamp } from '../core/utils.js';
import { isRussian } from '../core/i18n.js';
import { incidentStateLabel } from '../shared/system-incidents.js';

export function systemIncidentBadge(notification) {
  const label = incidentStateLabel(notification, isRussian() ? 'ru' : 'en');
  return label
    ? `<span class="badge system-incident-state" translate="no" ${notification.incident?.state === 'resolved' ? 'style="color:var(--green)"' : ''}>${esc(label)}</span>`
    : '';
}
export function systemIncidentDetails(notification) {
  const incident = notification.incident;
  if (!incident) return systemIncidentBadge(notification);
  const text = (en, ru) => (isRussian() ? ru : en);
  const evidence = {
    digest_prepared: text(
      'A later digest was prepared. Email delivery is tracked separately.',
      'Последующая почтовая сводка подготовлена. Доставка учитывается отдельно.',
    ),
    backup_verified: text('A backup is available after the operation completed.', 'Операция завершена, резервная копия доступна.'),
    cleanup_completed: text('A later file cleanup completed without errors.', 'Последующая очистка файлов выполнена без ошибок.'),
    uploads_verified: text('A later upload cleanup verified and registered its candidates.', 'Последующая проверка незавершённых загрузок выполнена.'),
    delivery_confirmed: text('Every affected delivery has a confirmed provider receipt.', 'Для всех затронутых доставок есть подтверждение провайдера.'),
    automation_completed: text('A later scheduled run completed successfully.', 'Последующий плановый запуск выполнен успешно.'),
  }[incident.evidence];
  return `<div class="system-incident-details" translate="no">${systemIncidentBadge(notification)}<dl><dt>${text('First occurrence', 'Первое проявление')}</dt><dd>${esc(fmtTimestamp(incident.firstAt))}</dd><dt>${text('Last occurrence', 'Последнее проявление')}</dt><dd>${esc(fmtTimestamp(incident.lastAt))}</dd>${incident.resolvedAt ? `<dt>${text('Recovery confirmed', 'Восстановление подтверждено')}</dt><dd>${esc(fmtTimestamp(incident.resolvedAt))}</dd>` : ''}</dl>${evidence ? `<p class="hint">${esc(evidence)}</p>` : ''}<small>${text('Incident', 'Инцидент')}: ${esc(incident.id)}</small></div>`;
}
