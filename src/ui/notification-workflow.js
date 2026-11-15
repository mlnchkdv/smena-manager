import { pageIntroduction } from './page-introduction.js';
import { isRussian } from '../core/i18n.js';
export function notificationWorkflow(view) {
  const text = isRussian()
    ? 'Во «Входящих» разбирайте обращения и отвечайте на комментарии. В «Уведомлениях» просматривайте историю событий. Статус прочтения общий для обоих представлений.'
    : 'Use Inbox to handle requests and reply to comments. Use Notifications to review event history. Read status is shared between both views.';
  return pageIntroduction(
    `<span translate="no">${text}</span> <button class="btn btn-ghost btn-sm" data-a="go" data-r="${view === 'inbox' ? 'notifications' : 'inbox'}" translate="no">${isRussian() ? (view === 'inbox' ? 'Открыть уведомления' : 'Открыть входящие') : view === 'inbox' ? 'Open notifications' : 'Open inbox'}</button>`,
  );
}
