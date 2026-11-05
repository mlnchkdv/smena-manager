import { pageIntroduction } from './page-introduction.js';
import { isRussian } from '../core/i18n.js';
export function notificationWorkflow(view) {
  const text = isRussian()
    ? 'Это два представления одной личной ленты: статус прочтения общий. Во «Входящих» удобно разбирать обращения и отвечать на комментарии; «Уведомления» — компактный обзор событий. Технические события с прочитанной историей объединяются без удаления исходных записей.'
    : 'These are two views of one personal feed, with shared read status. Use Inbox to handle requests and reply to comments; Notifications is the compact event overview. Read technical history is grouped without deleting source events.';
  return pageIntroduction(
    `<span translate="no">${text}</span> <button class="btn btn-ghost btn-sm" data-a="go" data-r="${view === 'inbox' ? 'notifications' : 'inbox'}" translate="no">${isRussian() ? (view === 'inbox' ? 'Открыть уведомления' : 'Открыть входящие') : view === 'inbox' ? 'Open notifications' : 'Open inbox'}</button>`,
  );
}
