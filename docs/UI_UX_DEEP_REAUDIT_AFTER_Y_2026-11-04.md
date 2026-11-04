# UI/UX re-audit after Y01–Y11 / Повторный аудит после Y01–Y11

**Inspection / Проверка:** 3–4 November 2026, production `https://smena-manager.vercel.app/`. **Observed baseline:** `8216a9d9685f5d28c687224d634420fc49b8ad09`, documentation on application `5559b3d`. **Status / Статус:** Z01–Z08 are proposed, not implemented / предложены, ещё не внедрены.

**RU:** Следующий пакет состоит из двух воспроизводимых ошибок и шести UX-улучшений. Основная проблема теперь — отдельные сценарии и короткие экраны, а не необходимость заново переделывать все разделы. Ранее внедрённые Y01–Y11 остаются выполненными. В проверенных сценариях не обнаружена новая блокирующая ошибка уровня P0/P1; это не заключение о безопасности, сохранении всех сущностей или полной функциональной исправности.

**EN:** The next package contains two reproduced defects and six UX improvements. Remaining friction is concentrated in particular workflows and short screens; the evidence does not justify another wholesale redesign. Y01–Y11 remain delivered. No new P0/P1 blocker was observed in the inspected scenarios. This is not a security certification or full write/persistence acceptance.

## Scope and evidence / Охват и доказательства

- Production was inspected through the authorized UI. Eighteen main navigation routes were opened in RU/EN at laptop and mobile sizes, plus Favorites, full Search, all eighteen settings sections, project views and selected detail/editor surfaces. / Проверены основные маршруты, дополнительные разделы и вложенные сценарии.
- Seven observed CSS viewports: **320×567, 390×844, 767×900, 844×390, 1024×767, 1366×767, 1920×1080**. Coverage is selective: this is not every action in every section at every size. / Размерная матрица выборочная.
- **198 recorded observations: 180 without the scanner's loading flag, 18 loading observations excluded from ready-layout conclusions.** No ready observation showed root horizontal overflow. Internal scrolling, modal geometry, focus and useful content height were examined separately. A page can have zero root overflow and still be unusable, as Z01 demonstrates.
- DOM/AX inspection and measured geometry supplied most evidence. Two screenshots were captured successfully; other screenshot attempts failed and are not counted as visual acceptance. Do not describe this as a complete screenshot or pixel comparison.
- The browser stalled during the final batch. Saved observations through the RU 1920 pass remained available; the remaining EN 767 pass and selected follow-ups completed on 4 November after the browser responded again. The uncompleted attempt itself is not a successful test.
- Source review supplemented observations, particularly settings layout/focus, editor controls, whiteboard modes, activity reset and data-transfer layout.

| CSS viewport | RU ready observations | EN ready observations |
| ------------ | --------------------: | --------------------: |
| 320×567      |                     6 |                     6 |
| 390×844      |                    42 |                    38 |
| 767×900      |                     6 |                     5 |
| 844×390      |                     6 |                     4 |
| 1024×767     |                     4 |                     6 |
| 1366×767     |                    23 |                    22 |
| 1920×1080    |                     6 |                     6 |

Counts are repeated UI observations, not independent test cases or guarantees of task completion. / Это число наблюдений, а не независимых тестов.

Local, uncommitted evidence is in `output/audit-after-y-2026-11-03/`: `matrix.json`, named AX snapshots, `ru844-settings-search-many.png`, `ru1366-inbox.png`. It contains workspace UI information and must not be committed as a public fixture. Numeric detail measurements described below were also observed directly during the audit. / Локальные материалы проверки не публикуются в Git.

## Next package / Следующий пакет

P2 = ordinary defect or material usability problem; P3 = planned simplification. A proposal is not labelled a malfunction. / P2 — ошибка или существенное неудобство; P3 — улучшение. Предложения не выдаются за поломки.

