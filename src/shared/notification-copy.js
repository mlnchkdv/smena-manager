const RU = Object.freeze({
  'assigned you': 'назначил(а) вам задачу',
  'commented on': 'оставил(а) комментарий',
  'mentioned you in': 'упомянул(а) вас',
  'mentioned your team in': 'упомянул(а) вашу команду',
  'mentioned everyone in': 'упомянул(а) всех',
  'is due tomorrow': 'срок завтра',
  'is due today': 'срок сегодня',
  'is overdue': 'срок просрочен',
  completed: 'завершил(а) задачу',
  'New sign-in detected': 'Обнаружен новый вход',
  'System check needs attention': 'Система требует внимания',
});
const RU_STATUSES = Object.freeze({ Backlog: 'Бэклог', 'To do': 'К выполнению', 'In progress': 'В работе', Review: 'На проверке', Done: 'Готово' });

export function notificationLocale(data, memberId, fallback = 'en') {
  const locale = data?.members?.find(member => member.id === memberId)?.locale || fallback;
  return String(locale).toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

export function notificationAction(notification, locale = 'en') {
  const text = notification?.text || '';
  if (locale !== 'ru') return text;
  if (RU[text]) return RU[text];
  const moved = /^moved to (.+)$/u.exec(text);
  return moved ? `изменил(а) статус на «${RU_STATUSES[moved[1]] || moved[1]}»` : text;
}

export function notificationSnippet(notification, locale = 'en') {
  const text = notification?.snippet || '';
  // Only status-transition events contain system labels. Never translate user content.
  return locale === 'ru' && notification?.type === 'update' && notification?.task && /^(?:moved to |completed$)/u.test(notification.text || '')
    ? text
        .split(' → ')
        .map(status => RU_STATUSES[status] || status)
        .join(' → ')
    : text;
}
