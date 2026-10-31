# Knowledge tools delivery / Внедрение инструментов базы знаний

Date / Дата: 31 October 2026. Scope / Объём: requested Capacities-inspired items **1–8, 14–19**, plus project-card polish requested during implementation. Items 9–13 were outside this request.

## Русская версия

Все перечисленные ниже возможности реализованы в текущем стеке JavaScript/Vite/Express и JSON-документов Google Drive. PostgreSQL и новые внешние сервисы не добавлялись. Это интеграция подходов к работе со знаниями в существующее приложение; совместимость с любым произвольным экспортом Capacities не гарантируется.

| №   | Возможность                     | Как пользоваться                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Типы заметок и свойства         | В заметке доступны типы «Заметка», «Встреча», «Решение», «Инструкция», «Исследование». Владелец/администратор управляет дополнительными типами и полями: текст, число, дата, флаг, участник, проект.                                                                                              |
| 2   | Общие шаблоны                   | «Параметры вида → Шаблоны». Можно выбрать шаблон, проект для переменных `{{date}}`, `{{user}}`, `{{project}}`, создать независимую заметку. Общими шаблонами управляет администратор.                                                                                                             |
| 3   | Умные подборки                  | В панели папок доступны подборки с условиями по типу, тегу, свойству, дате обновления и статусу разбора. В конструкторе условия выбираются по понятным названиям; расширенное выражение остаётся доступным. Личные подборки синхронизируются с настройками пользователя, общие — с пространством. |
| 4   | Ссылки на материалы             | В редакторе введите `[[` или нажмите кнопку ссылки. Можно связать заметку с задачей, проектом, закладкой, файлом или другой заметкой, не копируя сущность.                                                                                                                                        |
| 5   | Контекст и упоминания           | В заметке раскрываются входящие/исходящие связи, фрагменты и предполагаемые несвязанные упоминания. Предложения требуют явного подтверждения.                                                                                                                                                     |
| 6   | Знания проекта и участника      | В обзоре проекта и профиле участника появился компактный блок связанных знаний, учитывающий ссылки и типизированные свойства.                                                                                                                                                                     |
| 7   | Теги и псевдонимы               | «Параметры вида → Управление тегами» переименовывает/объединяет теги заметок. Прежнее имя сохраняется как поисковый псевдоним. У заметки также можно задать альтернативные названия.                                                                                                              |
| 8   | Быстрый сбор                    | «Создать → Быстрый сбор»: текст, ссылка, файлы и изображения с выбором пространства/проекта. Материалы попадают в «На разбор», отдельно от уведомлений. Текст сохраняется до загрузки вложений, поэтому сбой загрузки его не уничтожает.                                                          |
| 14  | Блочное редактирование          | Режимы исходника, блоков и предпросмотра. Блоки можно редактировать и перемещать; `/` предлагает вставку. Исходный Markdown, разделители, код и метаданные сохраняются. TXT остаётся обычным текстом.                                                                                             |
| 15  | Ссылки на блоки и живые вставки | У блока можно создать устойчивый `^id`, скопировать ссылку, независимый текст или живую вставку `![[note:id#^block]]`. Изменения исходного блока отражаются при повторном чтении вставки.                                                                                                         |
| 16  | Веб-материалы и чтение          | В разделе закладок есть инструмент веб-сбора: bookmarklet для названия, адреса и выделенного текста. Перед сохранением открывается форма. На телефоне можно вставить данные вручную. Добавлены статусы чтения и предупреждение о повторяющемся адресе.                                            |
| 17  | Вложения и PDF                  | Изображение из «Файлов» загружается внутри заметки по явному нажатию с проверкой доступа. Относительный путь можно привязать к файлу. Из PDF можно получить текст текущей страницы и создать исследовательскую заметку со ссылкой на страницу.                                                    |
| 18  | Выбранные материалы офлайн      | «Параметры вида → Офлайн-библиотека». Сохраните нужные заметки, закладки и файлы заранее. Отдельная офлайн-страница поддерживает чтение, правку Markdown и очередь вложений; после возврата сети изменения проверяются перед применением.                                                         |
| 19  | Переносимые ZIP                 | «Параметры вида → Импорт / экспорт ZIP». Архив содержит MD/TXT, свойства, связи и разрешённые вложения по выбору. Импорт показывает предварительный результат, конфликты, сопоставление полей и проект для вложений; перед записью метаданных создаётся штатная копия.                            |

### Данные и права

