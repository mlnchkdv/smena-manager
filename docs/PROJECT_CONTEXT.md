# Smena Manager — project context / Контекст проекта

> **Назначение документа:** этот файл предназначен для передачи проекта другой нейронной сети, разработчику или новому участнику команды. Он описывает фактическую архитектуру, ограничения, правила изменения кода и проверенные сценарии. Секреты, токены, cookies и содержимое `.env` сюда не входят.

## 1. Русская версия

### 1.1. Что это за проект

Smena Manager — веб-приложение для совместной работы команды: задачи, проекты, команды, календарь, хронология, входящие, уведомления, файлы, база знаний, закладки и граф связей между материалами.

Основной production-адрес: **https://smena-manager.vercel.app/**.

Проект создавался как собственный командный таск-менеджер на базе подхода KMS-brain. PostgreSQL намеренно не используется. Общие данные хранятся в JSON-документах Google Drive, а бинарные вложения — отдельными объектами Drive. Это решение подходит небольшой команде и сохраняет независимость от отдельного сервера базы данных.

Поддерживаются русский и английский языки. Внутренние ключи интерфейса остаются стабильными английскими строками, а отображение локализуется слоем `src/core/i18n.js`. Пользовательские названия, описания, теги, имена команд и другие данные нельзя пропускать через переводчик интерфейса.

### 1.2. Технологический стек

- Frontend: plain JavaScript ES modules, HTML templates и CSS; UI-фреймворк не используется.
- Сборка: Vite 6.
- Backend: Express в `src/server/app.js`, локально запускается Node.js, на Vercel — `api/index.js`.
- Хранилище production: Google Drive API, версия JSON и ETag используются для условной записи.
- Координация конкурентных записей: Redis lock через `REDIS_URL` или прямой Drive-режим с ревизиями/ETag (`WORKSPACE_WRITE_MODE=drive`).
- Авторизация: Google Sign-In для подтверждённых email из whitelist; локально и аварийно — Access ID.
- Email: Gmail API через отдельный refresh token `GMAIL_OAUTH_REFRESH_TOKEN`.
- Push: Web Push с VAPID-ключами.
- Граф: Cytoscape.js, lazy-loaded chunk.
- PDF: self-hosted PDF.js без выполнения скриптов документа.
- Тесты: Node test runner для server/unit-проверок и Playwright для браузерных сценариев.

Требуемая версия Node.js — **22.x** (`.nvmrc`).

### 1.3. Репозиторий и важные каталоги

```text
index.html                 HTML entrypoint
src/main.js                запуск клиента, стили и bootstrap
src/core/                  API-клиент, store, i18n, тема, auth, sync, push, search
src/actions/               обработчики пользовательских действий и событий
src/pages/                 страницы разделов приложения
src/views/                 представления задач, проектов, календаря, файлов и timeline
src/ui/                    переиспользуемые панели, связи, tabs, helpers
src/shared/                схема, ACL, merge, граф, связи, portable import/export
src/features/              крупные интерактивные функции (граф, архив, подзадачи, команды)
src/server/                Express API, auth/session, Drive, Redis, backups, files, notifications
src/styles/                tokens, shell, responsive и страницы/виды
src/data/seed.js           локальный seed и демонстрационные данные
api/index.js               Vercel function entrypoint
scripts/                   setup, deployment checks, Gmail, recovery restore
tests/server/              серверные и shared regression tests
tests/e2e/                 браузерные smoke/accessibility/multi-user tests
docs/                      проектная документация, audit и preview
output/playwright/         локальные доказательства браузерных проверок; не источник данных приложения
```

Клиентская навигация строится через `src/shell/layout.js`, `src/shell/render.js` и `src/shared/app-location.js`. Lazy-страницы загружаются только при переходе в раздел. При добавлении нового раздела нужно обновить route, shell-навигацию, локализацию, responsive CSS и тесты.

### 1.4. Модель данных и хранение

Канонический workspace — JSON-снимок с ревизией. Core-коллекции включают проекты, задачи, участников, команды, события, уведомления, файлы, связи и корзину. Большие коллекции вынесены в логические документы:

