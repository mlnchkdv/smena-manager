import { isRussian, t } from '../core/i18n.js';
import { disclosureAttributes } from './disclosure.js';

export function notificationOverview(prefs) {
  const copy = (en, ru) => (isRussian() ? ru : en);
  const state = value => (value ? copy('On', 'Вкл.') : copy('Off', 'Выкл.'));
  const rows = [
    ['mention', 'Mentions'],
    ['assign', 'Assignments'],
    ['comment', 'Comments'],
    ['update', 'Task status changes'],
    ['due', 'Due date reminders'],
    ['security', 'Security alerts'],
    ['digest', 'Daily digest'],
  ];
  return `<details class="notification-overview" ${disclosureAttributes('notification-overview')}><summary translate="no">${copy('My notification channels', 'Мои каналы уведомлений')}</summary><p class="hint" translate="no">${copy('Saved preferences in this workspace. Browser delivery also requires a connected device; these settings do not confirm delivery.', 'Сохранённые предпочтения в этом пространстве. Для уведомлений браузера также нужно подключённое устройство; настройки не подтверждают доставку.')}</p><div class="notification-overview-scroll"><table><thead><tr><th>${copy('Event', 'Событие')}</th><th><button class="btn btn-ghost btn-sm" data-a="go" data-r="settings" data-sec="notif-email">${t('Email')}</button></th><th><button class="btn btn-ghost btn-sm" data-a="go" data-r="settings" data-sec="notif-push">${t('Browser notifications')}</button></th></tr></thead><tbody>${rows.map(([key, label]) => `<tr><th scope="row">${t(label)}</th><td translate="no">${state(prefs['email_' + key])}</td><td translate="no">${key === 'digest' ? '—' : state(prefs['push_' + key])}</td></tr>`).join('')}</tbody></table></div><div class="row notification-overview-links"><button class="btn btn-ghost btn-sm" data-a="go" data-r="settings" data-sec="notif-mentions">${t('Mentions')}</button><button class="btn btn-ghost btn-sm" data-a="go" data-r="settings" data-sec="notif-assign">${t('Task assignments')}</button></div></details>`;
}
