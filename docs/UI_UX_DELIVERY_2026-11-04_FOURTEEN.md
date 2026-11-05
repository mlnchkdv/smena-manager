# AA01–AA14 delivered / Внедрение AA01–AA14

**Package / Пакет:** 4 November 2026. **Acceptance completed / Приёмка завершена:** 5 November 2026, Europe/Saratov. **Production application verified:** `e7e60c8cce7718b5a02bdbee5c15ea722adcce97` through `/app-version.json`.

**RU:** Все 14 программных пунктов [аудита после Z01–Z08](UI_UX_DEEP_REAUDIT_AFTER_Z_2026-11-04.md) внедрены и опубликованы. Каждая логическая правка получила отдельный commit и push: 14 основных изменений и 4 корректировки приёмки. Основной сайт проверен на русском и английском, на телефонном, планшетном, коротком горизонтальном и десктопном размерах. Сохранение геометрии проверялось в изолированном локальном пространстве; рабочие материалы команды не редактировались.

**EN:** All fourteen software items are implemented and published, with a separate commit and push for each logical change: fourteen primary changes and four acceptance corrections. Production was inspected in both languages at phone, tablet, short landscape and desktop sizes. Geometry persistence used an isolated local workspace; team materials were not edited. Physical-device and production-content-write acceptance remain separate.

## Delivered behaviour / Что изменилось

| ID   | Result / Результат                                                                                                                                                                                                                                                    | Commit    |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| AA01 | Bulk file selection keeps the count, one ZIP action, More and Clear in one row. Selection scopes, streaming ZIP, Move and Trash remain in the menu with their existing guards. / Массовые действия не перекрывают каталог высокой сеткой кнопок.                      | `fb09bf9` |
| AA02 | File preview starts with the title and compact navigation; metadata and related materials are disclosed, Download remains primary and secondary actions use More. / Содержимое файла видно раньше; сведения, связи и команды доступны по запросу.                     | `0551d3a` |
| AA03 | Search tips explain quoted phrases and AND matching; result hints distinguish filename matches from metadata matches. Existing server/local matching semantics remain. / Подсказка объясняет точную фразу и поиск по названию, папке, проекту и участникам.           | `9e3193e` |
| AA04 | With no explicit desktop folder preference, screens at most 480 CSS px high start with folders collapsed. Explicit choices survive reload; mobile keeps its independent preference. / Короткий экран получает больше места для файлов без отмены личного выбора.      | `c05ff8d` |
| AA05 | Full mobile graphs retain a minimum screen footprint for nodes and icons while sparse labels remain selective. Saved cameras, positions and pins are retained. / Узлы общего графа легче различать на телефоне.                                                       | `a513199` |
| AA06 | Locate material is disclosed next to graph search rather than occupying a permanent row. It explicitly centers a node without filtering the graph. The gesture-mode button joins canvas controls. / Поиск и переход к узлу согласованы, но выполняют разные действия. | `2a49d52` |
| AA07 | Graph appearance describes full/simplified mode and physics on/off in its accessible name; pin help and connected-node drag feedback clarify behaviour. / Неоднозначная точка заменена понятным состоянием и контекстной обратной связью.                             | `9a4858b` |
| AA08 | Resize handles compensate for camera zoom; the mobile/coarse-pointer corner target is 44 screen px. Overview hides handles and offers Zoom to resize. / На малом масштабе есть явный переход к редактированию размера.                                                | `f9aa4dc` |
| AA09 | More tools offers personal Keep proportions (corners) and Alignment guides preferences. Nearby edges/centers can guide pointer resizing; aspect lock takes precedence over alignment. / Добавлены сохранение пропорций и направляющие без постоянной панели.          | `7dc1c86` |
| AA10 | The note reader keeps one folder path. Its mobile header uses one row; Note properties is available in More alongside history and download. / Быстрый просмотр компактнее, исходный текст заметки не меняется.                                                        | `ecb6dc3` |
| AA11 | Filtered note counts distinguish Found N from M in library; page ranges remain independent. / Число найденных заметок не выглядит общим размером базы.                                                                                                                | `deeb603` |
| AA12 | An empty My Tasks view has one useful entry state instead of four empty groups. Creation and Browse workspace tasks remain explicit; Home's empty state is smaller. / Пустая личная работа занимает меньше места.                                                     | `09ff3a7` |
| AA13 | Tablet members use two-column cards; project tables prioritize identity and key fields, with secondary fields in discoverable details. / На планшете меньше горизонтального перемещения, сведения и действия доступны.                                                | `db9c85b` |
| AA14 | Archive Overview replaces repeated category/count cards with recovery guidance and three recent Trash entries. Tabs remain the category navigation. / Архив и корзина различимы; восстановление и подтверждение окончательного удаления сохранены.                    | `a92f5ec` |

