import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';

export function notificationReadButton(notification, contextId) {
  const label = notification.read ? 'Mark as unread' : 'Mark as read';
  return `<button type="button" class="ibtn ibtn-sm notification-read" data-a="toggleRead" data-id="${esc(notification.id)}" aria-label="${label}" aria-describedby="${esc(contextId)}" title="${label}">${ic(notification.read ? 'mail' : 'mail-open', 14)}</button>`;
}