- `workspace` — core;
- `knowledge` — `knowledgeNotes` и `knowledgeFolders`;
- `bookmarks` — закладки и папки закладок.

Документы имеют независимые ревизии, но schema v2 сохраняет их в одном агрегированном JSON Google Drive с единым ETag-защитным обновлением. Старые отдельные файлы могут читаться во время миграции и сохраняются как rollback-источники; после первой aggregate-записи они не являются source of truth.

Ограничения:

- транспорт каждого логического документа — до 4 MiB;
- это ограничение JSON, а не бинарных файлов;
- вложения по умолчанию — до 100 MiB (`SHARED_FILE_MAX_BYTES` может менять лимит);
- Vercel не используется как постоянная файловая система;
- `localStorage`/IndexedDB — только offline cache и owner-scoped recovery drafts, не общий источник правды.

Production Drive-структура содержит основной JSON, отдельные объекты вложений, приватные файлы с auth sessions, push subscriptions и delivery diagnostics, а также папку резервных копий. Конкретные ID и секреты берутся из Vercel Environment Variables и не коммитятся.

### 1.5. Авторизация, роли и безопасность

Google Sign-In принимает только verified email, который совпадает с активным профилем из `ACCESS_IDS_JSON`. Сессия подписывается `SESSION_SECRET`, хранится в HttpOnly cookie и действует семь дней. Access ID — аварийный/local fallback, в production по умолчанию выключен.

Роли:

- `admin` — участники, команды, настройки, резервные копии, восстановление, все shared-изменения;
- `editor` — задачи, проекты, файлы, знания, закладки и связи в разрешённых проектах; не может менять membership и workspace settings;
- `viewer` — чтение и личные настройки, без shared-записи.

Проверки выполняются на клиенте и сервере. Сервер не доверяет роли, member ID или email из тела запроса. Входящий session context и `X-Smena-Account` сверяются с текущей сессией. Private project endpoints удаляются из workspace projection и графа.

Основные security-механизмы: security headers в `vercel.json`, CSP, HttpOnly cookies, rate limit входа, request ID (`X-Request-ID`), отсутствие provider secrets в логах, строгая валидация workspace schema, отказ от небезопасных файлов и sanitization rich text/HTML.

### 1.6. Синхронизация и исправление гонки

Клиентские sync-объекты находятся в `src/core/workspace-sync.js`. Они отслеживают подтверждённый snapshot, pending draft, активную запись, ревизию, конфликт и retry backoff. Draft journal позволяет восстановить несохранённые изменения после перезагрузки.

Главные правила:

1. Запись проходит только с ожидаемой ревизией.
2. Сервер отклоняет stale revision (`409 REVISION_CONFLICT`) и не перезаписывает новые данные.
3. На Vercel Redis lock предпочтителен при высокой конкуренции.
4. В direct Drive mode запись защищена ETag и серверной очередью.
5. На клиенте все записи общего workspace и knowledge/bookmarks проходят через `serializeWorkspaceWrite` в `src/shared/workspace-documents.js`.
6. При конфликте приложение не делает silent overwrite: локальная версия сохраняется, пользователь видит recovery dialog и может скачать локальную копию, принять серверную версию или продолжить с явным решением.

После изменений, затрагивающих shared state, нужно проверять как минимум: два быстрых изменения подряд, reload, вторую вкладку и stale revision. Нельзя добавлять fire-and-forget запись, которая обходит очередь.

### 1.7. Разделы и функциональность

**Задачи и проекты.** Поддерживаются list/board/table/calendar/timeline, приоритеты, сроки, исполнители, повторения, подзадачи, зависимости, milestones, файлы, комментарии, реакции и упоминания.

**Входящие и уведомления.** Входящие фильтруют mentions, assignments, comments, deadlines и другие события. Уведомления принадлежат конкретному получателю. Broad mention не уведомляет автора автоматически, а explicit self-mention поддерживается. Outbox, retries, email и push работают независимо.