Acceptance corrections / Корректировки приёмки:

- `68b1d6f`: apply compact spacing to the actual empty-state component. / Уплотнение применяется к реальной разметке пустого состояния.
- `894fda8`: preserve the whiteboard camera center when responsive rendering replaces the viewport. / Выбранная карточка остаётся в области просмотра при изменении ширины окна.
- `c6c5940`: reserve extra file-search space only when Clear exists; explicitly revealing archived folders counts as a folder-view choice. / Поле поиска получает свободную ширину, ручной выбор показа папок сохраняется.
- `e7e60c8`: omit an empty reader context section after consolidating folder paths. / После удаления дублированного пути не остаётся пустой блок.

No schema migration, new service or authorization relaxation was introduced. Existing mutation, project ACL, synchronization and history paths remain in use. / Миграции схемы и ослабления прав не потребовались.

## Automated and local verification / Автоматическая и локальная проверка

- Full serial server/shared suite: **647/647 passed**, zero failed/skipped/cancelled. It includes permissions, merge/integrity, file search/index and backup paths. The full run followed the fourteen main changes; subsequent corrections affect UI composition/camera only.
- Final **ESLint**, **UI token references** and **production build** passed. Initial JavaScript: **582.7 KiB / 600 KiB**. Existing mixed static/dynamic import and chunk-size build warnings remain.
- Resize geometry tests cover aspect locking, opposite anchors, bounds and alignment candidates. Graph layout/label/hit tests and the existing physics cases pass. Existing file-index tests include 10,000 files and 2,000 folders; these are algorithm tests, not a production browser-load benchmark.
- The isolated API/Vite pair used separate `.data/ux-z-2026-11-04` fixtures, a test identity and blank cloud/Redis/Gmail/push credentials. No production Drive was used by local tests.
- Local keyboard aspect resize: **350×230 → 360×237**; Undo returned **350×230**, Redo and reload retained **360×237**. A real mouse corner drag with aspect lock off produced **320×237**. Selected mobile corner measured approximately **44×44 screen px**. At overview zoom, the handle was hidden and Zoom to resize focused the usable corner.
- After the camera correction, a selected card stayed in view through **466 → 1631 → 466 CSS px** viewport changes. Local short-height Files first collapsed without a choice; explicit expansion remained `aria-expanded=true` after reload at **675×312**.

**RU:** Локальные изменения касались только служебного стенда. Один жест использует существующую команду и одну операцию отмены; рамка не масштабирует содержимое. Направляющие временные, не становятся материалами документа. Для сохранения пропорций допускается округление до целого пикселя холста.

**EN:** Local mutations were confined to synthetic fixtures. Resizing uses the existing guarded command and one undo entry; frames do not scale their contents. Guides are transient UI. Aspect-ratio geometry rounds to whole canvas units.

## Production acceptance / Приёмка на основном сайте

The seven target **actual CSS viewports** were **320×567, 390×844, 767×900, 844×390, 1024×767, 1366×767 and 1920×1080**. Nine affected routes were inspected in both locales: Files, Graph, Whiteboards, Knowledge, My Tasks, Home, Projects, Members and Archive. This is route/layout coverage plus selective functional checks, not every operation at every size.

The saved matrix has **181 observations**. **20 version-update guard views and 3 pending graph views are excluded** from ready-layout conclusions. After the native application update, the affected RU routes were repeated at the seven target CSS sizes; EN graph was repeated after its canvas was ready. A further 21 observations record viewport-scale calibration at their actual sizes rather than pretending they matched the requested dimensions. No recorded observation had root horizontal overflow; internal scrolling and control reachability were assessed separately.

Confirmed workflows / Подтверждённые сценарии:

