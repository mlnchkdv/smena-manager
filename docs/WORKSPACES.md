# Рабочие пространства / Workspaces

## Использование

Откройте название пространства в левом верхнем углу → **Создать пространство**. Администратор текущего пространства может указать название, описание и цвет. По умолчанию новое пространство доступно только создателю, который получает роль владельца. Флажок добавления текущих участников копирует только состав: обычные участники получают Member, гости — Guest. Данные и чужие административные права не копируются.

То же меню переключает пространства и открывает **Настройки рабочего пространства**. Название, описание и цвет сохраняются через существующую синхронизацию. Участники, команды и разрешения настраиваются в своих разделах настроек; минимум один активный администратор должен остаться. Адрес нового пространства формируется автоматически и остаётся постоянным при переименовании. Исходное пространство сохраняет прежний адрес и его прежнюю настройку.

Переключение выполняет полную навигацию с сохранением Google-сессии. Несохранённые изменения, незавершённые загрузки/экспорты, открытый черновик и ожидающая запись личных настроек блокируют переход. Вкладки могут работать с разными пространствами. На телефоне сначала откройте основную навигацию; она закрывается перед формой создания. На коротком экране прокручивается тело формы, кнопки остаются доступны.

## Хранение и права

- Исходное пространство использует namespace `default` и прежние Google Drive IDs/локальные пути. Переноса его данных в другой файл нет.
- Новые пространства получают UUID v4 и папку `workspace-<UUID>` внутри существующего Drive root. Каталог файлов, uploads, резервные копии, push-подписки и журнал доставки изолированы. Используются прежние credentials; PostgreSQL и отдельный Google Cloud-проект не нужны.
- Локальные пространства располагаются рядом с основным JSON: `workspaces/<UUID>/workspace.json`, со своими uploads/backups. Глобальные `UPLOADS_PATH`/`BACKUPS_PATH` не объединяют дочерние каталоги.
- Серверный `_workspaceDirectory` хранится в исходном root JSON. Клиентские snapshot-запросы его не меняют. Он сохраняется при импорте, восстановлении и очистке исходного пространства.
- `GET /api/workspaces` возвращает только доступные пользователю названия, адреса, цвет и роль. `POST /api/workspaces` требует администратора выбранного пространства. Лимит — 50 дочерних пространств на deployment.
- Авторизованные запросы отправляют `X-Smena-Workspace`. Нативные скачивания используют `workspace` в query и прежнюю проверку аккаунта. Несовпадающие header/query, неизвестный namespace и отсутствие членства дают отказ. Scope не используется как произвольный путь.
- Роль определяется членством в выбранном пространстве. Администратор исходного deployment не получает автоматического доступа к другим пространствам. Configured Access Profiles автоматически привязываются только к `default`. Приглашённые только в дочернее пространство участники могут использовать Google-вход; идентификатор аккаунта стабилен между членствами.
- `AsyncLocalStorage`, provider instances, очереди записи, кеши поиска/статуса и Redis lock keys изолированы. Поздние ответы предыдущего пространства отвергаются клиентом. Recovery-копии и подписанные upload tickets также имеют namespace.
- Сессии входа и отзыв устройств остаются глобальными для аккаунта. Сессия сама по себе не предоставляет доступа к пространству.

## Google Drive и автоматизация

Только подготовка нового UUID namespace временно разрешает bootstrap его метаданных на Vercel. Для исходного хранилища и обычных запросов остаётся запрет автоматического создания отсутствующих метаданных. Новый root перечитывается с ETag перед первой условной записью: отсутствие ETag в ответе create не отключает CAS. Пространство появляется в глобальном списке только после завершения подготовки.

Ежедневный cron запускает прежний pipeline для каждого пространства. На Vercel дочерние обработки получают собственные invocation/time budgets через защищённый cron endpoint. Origin берётся из системных `VERCEL_PROJECT_PRODUCTION_URL`/`VERCEL_URL`; redirects запрещены, credential не отправляется на host из пользовательского запроса. Ошибка одного пространства отражается как частичный сбой. HTTP 200 без корректного результата не считается успехом.