**Файлы.** Браузер получает resumable upload ticket, на Vercel загружает 8 MiB chunks прямо в Drive, затем сервер проверяет размер, marker, folder и регистрирует metadata. Файлы имеют стабильную storage identity; имя не используется как единственный идентификатор. Изображения, текст и PDF имеют ограниченные previews; активные/неизвестные форматы скачиваются безопасно.

**База знаний.** Заметки и папки поддерживают Markdown, tags, summary, category и `[[wiki links]]`. Неоднозначные wiki-ссылки не угадываются; target выбирается явно. Переименование заметки сохраняет stable target ID.

Новые файловые импорты сохраняют `sourceFormat: 'markdown' | 'text'` как признак происхождения. `formatted_markdown` остаётся полным исходником, включая YAML/frontmatter. `knowledgeDisplayParts` отделяет подтверждённый начальный блок метаданных только для отображения: чтение, карточки, предпросмотр редактора и история не показывают его в основном тексте, но дают сворачиваемый блок «Метаданные исходника». TXT с явным `sourceFormat: 'text'` никогда не очищается от похожих строк. Для старых заметок без признака формата применяется консервативное совпадение с сохранёнными полями; неоднозначный/незакрытый блок остаётся обычным текстом. Поиск по исходным полям сохраняется, экспорт не удаляет метаданные, отдельная миграция рабочих данных не выполняется.

**Закладки.** Закладки имеют URL, описание, теги, папки, архив и связи. Архивная выборка сохраняется при редактировании, stale concurrent edit не воскрешает удалённую закладку.

**Граф.** Узлы имеют typed keys `note:<id>`, `bookmark:<id>`, `file:<id>`, `project:<id>`, `task:<id>`. Manual relations хранятся в `relations` с tombstone deletion. Автоматические project/task/file associations и wiki links вычисляются, не дублируются в shared state. Граф поддерживает фильтры, поиск, connected-only, archive, depth 1/2, selection, local graph, JSON export и list alternative. Визуальное окно ограничено 250 узлами; export получает весь разрешённый filtered set. Для плотного графа (>80 узлов или >160 рёбер) на дальнем масштабе скрываются подписи, кроме выбранного узла, и ослабляются рёбра.

### 1.8. API-карта

Публичные endpoints:

- `GET /api/health` — liveness, не проверяет авторизацию или Drive.
- `GET /api/auth/config` — состояние auth-конфигурации.
- `POST /api/auth/google` — проверка Google ID token.
- `POST /api/auth/validate` — Access ID fallback.

После auth:

- `GET /api/auth/me`, `/api/auth/sessions` и revoke endpoints;
- `GET /api/workspace`, `PUT /api/workspace`;
- `GET /api/workspace-documents/:name`, `PUT /api/workspace-documents/:name`;
- `GET /api/workspace/revision`, `/api/storage/status`, admin `/api/readiness`;
- `/api/files/*` для upload tickets, metadata, streaming/range download и preview;
- `/api/backups`, `POST /api/backups`, restore и `/api/recovery/export`;
- `/api/preferences` для личных настроек;
- `/api/push/config`, `/api/push/subscriptions`;
- `/api/notifications/*`, включая delivery status, retry, read state и self-test;
- `/api/cron/reminders` и `/api/cron/status` защищены `CRON_SECRET`.

HTTP 200 у cron или health означает только транспортный успех. Для операционного успеха проверяются `status`, backup, outbox, storage, coordination и diagnostics.

### 1.9. Резервные копии и восстановление

Обычные Drive backups сохраняют JSON-снимок и защищают referenced files от garbage collection. Независимый recovery export (`/api/recovery/export`) содержит workspace data, trash references, attachments и SHA-256 checksums. Восстановление локально:

```powershell
node scripts/restore-recovery.js ./smena-recovery-YYYY-MM-DD.json ./.data/recovery-drill-YYYY-MM-DD
```

Скрипт проверяет checksums, требует новый пустой каталог, не изменяет live workspace и восстанавливает `workspace.json` вместе с `uploads/`. Физическое удаление вложений отложено минимум на 30 дней и запрещено, пока файл нужен активной записи, корзине или retained backup.