| ID  | Priority / Приоритет | Evidence class / Основание                          | Change / Правка                                                                                                                        |
| --- | -------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Z01 | P2                   | Reproduced defect / Воспроизведённая ошибка         | Keep settings usable when search returns many sections on a short screen. / Исправить компоновку поиска настроек на коротком экране.   |
| Z02 | P2                   | Reproduced defect / Воспроизведённая ошибка         | Return focus to settings search after Clear. / Возвращать фокус в поиск после очистки.                                                 |
| Z03 | P3                   | Measured UX proposal / Замеры + UX-предложение      | Simplify the mobile note-editor toolbar and consolidate save status. / Упростить мобильную панель редактора заметки.                   |
| Z04 | P3                   | Measured UX proposal / Замеры + UX-предложение      | Give folder search more width; disclose auxiliary tree commands. / Освободить место поиску папок.                                      |
| Z05 | P2                   | Measured UX proposal / Замеры + UX-предложение      | Add a short-screen Files composition with earlier access to files. / Адаптировать панели файлов к небольшой высоте экрана.             |
| Z06 | P3                   | UI/source-supported proposal / Интерфейс + код      | Make whiteboard Canvas/Outline mode unambiguous and consistent with Graph. / Сделать переключение холста и списка понятнее.            |
| Z07 | P3                   | UI/source-supported wording issue / Интерфейс + код | Rename activity Reset view to Reset filters, preserving grouping. / Уточнить название сброса фильтров активности.                      |
| Z08 | P3                   | UI/source-supported proposal / Интерфейс + код      | Separate everyday backup controls from occasional migration/recovery operations. / Упростить раздел переноса данных и резервных копий. |

### Z01 — Settings search on short screens / Поиск настроек на коротком экране

**RU:** При 844×390 запрос `а` на русском и `a` на английском даёт много результатов. Контейнер настроек имеет высоту около **344 px**, навигация с результатами — **402.6 px**. `.set-body` сжимается до **0 px** и начинается за нижней границей экрана. При 390×844 та же навигация занимает около 403 px, оставляя телу примерно 389 px. Корневого горизонтального переполнения нет. Скриншот короткого экрана подтверждает, что видны фактически только результаты.

**EN:** At 844×390, broad RU/EN queries make the settings navigation approximately 402.6 px high inside a 344 px container. The settings body collapses to zero height below the viewport. At 390×844 the body remains usable but is heavily squeezed.

**Implementation / Решение:** Bound results by the available height, or use an explicit search-results mode with a reachable return action. Keep Clear and result selection reachable. Do not solve this by reducing text or touch targets. Preserve authorized-section filtering and result-to-heading focus already delivered in Y09. / Ограничить высоту выдачи либо выделить ей самостоятельное состояние с понятным возвратом.

**Acceptance / Приёмка:** RU/EN, 320 portrait and 844 landscape; empty query, broad query, one result, no results; result selection restores usable section content. Test virtual-keyboard occlusion separately on real devices. Relevant sources: `src/styles/pages/settings.css`, `src/styles/workspace.css`, `src/styles/container-layout.css`, `src/ui/settings-search.js`.

### Z02 — Clear must preserve input context / Очистка без потери фокуса

**RU:** После активации «Очистить поиск» в настройках клавиатурой фокус оказывается на `BODY`, потому что кнопка исчезает при перерисовке. Воспроизведено на RU mobile и EN desktop. Для сравнения, очистка полного поиска возвращает фокус в `search-page-q` корректно. Переход из результата настроек к заголовку также работает — его переделывать не требуется.

**EN:** Keyboard activation of settings Clear search removes the focused button and leaves focus on `BODY`. Full Search already returns focus to its input and provides a useful existing pattern.

**Implementation / Решение:** In `src/ui/settings-search.js`, restore the visible search input after clearing, without changing section or scroll context. Keep native search clearing consistent where supported. / Вернуть фокус в действующее поле поиска после перерисовки.

**Acceptance / Приёмка:** On RU/EN desktop/mobile, activate Clear with keyboard, then type immediately without pressing Tab. Confirm empty-result and one-result states and that the page does not jump.

### Z03 — Mobile note editor / Мобильный редактор заметки

**RU:** На 390×844 в обоих языках `.knowledge-editor-mode` занимает около **100.6 px**, заголовок редактора — ещё **49.2 px**. Поле текста начинается примерно на y=300 и имеет высоту 300 px. Это не ошибка сохранения: редактор прокручивается и все функции доступны. Но переключатели режима, статус и вспомогательные команды конкурируют с текстом; состояние «Сохранено» присутствует в двух местах внутри редактора.

**EN:** The mobile mode/tool area is about 100.6 px high in both languages, before the text field. The editor works, but its controls and repeated save indication consume writing space.

