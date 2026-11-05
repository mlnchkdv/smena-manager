// Provider messages may contain private object identifiers. UI copy uses codes only.
export function mediaBackupError(error, russian = false) {
  const messages = {
    MEDIA_RESTORE_REVIEW_CHANGED: [
      'The restore plan changed. Review it again before continuing.',
      'План восстановления изменился. Проверьте его заново перед продолжением.',
    ],
    MEDIA_BACKUP_LIMIT: ['Copy limit reached. Existing copies remain available in the list.', 'Достигнут лимит копий. Существующие копии доступны в списке.'],
    MEDIA_BACKUP_BUSY: ['Another operation is copying this set. Retry shortly.', 'Этот набор уже копируется. Повторите немного позже.'],
    MEDIA_SOURCE_CHANGED: [
      'The source is unavailable or its checksum changed. Review the files before continuing.',
      'Исходный файл недоступен или его контрольная сумма изменилась. Проверьте файлы перед продолжением.',
    ],
    REVISION_CONFLICT: ['The workspace changed. Refresh the list and retry.', 'Пространство изменилось. Обновите список и повторите.'],
    WORKSPACE_TOO_LARGE: [
      'The data limit was reached. Review workspace capacity before retrying.',
      'Достигнут лимит данных. Проверьте ёмкость пространства перед повтором.',
    ],
  };
  let pair = messages[error?.code];
  if (!pair && error?.status === 401) pair = ['Sign in again to continue.', 'Войдите снова, чтобы продолжить.'];
  if (!pair && error?.status === 403) pair = ['Access is unavailable. Check your project permissions.', 'Доступ недоступен. Проверьте права проекта.'];
  if (!pair && error?.status === 429) pair = ['Too many requests. Retry shortly.', 'Слишком много запросов. Повторите немного позже.'];
  if (!pair && error?.status === 507)
    pair = ['Not enough Drive space. Free space before retrying.', 'На Google Диске недостаточно места. Освободите место перед повтором.'];
  return (pair || ['Unable to complete the operation. Check connection and retry.', 'Не удалось выполнить операцию. Проверьте подключение и повторите.'])[
    russian ? 1 : 0
  ];
}