Ограничения: это Drive/JSON-приложение для команд с общими физическими credentials и прежними лимитами документов/каталога, а не неограниченная SaaS-платформа. Изоляцию пользователей обеспечивает серверное членство, не отдельные Google-аккаунты. При неясном сетевом результате создания сначала обновите страницу и проверьте меню перед повтором: постоянного idempotency key пока нет. Ошибка подготовки может оставить неопубликованную папку; автоматически она не удаляется.

## Usage

Open the workspace name at the top left → **Create workspace**. Administrators of the selected space can choose a name, description and color. The creator becomes owner. By default the space is private and empty; including current members copies membership only, keeping Guests read-only and granting other members the Member role. Content and other administrators' privileges are not copied.

Use the same menu to switch spaces or open **Workspace settings**. Manage members, teams and permissions in their settings sections; at least one active administrator must remain. New workspace URLs are permanent and survive renaming. The original space keeps its existing address behavior. Switching preserves Google sign-in but refuses to discard unsaved data, drafts, pending personal preferences or transfers. Tabs can select different spaces. Mobile navigation closes before the creation dialog opens, and its form body scrolls on short screens.

## Architecture and limits

The original `default` namespace retains its existing files and pinned Drive IDs. New spaces use UUID v4 folders under the same Drive root, or sibling `workspaces/<UUID>/` directories locally. Files/uploads, backups, push subscriptions and delivery logs have separate storage. Authentication sessions and device revocation remain shared at account level.

The server-private `_workspaceDirectory` publishes only provisioned spaces, survives restores/imports/resets and cannot be replaced by browser snapshots. Directory APIs list only accessible spaces. Scoped requests use `X-Smena-Workspace`; native downloads use an explicitly checked query parameter. Roles come from selected-space membership, not the original deployment. Configured profiles are injected only into `default`. Child-only Google members receive stable account identities. Async contexts, provider instances, queues, locks, search/status caches, recovery records and upload tickets preserve namespace boundaries.

Creation requires a workspace administrator and is limited to 50 child spaces. Only provisioning can bootstrap new UUID metadata on Vercel; the original missing-metadata guard stays strict. A fresh ETag is obtained before the first conditional write. Daily automation uses separate authenticated child invocations to a trusted Vercel host, refuses redirects and distinguishes execution success from HTTP success.

This remains a team Drive/JSON application, with shared underlying credentials and existing capacity budgets. It is not an unlimited multi-tenant SaaS platform. Durable creation idempotency keys and automatic cleanup of unpublished failed provisioning are not implemented. Reload and inspect the directory before retrying an ambiguous creation result.

## Проверки / Verification

Tests cover concurrent isolated mutations, identically named files/backups, membership filtering, forbidden scopes, role enforcement, child-only accounts, directory survival after restore, fresh first-write validators, pinned Drive ID isolation, upload ticket boundaries and automation dispatch.

Local browser acceptance created spaces, switched back to the original, saved name/description, reloaded, checked empty content and both member inclusion options. Creation dialogs were checked in RU/EN at 320×568, 390×844, 844×390, 1024×768 and 1366×768. Existing accessibility and core workflow checks also ran. Browser emulation does not replace native iOS/Android checks.

Production checks are limited to authenticated menus, unsubmitted forms, settings, session restoration and responsive/localized presentation. They do not create/delete team workspaces or trigger cron. Real Drive provisioning and a scheduled run for new production namespaces need separate acceptance evidence; local fixtures and mocked provider tests do not establish those outcomes.

29.10.2026: **517/517** server/shared tests, **3/3** existing Chromium accessibility/core workflows, ESLint and production build passed. Initial JavaScript: **599.6 KiB / 600 KiB**. Production RU/EN forms were opened and cancelled; the name draft survived a color change, 320/390 px layouts had no page overflow, and workspace settings exposed the new description field. The session survived reload and viewport changes. Russian was restored; production spaces and content were not created or deleted.