**Implementation / Решение:** Retain clear Editor/Blocks/Read choices. Group secondary outline/wrap/focus commands in one coherent menu and keep formatting contextual. Present one authoritative editor save status, while retaining access to application synchronization status. / Сократить визуальный шум, не удаляя режимы или команды.

**Acceptance / Приёмка:** RU/EN at 320/390/767, long title and Markdown; at least one comfortable tool row and usable text area, no hidden active state, 44 px touch targets where appropriate, focus/selection retained. Real keyboard and unsaved-text acceptance require separate authorized fixtures. Sources: `src/styles/knowledge-controls.css`, note-editor rendering and save-status components.

### Z04 — Folder-search priority / Приоритет поиска папок

**RU:** В мобильном навигаторе на 320 px поле «Фильтр папок» получает около **144 px**, поскольку делит строку с раскрытием, сворачиванием и справкой. Эти команды доступны и работают; при большом количестве папок основной поиск заслуживает больше места. Текущий путь, недавние папки, поиск по полному пути, ограничение окна строк и сохранение прокрутки уже реализованы.

**EN:** At 320 px the folder-filter field is approximately 144 px wide alongside auxiliary controls. This is a search-priority improvement, not a missing folder-navigation feature.

**Implementation / Решение:** Give search most of the row or a full row; move Expand all, Collapse all and count help into a labelled auxiliary menu. Preserve the current path and direct folder selection. / Дополнительные команды дерева убрать из основной строки поиска.

**Acceptance / Приёмка:** RU/EN, 320/390, deep paths and a large isolated folder fixture; query remains visible through selection/reopening, auxiliary actions remain keyboard-accessible, no extra nested scrolling surface. Source: `src/styles/knowledge-folder-shortcuts.css` and folder navigator.

### Z05 — Files on short screens / Файлы на коротком экране

**RU:** На 844×390 блок папок начинается примерно на y=301–323, карточки имеют высоту около 94 px, а сами файлы оказываются ниже первого экрана. В 320×567 первая карточка файла в наблюдавшемся состоянии начиналась примерно на y=362–428. Значения зависят от состояния счётчиков/панелей, это не фиксированная высота. Уже есть скрытие папок, переход к файлам и компактные папки; новые дублирующие кнопки не нужны.

**EN:** Header, filters and folders can consume the first short landscape viewport. Existing collapse, jump-to-files and compact-folder controls should be reused rather than duplicated.

**Implementation / Решение:** Use height-aware composition: compact header, secondary upload destination/actions disclosed together, restrained folder summary and earlier file access. Keep active folder/filter context explicit and honour personal view preferences. Do not globally shrink mobile inputs. / Адаптировать расположение элементов по высоте, сохранив существующие действия и настройки пользователя.

**Acceptance / Приёмка:** RU/EN at 844×390 and 320×567; with and without folders/active filters, ready counts and updating counts, selection and in-progress export. Compare the first useful file position before/after; preserve full paths, selection, ACL-sensitive actions and scrolling to files. Sources: Files page and responsive Files styles.

### Z06 — Whiteboard mode clarity / Понятный режим холста

**RU:** На мобильном экране один переключатель имеет название «Список или холст», `aria-pressed` и иконку. Он работает, но смешивает название текущего режима и действия перехода. У графа уже есть явный выбор «Граф / Список». Рабочая область холста на 390×844 занимает около **524 px** по высоте — это удачную часть менять не нужно.

**EN:** The working mobile Outline or canvas toggle can state its current mode more clearly and follow the Graph mode pattern. Canvas height is already good.

**Implementation / Решение:** Use a concise current-mode indicator with an explicit change action, or a compact two-way selector where space permits. Keep mode names and accessibility semantics consistent; do not add another permanent toolbar row. / Явно показывать выбранный режим без увеличения высоты панели.

**Acceptance / Приёмка:** RU/EN, 320/390/844; both modes, keyboard and touch targets, return to selected card, camera and selection preserved. No new board data writes. Source: `src/views/project-whiteboard.js`.

### Z07 — Activity reset wording / Название сброса активности

**RU:** «Сбросить вид» очищает фильтры, но оставляет включённую группировку похожих событий. Это соответствует отдельной личной настройке группировки и не является потерей данных. Однако надпись обещает более широкий сброс. Сохранение группировки после сброса проверено в RU; общий обработчик и английская надпись проверены в коде.

