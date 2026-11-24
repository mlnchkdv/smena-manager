import { esc } from '../core/utils.js';
import { ago } from '../core/utils.js';
import { isRussian } from '../core/i18n.js';
import { disclosureAttributes } from './disclosure.js';
import { ic } from '../core/icons.js';

export function signInGroup(notification, earlier, row, selected) {
  const events = [notification, ...earlier];
  const unread = events.filter(event => !event.read).length;
  const open = events.some(event => event.id === selected);
  return `<details class="notification-sign-ins" ${disclosureAttributes('sign-ins:' + notification.id)} ${open ? 'open' : ''}><summary><strong>${isRussian() ? 'Входы' : 'Sign-ins'} · ${events.length}</strong> <span translate="no">${esc(notification.snippet)}</span><small>${ago(notification.at)}${unread ? ' · ' + (isRussian() ? 'Непрочитано' : 'Unread') + ': ' + unread : ''}</small></summary>${events.map(row).join('')}</details>`;
}
export function notificationReadButton(notification, contextId) {
  const label = notification.read ? 'Mark as unread' : 'Mark as read';
  return `<button type="button" class="ibtn ibtn-sm notification-read" data-a="toggleRead" data-id="${esc(notification.id)}" aria-label="${label}" aria-describedby="${esc(contextId)}" title="${label}">${ic(notification.read ? 'mail' : 'mail-open', 14)}</button>`;
}