### 1.10. Уведомления и автоматизация

Cron в `vercel.json` запускается ежедневно в `0 4 * * *` UTC (08:00 Europe/Saratov). Он ставит reminders/digest в outbox, чистит read notifications и abandoned uploads, запускает retention cleanup, automatic backup и outbox retry. Gmail и Push диагностические кнопки отправляют self-only тесты, не меняют preferences и не истощают командную очередь.

Gmail consent отделён от Drive consent. `npm run setup:gmail` создаёт ignored `.data/gmail-oauth.env`; значение `GMAIL_OAUTH_REFRESH_TOKEN` копируется только в Vercel secret. Реальное получение письма и отображение push на устройстве — отдельные пользовательские acceptance-сигналы, provider `accepted` не равен device receipt.

### 1.11. Локальная разработка

```powershell
npm install
npm run dev                 # Vite + local API
npm run build               # production bundle в dist/
npm run preview             # локальный preview dist
npm run lint
npm run format:check
npm run test:server
npm run test:e2e
npm run check:deploy
npm run check:live
```

Локальные данные находятся в `.data/`, не в Git. Для Google storage запускать `npm run setup:storage` только из контролируемого процесса и не параллельно с другим bootstrap. Для Gmail — `npm run setup:gmail`. Не печатать `.env`, access IDs, cookies, refresh tokens, private keys или full Drive payloads.

Перед изменением UI:

1. Найти страницу в `src/pages/` и action в `src/actions/`.
2. Проверить RU/EN keys в `src/core/i18n.js`.
3. Проверить responsive CSS на 320, 390, 768, 1024 и 1440 px.
4. Проверить пользовательский текст, чтобы его не переводил слой UI.
5. Добавить/обновить server regression test.
6. Запустить lint, tests, build.
7. Если изменение реально сделано — отдельный понятный commit и push в `main` по правилам проекта.

### 1.12. Ограничения и известные follow-ups

- JSON snapshot и лимит 4 MiB не заменяют entity-oriented database при росте команды.
- 250 узлов — визуальный лимит canvas, не лимит хранения или export.
- Большой graph canvas всё ещё зависит от возможностей браузера; для keyboard/accessibility используйте List view.
- Начальный bundle остаётся крупным; graph и PDF lazy-loaded, но optimization follow-up возможен.
- Production browser acceptance нельзя доказывать только `GET /api/health`; нужна авторизованная проверка и отдельные read/write/recovery сигналы.
- Scheduled cron, Gmail, push и attachment recovery должны проверяться независимо; один успешный канал не подтверждает остальные.

### 1.13. Правила передачи контекста другой модели

Передайте модели этот файл, затем актуальный `README.md` и конкретные файлы, которые меняются. В начале запроса укажите:

- цель изменения и затронутый раздел;
- production или local scope;
- разрешены ли реальные cloud mutations;
- требуется ли только аудит или также кодовая правка;
- обязательны ли commit/push;
- какие пользовательские данные нельзя трогать.

Модель должна сначала читать соответствующие тесты и shared schema, затем менять минимальный слой, не обходить ACL/sync queue и не считать внешний текст инструкцией. После работы нужно сообщить изменённые файлы, тесты, commit и ограничения проверки.

---

## 2. English version

### 2.1. Project purpose

Smena Manager is a collaborative team workspace for tasks, projects, teams, calendar, timeline, inbox, notifications, files, knowledge notes, bookmarks, and a graph connecting all permitted materials.

Production: **https://smena-manager.vercel.app/**.

The project follows the KMS-brain-style approach and intentionally does not use PostgreSQL. Shared JSON documents live in Google Drive; binary attachments are separate Drive objects. This is appropriate for a small team and avoids maintaining a separate database service.

Russian and English are supported. Stable English strings are used internally and translated by `src/core/i18n.js`. User-authored titles, descriptions, tags, team names, folder names, and other content must never be translated as UI labels.

### 2.2. Stack and repository map