- Значения свойств, псевдонимы, привязки вложений и статус разбора принадлежат заметке в документе знаний. Общие определения типов, шаблонов и подборок находятся в метаданных пространства. История сохраняет новые поля вместе с текстом.
- Прямые ссылки используют устойчивые идентификаторы, а отображаемое название может меняться. Чтение связанных материалов и загрузка вложений проходят существующие проверки доступа.
- Общими определениями управляет владелец/администратор; редактор может создавать и редактировать заметки в пределах своих прав, читатель не получает возможности записи через новые формы.
- Запись использует существующие ревизии, очередь синхронизации и recovery. Перед применением офлайн-правки сверяется исходный текст: новая серверная версия не заменяется молча.
- Кэш офлайн ограничен владельцем и пространством. При выходе локальная библиотека удаляется. Service worker кэширует только статическую офлайн-оболочку, не ответы API.
- При неопределённом результате загрузки файл нельзя автоматически отправлять повторно: очередь предлагает проверить «Файлы» и сохранить локальную копию.

### Дополнительная правка проектов

Карточка проекта открывается обычной ссылкой по нажатию на её содержимое или Enter на названии. Отдельное меню остаётся самостоятельной целью. Меню вынесено из области статуса; дата и активность разнесены по компактным строкам. Исправлено также случайное применение стиля плавающего меню к аватару «+N».

### Границы и следующие проверки

- Редактор блоков сохраняет Markdown и редактирует его фрагменты; это не полноценный rich-text/WYSIWYG-редактор.
- Подборки поддерживают до 16 условий с AND; произвольный язык запросов, группировка OR и серверный индекс пользовательских свойств не реализованы.
- Живые вставки ограничены 12 на документ, глубиной 4 и размером отображаемого фрагмента 32 000 символов. Исходный текст не обрезается.
- PDF: текст текущей страницы и ссылка на неё. OCR сканов, геометрические выделения на странице и полнотекстовая индексация всего PDF требуют отдельного этапа.
- Веб-сбор — bookmarklet и ручная форма. Магазинное расширение и автоматическое извлечение полного текста статьи не входят в реализацию.
- Офлайн: до 200 материалов / 50 МБ, один материал до 20 МБ. Это явно выбранная библиотека; вся рабочая область автоматически не скачивается.
- ZIP: до 25 МБ до/после распаковки, 5 000 записей, до 100 экспортируемых вложений. Есть проверки путей, размера, CRC и идентичности файлов. Большие архивы нужно делить.
- Поддерживается собственный архив и базовый Markdown/CSV/вложения формат внешних экспортов. Реальный пользовательский экспорт Capacities/Obsidian ещё нужно прогнать: произвольные специфические блоки и схемы CSV не считаются проверенными.
- Проверки размеров браузера не заменяют реальную iOS Safari / Android Chrome проверку офлайн-хранилища, фоновой загрузки и блокировки экрана.

## English version

All requested features use the existing JavaScript/Vite/Express and Drive JSON stack. No PostgreSQL or additional external service was introduced. The implementation adapts knowledge workflows; it does not claim perfect compatibility with every vendor export.

| Item | Delivered behavior                                                                                                                                               |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Built-in and administrator-managed custom note types with text, number, date, checkbox, member and project properties.                                           |
| 2    | Shared templates and explicit date/user/project variables; template use creates an independent note. Open View options → Templates.                              |
| 3    | Personal synced and shared smart collections; labeled condition builder plus advanced expressions for types, tags, fields, capture status and updated dates.     |
| 4    | `[[` material picker and toolbar links to existing notes, tasks, projects, bookmarks and files.                                                                  |
| 5    | Incoming/outgoing context, snippets and opt-in suggestions for unlinked mentions, with permission filtering.                                                     |
| 6    | Knowledge hubs on existing project overviews and member profiles; no duplicate project/person objects.                                                           |
| 7    | Note tag rename/merge, retained search aliases and alternative note titles.                                                                                      |
| 8    | Create → Quick capture for text, web links and project files; separate To process collection. Upload failure preserves the captured text.                        |
| 14   | Source, block and preview modes, moving/editing blocks and slash insertion while retaining raw Markdown. TXT stays plain text.                                   |
| 15   | Stable block IDs, links, independent text copies and live transclusions with source navigation and bounded rendering.                                            |
| 16   | Bookmarklet/manual web clips, explicit save review, selected text, reading states and normalized duplicate-URL warnings.                                         |
| 17   | Explicit authorized inline images, relative asset bindings, PDF current-page text and a linked research-note capture.                                            |
| 18   | Explicitly selected offline materials, raw Markdown edits and persistent file queues with conflict review after reconnection.                                    |
| 19   | Portable Markdown/TXT ZIP with metadata, connections and optional authorized attachments; import preview, duplicate handling, field mapping and a recovery copy. |

