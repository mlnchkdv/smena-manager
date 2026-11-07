const CHECKS = {
  storage: {
    en: 'Ask the workspace owner to check Google Drive access and free space. Keep unsynced changes on this device, then refresh status.',
    ru: 'Попросите владельца проверить доступ к Google Диску и свободное место. Сохраните несинхронизированные изменения на этом устройстве, затем обновите статус.',
  },
  coordination: {
    en: 'The owner should check write coordination on the server. Keep pending changes; do not resolve this by clearing browser storage.',
    ru: 'Владельцу нужно проверить координацию записи на сервере. Сохраните ожидающие изменения; очистка данных браузера не исправляет эту ошибку.',
  },
  email: {
    en: 'The owner should check Gmail API and server authorization. A test accepted by Google still needs confirmation in your mailbox.',
    ru: 'Владельцу нужно проверить Gmail API и авторизацию сервера. После принятия теста Google отдельно проверьте получение в почте.',
  },
  push: {
    en: 'Server Web Push configuration is missing. After the owner configures it, allow notifications and connect this browser in notification settings.',
    ru: 'На сервере не настроен Web Push. После настройки владельцем разрешите уведомления и подключите этот браузер в настройках уведомлений.',
    section: 'notif-push',
  },
  cron_stale: {
    en: 'The owner should check the scheduler on the hosting server and the saved execution result. HTTP 200 alone does not confirm a successful run.',
    ru: 'Владельцу нужно проверить планировщик на хостинге и сохранённый результат выполнения. HTTP 200 сам по себе не подтверждает успешный запуск.',
  },
  cron_degraded: {
    en: 'Review the failed part of the last scheduled run before repeating anything. Do not repeat mail delivery, cleanup or restoration as a diagnostic check.',
    ru: 'Проверьте ошибочный этап последнего запуска перед повтором. Не запускайте рассылку, очистку или восстановление повторно только ради диагностики.',
  },
  delivery: {
    en: 'Review the failed email or push entries and their recipients. Retry only the intended failed entries after correcting their cause.',
    ru: 'Проверьте ошибочные отправки почты или push и их получателей. После исправления причины повторяйте только нужные ошибочные отправки.',
  },
  outbox_stale: {
    en: 'Check the oldest pending delivery and the scheduler. Waiting is not delivered, and a manual test does not clear the delivery queue.',
    ru: 'Проверьте старую ожидающую отправку и планировщик. Ожидание не означает доставку, а ручной тест не очищает очередь отправки.',
  },
};

export function deliveryTriage(issues, language = 'en') {
  if (!Array.isArray(issues)) return [];
  const locale = language === 'ru' ? 'ru' : 'en',
    seen = new Set(),
    rows = [];
  for (const issue of issues) {
    const code = Object.hasOwn(CHECKS, issue?.code) ? issue.code : 'unknown';
    if (seen.has(code)) continue;
    seen.add(code);
    const check = CHECKS[code];
    rows.push({
      code,
      section: check?.section || '',
      text:
        check?.[locale] ||
        (locale === 'ru'
          ? 'Получен неизвестный статус. Передайте владельцу время проверки; не публикуйте ключи, токены и содержимое документов.'
          : 'An unrecognized status was received. Share the check time with the owner; do not publish keys, tokens or document contents.'),
    });
  }
  return rows;
}