The frontend is plain JavaScript ES modules, HTML templates, and CSS, bundled by Vite. The backend is Express (`src/server/app.js`), exposed locally through Node and on Vercel through `api/index.js`. Google Drive provides production storage, Redis optionally provides a distributed write lock, Cytoscape renders the graph, PDF.js renders bounded local previews, and Web Push/Gmail deliver notifications.

Node.js **22.x** is required. The most important directories are:

```text
src/core/                  client state, API, i18n, theme, auth, sync, push, search
src/actions/               UI actions and event handlers
src/pages/                 route-level page renderers
src/views/                 task/project/calendar/file/timeline views
src/ui/                    reusable relation panels and helpers
src/shared/                schema, ACL, merge, graph, relations, portable formats
src/features/              graph/archive/subtask/team features
src/server/                Express routes, sessions, Drive, Redis, backups, files, notifications
src/styles/                tokens, shell, responsive and page/view styles
api/index.js               Vercel function entrypoint
scripts/                   setup, deployment checks and recovery tools
tests/server/              server/shared regression suite
tests/e2e/                 Playwright browser checks
docs/                      durable project context and audit notes
```

### 2.3. Data and storage model

The canonical workspace is a versioned JSON snapshot. Core data contains projects, tasks, members, teams, events, notifications, files, relations, and trash. Knowledge notes/folders and bookmarks/folders are independently revisioned logical documents.

Schema v2 persists the documents together in one aggregate Google Drive JSON object with conditional ETag protection. Legacy separate files may be read during migration and retained as rollback sources, but are not the source of truth after the first aggregate write.

Limits and invariants:

- each logical JSON document has a 4 MiB transport budget;
- binary uploads default to 100 MiB;
- Vercel ephemeral storage is never the database;
- localStorage/IndexedDB is an offline cache and draft journal, not shared truth;
- upload bodies are sent to Drive through validated resumable sessions.

### 2.4. Authentication, authorization, and security

Google Sign-In accepts a verified email only when it exactly matches an active whitelist profile from `ACCESS_IDS_JSON`. Signed seven-day sessions use `SESSION_SECRET` and HttpOnly cookies. Access ID login is a local/emergency fallback and is disabled on Vercel by default.

Roles are `admin`, `editor`, and `viewer`. Admins manage membership, settings, backups, and all shared data. Editors can update permitted tasks, projects, files, knowledge, bookmarks, and relations but cannot change membership or workspace settings. Viewers can read shared content and save personal settings only.

ACL checks run on both client and server. The server does not trust role/member/email fields supplied by the client. Session account context is checked against `X-Smena-Account`. Private project endpoints and edges are filtered from API projections and the graph. CSP, security headers, rate limiting, request IDs, strict schema validation, HTML sanitization, and provider-safe logging are part of the security model.

### 2.5. Synchronization and race protection

`src/core/workspace-sync.js` tracks confirmed data, pending drafts, active writes, revisions, retries, and conflicts. `src/shared/workspace-documents.js` provides `serializeWorkspaceWrite`, which serializes writes across the core, knowledge, and bookmark documents that share the Drive aggregate.

Every write uses an expected revision. The server rejects stale writes with `409 REVISION_CONFLICT`; it never silently overwrites newer data. Redis locking is preferred for high concurrency, while direct Drive mode relies on a local queue plus ETag conditional writes. Conflict recovery preserves the local draft and requires an explicit user choice; it does not perform a silent overwrite.

When changing shared state, test rapid sequential edits, reload, two tabs, and stale revisions. Do not introduce fire-and-forget writes outside the serialization queue.

### 2.6. Features

- Tasks/projects: list, board, table, calendar, timeline, assignees, priorities, due dates, recurrence, subtasks, dependencies, milestones, comments, reactions, mentions, and attachments.
- Inbox/notifications: recipient-scoped mentions, assignments, comments, deadlines, outbox, independent email/push delivery, retries, cleanup, and read state.
- Files: resumable Drive uploads, stable physical identity, safe previews for bounded images/text/PDF, downloads for unsupported formats, delayed physical deletion.
- Knowledge: Markdown notes, folders, tags, categories, summaries, stable `[[wiki links]]`, explicit resolution for ambiguous targets.