**EN:** Reset view resets collection filters while leaving the independent grouping preference enabled. Rename it to Reset filters rather than unexpectedly resetting the shared Home/Activity grouping preference.

**Acceptance / Приёмка:** RU/EN wording; active query/project/actor/period reset, grouping unchanged, all source events retained. Do not erase other personal layout preferences. Source: `src/pages/activity.js`, `src/ui/activity-feed.js`.

### Z08 — Data operations hierarchy / Иерархия операций с данными

**RU:** Резервные копии, независимый экспорт для восстановления, перенос KMS Brain и состав данных идут отдельными постоянно раскрытыми блоками. На мобильной странице наблюдались высоты около 243, 158, 210 и 223 px соответственно, помимо верхней сводки. Три разных назначения экспорта требуют чтения длинной страницы. Никакие копии, импорты или восстановления в этом аудите не запускались.

**EN:** Everyday backups, independent recovery export, KMS migration and included-data details are all expanded. Their different scopes should be easier to distinguish without reading the whole mobile page.

**Implementation / Решение:** Keep backup status/list and primary actions prominent. Group occasional migration and recovery under clear disclosures with short scope summaries. Keep the recovery attachment limit and confidentiality guidance visible at the point of action; retain restore safeguards. / Редкие операции раскрывать по запросу, а назначение и ограничения объяснять до запуска.

**Acceptance / Приёмка:** RU/EN mobile/desktop, all operations still discoverable, focus/expanded state stable, no change to backup API, permissions, payloads or confirmation flow. Source: `src/pages/settings.js`, settings styles.

## Section-by-section assessment / Оценка по разделам

“No new mandatory change” means none was established in this pass, not that every scenario has been certified. / «Новых обязательных правок не выявлено» относится только к проверенному охвату.

| Section / Раздел                                         | Observed result and next action / Результат и дальнейшее действие                                                                                                                                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Navigation and workspace menu / Навигация и пространства | Main/bottom navigation and the read-only workspace-create form remain usable on mobile. Do not add another persistent command row. Member-role creation/persistence was not retested. / Создание без отправки; права не менялись.                            |
| Home / Главная                                           | Empty personal work, deadlines, projects and activity were inspected in both languages. Existing empty-state composition remains; no new mandatory change established.                                                                                       |
| Inbox / Входящие                                         | Search, category picker, history disclosures and preview state fit the laptop/mobile layouts. Notifications were not opened or marked read. Existing preview hiding remains available; no duplicate feature requested.                                       |
| My tasks / Мои задачи                                    | Both languages/mobile/laptop inspected; no new layout blocker established. Task edits were not performed.                                                                                                                                                    |
| Notifications / Уведомления                              | Existing event/channel overview and administrator disclosures remain. No delivery or permission-prompt tests in this audit.                                                                                                                                  |
| Overview / Обзор                                         | Portfolio, workload and milestones inspected; the previous portfolio/avatar fixes are not re-listed as missing. No new mandatory change established.                                                                                                         |
| Projects / Проекты                                       | Cards, status/metadata and card navigation inspected across sizes. Existing Grid/List/Table remains. / Открытие по карточке работает в проверенном переходе.                                                                                                 |
| Project views / Представления проекта                    | All eight views opened in RU/EN on laptop; mobile view picker switched Board→List and opened a task. Overview connections and project Files had loading observations excluded from ready acceptance.                                                         |
| Tasks / Задачи                                           | Board/list layout and a mobile task dialog inspected without edits. Internal horizontal board/table scrolling is intentional, not root overflow.                                                                                                             |
| Calendar / Календарь                                     | RU/EN and selected short-screen layout inspected. No new blocker established; dates/events were not changed.                                                                                                                                                 |
| Timeline / Хронология                                    | RU/EN layouts inspected. Existing nearest-event explanation/date-group work remains delivered. Milestone writes and filter correctness across a new fixture were not retested.                                                                               |
| Files / Файлы                                            | Catalog/folder/card layouts inspected across sizes; useful card/path width retained. Next change Z05. No uploads, renames, downloads or ACL changes.                                                                                                         |
| Knowledge / База знаний                                  | Both folder layouts, note cards, reader and source editor inspected without text edits. At 320 px inline note cards use full available width (~278 px), not cramped two-column notes. Next changes Z03–Z04.                                                  |
| Bookmarks / Закладки                                     | RU/EN cards, search/filter surfaces inspected. No new mandatory layout change established; URLs/content not edited.                                                                                                                                          |
| Whiteboards / Холсты                                     | Catalog cards, mobile canvas and outline inspected. Card favorite actions remain outside the miniature artwork. Next change Z06; canvas size is already useful.                                                                                              |
| Graph / Граф                                             | RU/EN and seven size samples inspected, with loading states excluded. Simplification, cluster-label options and list alternative already exist. This pass did not repeat a physics drag/FPS benchmark or change graph data. No new graph defect established. |
| Members / Участники                                      | RU/EN listing, mobile profile and team detail inspected. Team had six members and three projects; the historical missing membership/project issue was not reproduced by viewing. No role edits.                                                              |
| Activity / Активность                                    | RU/EN feed and date/filter UI inspected. Grouping was enabled temporarily, reset behaviour checked and grouping returned off. Next change Z07.                                                                                                               |
| Archive / Архив                                          | RU/EN layout and categories inspected. No restore, purge or delete actions. No new mandatory layout change established.                                                                                                                                      |
| Settings / Настройки                                     | All eighteen sections opened at 390 px in both languages, plus desktop/selected sizes. Next changes Z01–Z02 and Z08. Existing authorized search/result heading focus must be preserved.                                                                      |
| Favorites / Избранное                                    | RU desktop ready state inspected; EN mobile observed a favorite-files loading state, which is not accepted as fully ready. No favorite membership changed.                                                                                                   |
| Full Search / Полный поиск                               | RU laptop/mobile and EN mobile query/result surfaces inspected. Search clearly distinguishes an unchecked file catalog and offers its existing catalog handoff. Clear restores focus to the input correctly.                                                 |

