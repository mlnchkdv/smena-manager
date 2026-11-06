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
const SYSTEM_ISSUES = Object.freeze({
  'Email digest delivery failed': 'Не удалось доставить почтовую сводку',
  'Email digest preparation failed': 'Не удалось подготовить почтовую сводку',
  'Automatic backup failed': 'Не удалось создать автоматическую копию',
  'File cleanup failed': 'Ошибка очистки файлов',
  'Abandoned upload cleanup failed': 'Ошибка очистки незавершённых загрузок',
  'Notification delivery failed': 'Не удалось доставить уведомления',
  'Daily automation failed': 'Ошибка планового запуска',
});

export function notificationLocale(data, memberId, fallback = 'en') {
  const locale = data?.members?.find(member => member.id === memberId)?.locale || fallback;
  return String(locale).toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

export function notificationAction(notification, locale = 'en') {
  const text = notification?.text || '';
  if (notification?.type === 'system' && !notification.by && notification.incident?.state === 'resolved')
    return locale === 'ru' ? 'Системный инцидент устранён' : 'System incident resolved';
  if (notification?.type === 'system' && !notification.by && text === 'System check needs attention')
    return locale === 'ru' ? 'Зафиксирован системный сбой' : 'Recorded system incident';
  if (locale !== 'ru') return text;
  if (RU[text]) return RU[text];
  const moved = /^moved to (.+)$/u.exec(text);
  return moved ? `изменил(а) статус на «${RU_STATUSES[moved[1]] || moved[1]}»` : text;
}

export function notificationSnippet(notification, locale = 'en') {
  const text = notification?.snippet || '';
  if (locale === 'ru' && notification?.type === 'system' && !notification.by && notification.text === 'System check needs attention')
    return text
      .split(' · ')
      .map(issue => SYSTEM_ISSUES[issue] || issue)
      .join(' · ');
  // Only status-transition events contain system labels. Never translate user content.
  return locale === 'ru' && notification?.type === 'update' && notification?.task && /^(?:moved to |completed$)/u.test(notification.text || '')
    ? text
        .split(' → ')
        .map(status => RU_STATUSES[status] || status)
        .join(' → ')
    : text;
}