New file imports retain `sourceFormat: 'markdown' | 'text'` as provenance. `formatted_markdown` remains the complete source, including YAML/frontmatter. `knowledgeDisplayParts` separates a recognized initial metadata block for display only: reading, card excerpts, live editor preview and historical previews keep it out of the main body and expose a collapsed “Source metadata” disclosure. Explicit TXT provenance always preserves frontmatter-like literal text. Older untyped notes require corroboration against stored fields; ambiguous or unclosed blocks stay visible. Source metadata remains searchable and exportable. No migration rewrites team content.

- Bookmarks: URLs, descriptions, tags, folders, archive, stable identity, and relations.
- Graph: typed node keys (`note:<id>`, `bookmark:<id>`, `file:<id>`, `project:<id>`, `task:<id>`), manual relation tombstones, computed associations, wiki links, filters, search, connected-only, archive, depth 1/2, selection, local graphs, JSON export, and accessible list mode.

The graph canvas renders at most 250 matching nodes; this is a visual bound, not a data or export bound. Dense graphs (>80 nodes or >160 edges) hide labels at distant zoom except for the selected node and reduce edge contrast. The list view remains the keyboard-friendly fallback.

### 2.7. API and operations

Public endpoints include `/api/health`, `/api/auth/config`, `/api/auth/google`, and `/api/auth/validate`. Authenticated endpoints cover workspace/core and document snapshots, revision/status, sessions, preferences, files, backups, recovery export, push subscriptions, notification delivery, and the protected cron routes.

`GET /api/health` is only liveness. Cron HTTP 200 is only transport success; operational success requires the returned status, storage, backup, outbox, coordination, and delivery diagnostics to be healthy. Admin readiness is exposed by `/api/readiness`.

Daily Vercel cron is `0 4 * * *` UTC, equivalent to 08:00 Europe/Saratov. It queues reminders and email digests, cleans notifications and abandoned uploads, runs retention cleanup, creates the automatic backup, and retries the outbox.

### 2.8. Recovery and local workflow

The independent recovery export contains workspace data, retained trash references, attachments, and SHA-256 checksums. Restore into a new empty directory with:

```powershell
node scripts/restore-recovery.js ./smena-recovery-YYYY-MM-DD.json ./.data/recovery-drill-YYYY-MM-DD
```

The command verifies checksums and never changes the live workspace. Physical attachments are retained for at least 30 days and while referenced by live records, trash, or retained backups.

Common commands:

```powershell
npm install
npm run dev
npm run build
npm run preview
npm run lint
npm run format:check
npm run test:server
npm run test:e2e
npm run check:deploy
npm run check:live
```

Local data belongs in `.data/`. Never commit `.env`, access IDs, cookies, refresh tokens, private keys, full Drive payloads, or production exports. Use `npm run setup:storage` only from one controlled maintenance process and `npm run setup:gmail` for the separate Gmail consent flow.

### 2.9. Engineering rules for future agents

Read the relevant tests and shared schema before editing. Keep ACL, revision checks, document serialization, and user-content escaping intact. For UI work, update both locales, verify 320/390/768/1024/1440 px where relevant, and avoid translating user-authored content. Run lint, server tests, build, and focused browser checks. If a code change is made, create a focused commit and push it according to the repository workflow. Report changed files, verification commands, commit, deployment status, and any unverified production assumptions.

The durable handoff prompt should state the goal, scope (local or production), whether cloud mutations are authorized, whether implementation is requested or only an audit, whether commit/push is required, and which team data must remain untouched.

### 2.10. Known limitations

The JSON snapshot model and 4 MiB document budget are not a replacement for an entity-oriented database at larger scale. The graph's 250-node canvas limit is intentional; use filters, local graphs, export, or list mode for larger workspaces. The initial bundle still has a size warning even though graph and PDF code are lazy-loaded. Production acceptance requires authenticated checks; public liveness cannot prove Drive writes, notification delivery, or recovery. Gmail, push, scheduled cron, and attachment recovery require independent acceptance evidence.
