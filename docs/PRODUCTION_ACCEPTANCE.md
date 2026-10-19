# Production acceptance / Приёмка production

This runbook is intentionally read-only by default. It describes how to verify the deployed application without copying credentials or changing team data.

Этот регламент по умолчанию не изменяет данные. Он описывает проверку развёрнутого приложения без копирования секретов и изменения данных команды.

## 1. Access isolation / Изоляция доступа

Run the checks with two approved test identities and a private project, note, file, comment, notification, and graph edge.

Проверяйте двумя разрешёнными тестовыми аккаунтами с закрытым проектом, заметкой, файлом, комментарием, уведомлением и ребром графа.

- The owner can read and edit every item they own.
- A viewer cannot mutate projects, tasks, files, comments, relations, or notification state.
- A member without project access cannot discover the item through search, graph, direct URLs, or API IDs.
- A removed member loses access after reload and after a new session is issued.
- Direct API calls must return the same decision as the UI; never rely on hidden buttons as an access control.

Expected result: no private title, description, file metadata, comment, notification, or graph endpoint is returned to the second identity.

Ожидаемый результат: второму аккаунту не возвращаются название, описание, метаданные файла, комментарии, уведомления или вершины/рёбра закрытого объекта.

Record date, deployment URL, account role, request ID, and result. Do not record cookies, OAuth codes, refresh tokens, or raw provider responses.

## 2. Restore and attachment drill / Проверка восстановления и вложений

Use a disposable workspace or an explicitly approved maintenance window. Create a backup, add a small text attachment, restore the backup, and verify the attachment bytes and metadata. Repeat with an injected read, write, checksum, and provider failure in a local test environment.

Для проверки используйте отдельное рабочее пространство или явно согласованное окно обслуживания. Создайте копию, добавьте небольшое текстовое вложение, восстановите копию и сравните байты и метаданные. Отдельно прогоните ошибки чтения, записи, контрольной суммы и провайдера в локальном тестовом окружении.

The operation must be atomic: a failed restore leaves the current core data, documents, and physical files unchanged. A repeated restore/delete request must be idempotent and must not remove an unrelated file sharing the same name.

Операция должна быть атомарной: неудачное восстановление не меняет текущие данные, документы и физические файлы. Повторный restore/delete должен быть идемпотентным и не удалять другой файл с тем же именем.

## 3. OAuth/Gmail ownership / Владелец OAuth и Gmail

- Keep the OAuth client in the approved Google Cloud project and use the production HTTPS callback only.
- Request the minimum scopes currently required: profile/email, Drive storage, and Gmail send.
- Store refresh tokens only in the deployment secret store; never commit them or place them in a browser bundle.
- Rotate the Gmail refresh token after an owner change, suspected exposure, or Google revocation. Confirm `emailAuthorizationStatus()` is degraded before re-authorizing and healthy afterwards.
- Document the owner account, consent-screen publishing state, redirect URIs, and a revocation procedure in the password manager, not in Git.

- OAuth-клиент хранится в утверждённом Google Cloud-проекте, используется только production HTTPS callback.
- Запрашиваются только необходимые scope: профиль/email, Drive storage и Gmail send.
- Refresh token хранится только в секретах деплоя; в Git и клиентский bundle он не попадает.
- После смены владельца, подозрения на утечку или отзыва Google токен нужно заменить. До повторной авторизации `emailAuthorizationStatus()` должен показывать degraded, после — healthy.

## 4. Files and responsive matrix / Файлы и адаптивная матрица

Verify upload, resumable retry, range download, preview safety, and deletion at 320, 390, 768, 1024, and 1440 CSS pixels. Repeat on a throttled mobile profile and with a 200% browser zoom. Keyboard focus must remain visible and dialogs must stay inside the viewport.

Проверьте загрузку, возобновление resumable-загрузки, range download, безопасный preview и удаление при ширине 320, 390, 768, 1024 и 1440 CSS-пикселей. Повторите на мобильном профиле с ограниченной сетью и при масштабе браузера 200%. Фокус клавиатуры должен быть видим, диалоги — оставаться в пределах viewport.

## 5. Evidence / Артефакты

Attach only screenshots with redacted identities, test timestamps, request IDs, and a short pass/fail summary. Production logs are read-only evidence; an HTTP 200 alone is not proof that cron, backup, Gmail, push, or attachment recovery succeeded.

Прикладывайте только скриншоты с замазанными идентификаторами, временем теста, request ID и кратким pass/fail. Production-журналы читаются без изменений; HTTP 200 сам по себе не подтверждает успешность cron, backup, Gmail, push или восстановления вложений.