Note values live in the knowledge shard; shared definitions live in workspace metadata; personal queries use account preferences. Existing roles, server ACLs, revision checks and recovery remain authoritative. Related materials are filtered by access; viewers cannot write through the new tools. Offline records are scoped to owner/workspace and cleared on sign-out. The service worker caches the static shell, never API responses. Ambiguous uploads require review before retry.

Project cards also received a native stretched link, independent menu, readable status/date/activity layout and a fix for the overlapping member-count avatar style.

Limits: block mode is not full rich text; queries use AND with up to 16 conditions; embeds have a per-document budget; PDF capture is current-page text, not OCR or geometric annotations. The web clipper is a bookmarklet/manual form, not a store extension. Offline limits are 200 records / 50 MB, 20 MB per record. ZIP limits are 25 MB compressed/expanded, 5,000 entries and 100 exported attachments. Basic external Markdown/CSV/media import is covered by fixtures; a real user Capacities/Obsidian export and physical iOS/Android offline/background behavior remain to be verified.

## Verification / Проверки

| Check / Проверка         | Result and scope / Результат и объём                                                                                                                                                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server/shared regression | **569/569 passed**, including schema/roles, typed data, links, blocks, transclusions, queries, archive integrity/import, offline merge and existing storage/backups. Log: `output/playwright/capacities-server-final.log`.                                                                               |
| Knowledge workflow       | Extended Chromium workflow passed: properties and reload, block editing, structured queries, offline reload with the network disabled, ZIP export, Markdown ZIP plus image import, authorized file access, history/search/folders and a 3,000-note fixture. Log: `output/playwright/capacities-e2e.log`. |
| Quick capture failure    | A real intercepted upload response of HTTP 503 preserved captured text/status through reload in RU and EN. Log: `output/playwright/capture-upload-failure-e2e.log`.                                                                                                                                      |
| Project cards            | RU/EN at 320×740, 390×845, 768×1024, 844×390, 1024×768, 1366×768 and 1920×1080: overflow/collision checks, background click, menu isolation, keyboard Enter, full date and legacy placeholder translation passed. Log: `output/playwright/projects-cards-e2e.log`.                                       |
| Static checks            | ESLint, CSS token references and production build passed. Entry JavaScript **526.1 KiB**, below the unchanged 600 KiB budget.                                                                                                                                                                            |
| Public production smoke  | Six expected responses passed: public page/health/auth-config HTTP 200; anonymous workspace/revision/file-policy HTTP 401. This is transport/access-boundary evidence, not proof of every authenticated operation.                                                                                       |

After the full suite, five focused archive/material-link/offline checks passed for opaque identities containing colons. Exported Markdown links resolve to real ZIP entries, while raw content still round-trips. / После полного набора дополнительно пройдены пять проверок архива, ссылок и офлайн-правок; идентификаторы с двоеточиями не обрезаются.

**Production / Основной сайт:** authenticated UI inspection, existing-material reading, opening/cancelling the new tool forms, project-card navigation and responsive geometry. Project cards were checked at 390, approximately 768 and 1366 CSS pixels in RU, plus 320 pixels in EN. No card overflow/status-menu collision was found; the native background link opened the correct project, and the menu stayed separate. RU/EN checked; the personal language was restored to Russian. Existing team material was not edited, uploaded or deleted. Offline writes, import writes and failure injection were exercised on isolated local workspaces, not the production team space. Browser-size checks do not constitute physical-device acceptance.

**Checks not counted as passed / Что не считается пройденным:** the standalone ergonomics script could not connect to its separate layout fixture on port 5194; the deployment-config script had no production credentials in its local environment. No secrets were extracted to satisfy either check. A first focused quick-capture browser run timed out while starting its test web server during concurrent build load; its isolated rerun passed. No broad three-engine UI matrix or actual device run was completed in this delivery.

Implementation was committed and pushed per logical feature, from `bf64ccf` through the project fixes `7d71f01`, quick-capture correction `1f1aea7`, project localization `c3f7398` and opaque-ID fix `74aa5a3`. Documentation is committed separately. / Каждая логическая правка отправлена отдельным коммитом; документация оформлена отдельно.