## Implementation order and guardrails / Порядок внедрения и ограничения

1. **Z01–Z02:** correct settings geometry and focus before adding new features. / Сначала исправить ошибки.
2. **Z03–Z05:** improve writing/search space and short-screen file access with existing actions. / Затем освободить полезное пространство.
3. **Z06–Z08:** clarify modes, wording and occasional data workflows. / После — согласованность и понятность.

For each logical change: commit and push separately; check affected RU/EN workflows and representative portrait/landscape sizes. Test actual outcomes, not just root width. Keep project/workspace ACLs, data model and cloud synchronization semantics unchanged unless a separately evidenced functional change requires otherwise. Use isolated fixtures for content edits and large datasets. / После каждой логической правки — отдельный commit/push и проверка затронутых сценариев.

Do not introduce a global reduction of every control. Compact pointer layouts and mobile touch layouts need different treatment. Preserve essential actions, visible active state, readable text, keyboard focus, semantic names and recovery safeguards. Reuse existing menus, preferences and tokens before adding new ones.

## Limits and cleanup / Границы проверки и возврат настроек

**RU:** Материалы команды, роли, участники, файлы, заметки, связи, непрочитанные уведомления и копии не изменялись. Были временно переключены язык и личные представления; возвращены русский, раздельный блок папок, «Все заметки», пустой поиск и выключенная группировка. Холст возвращён к canvas. Перед завершением интерфейс показывал «Сохранено». Временная вкладка закрыта, исходная вкладка пользователя не закрывалась; override размера сброшен.

**EN:** Team content, access rights, unread notifications and backups were not edited. Temporary language/display preferences were restored, Saved was observed, the viewport override was reset and the audit tab was closed while the user's original tab remained.

Not covered / Не проверено в этом проходе:

- Real iOS/Android devices, virtual-keyboard occlusion, screen lock/resume, actual touch/pinch and platform downloads.
- Screen-reader acceptance, forced-colour/reduced-motion/200% text-zoom matrix, every theme and every personalized sidebar configuration.
- Production writes, conflict/persistence/versions/restoration, actual Gmail/push delivery, role-isolation mutation tests and large-production-data performance.
- Pixel-perfect screenshot acceptance for every route. Screenshot capture was unreliable; DOM/AX/geometry evidence must not be advertised as complete visual verification.

These remain separate validation work, not newly discovered application bugs. This turn changes documentation only; application tests/build from Y delivery were not rerun or represented as fresh audit tests.
