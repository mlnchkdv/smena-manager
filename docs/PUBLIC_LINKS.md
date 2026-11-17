# Публичные ссылки / Public links

## Использование

- **Файлы:** меню карточки или окно просмотра → «Публичная ссылка».
- **Папки файлов:** меню папки → «Публичная ссылка».
- **Заметки:** действия заметки → «Публичная ссылка».
- **Папки заметок:** меню папки в дереве или карточке → «Публичная ссылка».

Выберите срок: 1, 7, 30, 90 дней или без срока. По умолчанию — 7 дней. Нажмите «Создать публичную ссылку», затем скопируйте адрес. До создания ссылки материал остаётся приватным.

Ссылку может создать администратор или участник с правом редактирования материала. Гостевой доступ не разрешает публикацию. В диалоге отображаются собственные ссылки пользователя; администратору доступны все ссылки на выбранный материал. Кнопка «Отозвать доступ» немедленно закрывает ссылку для новых запросов. Скопированный получателем текст или уже скачанный файл удалить у него невозможно.

**Папка публикуется вместе с вложенными папками и их текущим содержимым. Добавленные позднее материалы также будут доступны по её ссылке.** Перемещение объекта за пределы опубликованной папки закрывает к нему доступ через эту ссылку.

Для заметки публикуется только текущий текст: история версий, вложения, соседние и связанные приватные материалы автоматически не открываются. Изображения из Markdown не загружаются на публичной странице. Если нужно поделиться вложением, создайте отдельную ссылку на файл. При смене проекта прямая ссылка на файл перестаёт работать; внутри проекта она сохраняется при перемещении файла между папками.

Удаление/архивация материала, отключение его владельца или утрата владельцем права редактирования закрывают публичный доступ. Ссылки ограничены исходным рабочим пространством и для файлов — исходным проектом.

## Anonymous and AI access

No Google sign-in, browser session or MCP token is needed to follow a public link. Anyone who possesses it can read the explicitly shared material. These are bearer capability URLs: share them only with intended recipients.

- Files: the URL returns the original bytes without buffering the whole file in the application server. `HEAD` and HTTP byte ranges are supported for large files and video.
- Notes: the default response is server-rendered, sanitized HTML without a JavaScript/login requirement. Append `&format=markdown` to a copied URL for plain Markdown, or `&format=json` for `{id,title,content_markdown}`. Large HTML previews show the first 256 Ki characters and link to the complete source.
- Folders: HTML lists only items inside the shared subtree. Append `&format=json` for up to 50 items and `nextOffset`. Continue with `&offset=<nextOffset>`. Item URLs are relative to the same origin and inherit the folder capability; they do not grant access outside the subtree. `folder=<childId>` navigates within that subtree.
- Language: `lang=ru` or `lang=en` controls the public page. Both languages support mobile layouts.

Public responses use `Cache-Control: no-store`, a restrictive CSP, `Referrer-Policy: no-referrer`, noindex/nofollow, and anonymous CORS for GET/HEAD. Noindex reduces search indexing; it is **not** authentication and does not prohibit an AI client from fetching a link. A per-client rate limit of 240 requests per minute returns HTTP 429 and Retry-After.

## Operations

Management endpoints require an ordinary authenticated workspace session:

- `GET /api/public-links?kind=<kind>&targetId=<id>[&projectId=<id>]`
- `POST /api/public-links` with `{kind,targetId,projectId,expiresInDays,locale}`
- `DELETE /api/public-links/<linkId>` (creator or administrator)

Kinds: `file`, `file-folder`, `note`, `note-folder`. Anonymous routes live under `/api/public/`. The managed VPS Nginx configuration gives that prefix a dedicated proxy snippet: it preserves the API's strict CSP/sandbox and no-referrer policy and disables access logging for capability URLs. The standard updater installs these snippets, validates Nginx and reloads it as part of release activation. The static `public-share.css` is included in the normal Vite production output.

The private `smena-manager-public-links.json` registry is separate from workspace content and portable backups. Local mode writes it with owner-only permissions; Google Drive uses private JSON storage and conditional writes. Content restore cannot reinstate a revoked capability. The registry stores random identifiers and owner metadata, not the full signed URL. Authorized management requests reconstruct URLs with HMAC-SHA256.

`SESSION_SECRET` must be stable and at least 32 characters (already required by production). Optionally set a separate `PUBLIC_LINK_SECRET` of at least 32 characters. Rotating the applicable secret invalidates every existing public URL; changing only SESSION_SECRET does not invalidate public links when PUBLIC_LINK_SECRET is set. Set `SMENA_PUBLIC_LINKS_ENABLED=false` to disable public links server-wide. These variables contain secrets and must never be committed with real values.

Default quotas are 100 active links per member per workspace and 2000 globally. Revoked and expired entries are pruned when a new link is created; their random identifiers are never reused. A single Node service process serializes registry mutations; Drive ETags also protect updates. Include this private registry in encrypted operational server/storage backups, and restrict access logs that contain capability URLs.

No team material is published by the migration. Publication always requires the explicit create action on a selected object.