1. **Files selection, RU 320×567:** panel **65.24 px**, compared with **215.6 px** in the audit. Menus expose the retained actions. Selection was cleared without running ZIP, Move or Trash.
2. **File preview:** the existing TXT body loaded in RU/EN. At RU 320×567 the content box begins around **y234.92**; navigation, Download, More and Close remain available. Metadata does not occupy a permanent block. The final screenshot records loaded text, not the earlier loading message.
3. **File search:** quoted `"ТЕСТ ФАЙЛОВ — 2"` returned one of three files after query completion. Both-language tips describe exact phrases and AND matching. A numeric unquoted term can match filename dates; the search parser was not changed.
4. **Short-height folder choice:** the production account already had an explicit expanded desktop folder preference, so its landscape first-file position remains approximately **y326**. AA04 intentionally preserves that preference. Fresh-default and expansion/reload behaviour were verified locally; the audit's aspirational y≤250 target is not claimed for an account that explicitly keeps folders open.
5. **Graph:** Locate material selected `3DGS` and opened its inspector while retaining **28 materials / 18 connections** and the query. Selection was cleared. Appearance exposes physics and rendering mode, and the permanent locator row is absent. The existing stable-renderer/cluster-follow behaviour is covered by the preceding audit and focused tests; this pass is not a large live-graph stress test.
6. **Whiteboard:** new EN tools expose Keep proportions (corners), initially off, and Alignment guides, initially on. Both locales and responsive catalog layouts were inspected. Outline and Canvas were exercised and Canvas restored; no production card geometry was changed.
7. **Knowledge:** distinctive body search shows **Найдено 1 · В базе 6 / Found 1 · 6 in library**. The reader's RU 390 px header measured approximately **48.6 px** in the focused check. Its More menu retains properties, history, source download and offline reading. Queries were cleared; note source was unchanged.
8. **Tasks:** My Tasks has one empty state with creation/browse actions; populated grouping remains. Home's compact personal state was inspected separately.
9. **Tablet catalogs:** at 1024 px Members shows six cards in two columns with no table overflow. Project table identity stays anchored; three secondary columns move into details. Opening details did not navigate away. Project Grid was restored.
10. **Archive:** RU mobile Overview shows recovery guidance and three recent entries without duplicated category cards. No restore or deletion was performed.

Local evidence is intentionally uncommitted: `output/aa-delivery-2026-11-04/production-checks.json`, `local-folder-persistence.json`, `local-resize.png`, `production-files-ru.png` and `production-file-reader-ru.png`. Test/lint/build logs are under `output/`. These artifacts may contain workspace UI information and are not public test fixtures.

## Limits and cleanup / Ограничения и завершение

**RU:** Реальные iOS/Android, сенсорная отмена жеста, экранная клавиатура, скринридеры и полная матрица тем/масштабирования текста не проверены. Изменение размера с записью в Google Drive и последующим обновлением на основном сайте не выполнялось; сохранение проверено на локальном API. Не проводились нагрузочные мутации каталога, рассылки, операции копирования/восстановления, изменения ролей и проверка чужих сессий. Поэтому программные пункты завершены, а физическая и отдельная cloud-write приёмка остаются открытыми.

**EN:** Physical phones, touch cancellation, virtual keyboards, screen readers and the full theme/text-zoom matrix remain unverified. Production resize writes/reloads, cross-account sessions and large live-data mutation tests were not performed. Local persistence and existing server ACL tests do not replace those checks.

Russian, empty note/file queries, cleared file/graph selection, project Grid and whiteboard Canvas were restored. Final production synchronization state was `saved`; a fresh audit tab restored the session without a new sign-in. Temporary tabs/viewport overrides and local test services were cleaned up. The user's original tab remains open. Team files, notes, cards, access rights, delivery jobs, backups and Trash were unchanged.

## Additional reported defect: Files Details / Дополнительная ошибка окна «Детали»

**5 November 2026, published / опубликовано:** `4cf757b88e13486d910215ec208d6f0609ab32a9`, verified through the production version manifest and live UI.

**RU:** Ошибка со скриншота воспроизведена при 944×762 CSS px: кнопка «Детали» переносится к началу новой строки, но окно выравнивалось по её правому краю. Общая проверка границ экрана сдвигала окно к x=8, тогда как видимая основная область начиналась около x=252; боковое меню обрезало содержимое. Панель теперь выравнивается по левому краю кнопки, а её ширина ограничена контейнером каталога и экраном. Проверка границ экрана, прокрутка и Escape сохранены.

**EN:** At 944×762, a wrapped Details trigger sat at the catalog start while its panel was right-aligned. Viewport clamping placed the panel at x=8, outside the main region beginning near x=252. Left-aligning it to the trigger and limiting width to the catalog container prevents sidebar clipping; existing viewport adjustment, scrolling and Escape behaviour remain.

- Production RU/EN: **320×567, 390×844, 767×900, 844×390, 944×762, 1024×767, 1366×767, 1920×1080**. All nineteen observations, including a collapsed-sidebar case and the final screenshot state, keep the panel within both the main region and viewport with zero root overflow.
- At the reproduced RU width the corrected panel spans approximately **x276–796**, fully inside the main region **x252–944**. Summary values and saved-filter/export entries remain visible. Escape closes and returns focus to the trigger.
- Final lint, token references, build and diff checks passed. Initial JavaScript remains **582.7 KiB / 600 KiB**. This is a CSS-only change; the full server suite was not repeated for it.
- Local evidence: `output/aa-delivery-2026-11-04/details-checks.json`, `details-before.png`, `details-after-ru.png`. The final successful screenshot was inspected; a later optional clipped capture failed and is not acceptance evidence.
- Russian, expanded sidebar and closed Details were restored; final sync state was `saved`. No file mutation was performed; temporary viewport/tab were cleaned up. Physical-device limits above still apply.
