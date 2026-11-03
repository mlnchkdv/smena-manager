# Y01–Y11 delivered / Внедрение Y01–Y11

**Date / Дата:** 3 November 2026. **Production application:** `5559b3db9b3cf8e048c59ea7446aac1912ea9b6e`, verified through the public version manifest. **Baseline:** `b512847` (application `d8b9676`).

**RU:** Все 11 пунктов [аудита после X01–X16](UI_UX_DEEP_REAUDIT_AFTER_X_2026-11-03.md) внедрены. Каждое логическое изменение, включая исправления приёмки, закоммичено и отправлено отдельно: 17 application commits. Основной сайт проверен на русском и английском, на семи размерах с выборочным функциональным охватом. Материалы и права команды не менялись.

**EN:** All eleven audit items are implemented. Each logical change, including acceptance corrections, was committed and pushed separately: 17 application commits. Production was checked in Russian and English across seven viewport sizes with selective functional coverage. Team content and access rights were not edited.

## Changes / Изменения

| ID  | Delivered behaviour / Результат                                                                                                                                                                                                                                                                                         | Commits                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Y01 | Activity period expansion survives re-renders. Stable field/button identities preserve focus while entering both dates or using presets. / Панель периода остаётся раскрытой, фокус не теряется после первой даты.                                                                                                      | `8bbff61`                       |
| Y02 | Inverted date ranges show a localized linked error with `aria-invalid`/`aria-describedby`; inputs are retained, ordinary empty results are suppressed. Equal dates and inclusive timezone boundaries remain supported. / Ошибочный период объясняется явно.                                                             | `59832a1`                       |
| Y03 | Mobile timeline focus uses the actual date-group heading rather than adding a duplicate. Anchors without events get a separate nearest-events explanation. / Один заголовок дня; события не подписываются датой перехода.                                                                                               | `06df6a3`                       |
| Y04 | Pointer and keyboard use the same palette-selection function, synchronizing highlight, `aria-selected` and `aria-activedescendant`. Arrow navigation keeps focus in the search input without rebuilding it. / Визуальное и доступное выделение согласованы.                                                             | `a05bc7c`                       |
| Y05 | The mobile knowledge header has one row with creation, Tools and Display. Rare imports, templates and creation by type are reachable from Tools; active filters and page selection remain visible. / Верхняя панель компактнее, импорт TXT/MD доступен через общее меню.                                                | `ceae32b`                       |
| Y06 | Folder count explanation is explicitly disclosed. The current path is shown, the active folder is excluded from recents, empty shortcuts are omitted and the mobile tree loses its extra nested surface. Existing search, full paths, paging and scroll memory remain. / Навигатор папок проще без потери возможностей. | `818afb4`                       |
| Y07 | File grids use a useful minimum card width. A duplicate flexible footer spacer no longer competes with the location label; controls retain their size. / На промежуточной ширине путь папки получает существенно больше места.                                                                                          | `20ca4ec`, `5559b3d`            |
| Y08 | Notification sections share a collapsible read-only event/channel overview with links to details. Workspace diagnostics are disclosed separately for administrators. / Каналы видны в одной сводке; личные настройки и диагностика разделены.                                                                           | `8978980`                       |
| Y09 | Settings search accepts RU/EN names and aliases, uses only authorized navigation and links to the section with heading focus. Existing groups, picker and deep links remain. / Поиск по «сессии», «часовой пояс», «backup» и другим синонимам.                                                                          | `cc114ee`                       |
| Y10 | Simplified graph has an optional personal Cluster labels setting. A few collision-aware project/hub labels orient the overview; leaf labels remain hidden until interaction. / Упрощённый граф получил редкие отключаемые подписи кластеров.                                                                            | `1ccb0c6`                       |
| Y11 | Optional activity grouping is shared by Home and Activity as a device-local, user/workspace-scoped view preference. Adjacent updates by the same actor on the same task/day within five minutes can be expanded into every original event. / Повторяющиеся изменения объединяются только в представлении.               | `753f7e2`, `70bc3aa`, `093b195` |

### Acceptance corrections and loading budget / Исправления приёмки и бюджет загрузки

- `c7278cb`: graph-list keyboard support now loads with the graph route instead of the initial shell. Its roving focus is refreshed after graph-page rendering.
- `0fdfcc3`, `6f4bb43`: Home uses the existing lazy-route mechanism. A missing Home dispatch entry was found and corrected immediately; the final production Home route was explicitly opened and accepted.
- `70bc3aa`: the new exact event-time tooltip initially passed a legacy timezone label directly to `Date.toLocaleString`, causing Activity rendering to fail. Production acceptance exposed it. The final code uses the application's timezone-aware `fmtTimestamp`; the existing restricted-settings test harness was also updated for the search entry point.
- `093b195`: production activity uses numeric timestamps as well as ISO strings. Grouping now handles both, rejects invalid timestamps safely and has a dedicated regression test. Real production grouping was repeated after this correction.
- `5559b3d`: acceptance found that a footer spacer still consumed location width. It was removed for text file cards; the final layout was measured again in production.

Intermediate builds and observations from failed/loading states are not accepted results. The initial 600 KiB JavaScript budget was not raised. Final initial JavaScript is **581.8 KiB / 600 KiB**, down from 599.9 KiB at the previous delivery. Home has the same skeleton/error/update handling as other lazy routes; route loading was checked in production.

## Behaviour and data boundaries / Поведение и границы данных

**Activity:** grouping changes no stored event, id, author, date or read state. Source order and page boundaries are retained. Different tasks, authors, workspace/project contexts and days do not merge. Comments, security/system events, access/sign-in events and explicitly unread events stay individual. A five-minute window is measured from the first event in a group, preventing long chains from collapsing into one group. Each expanded event retains its task/project action and exact timestamp tooltip. No new public event-link protocol was introduced.

**Настройки уведомлений:** сводка показывает предпочтения, а не подтверждённую доставку. Подключение браузера, разрешение устройства и состояние сервера остаются самостоятельными условиями. Открытие сводки не отправляет тестовых писем/push и не включает каналы. Существующие переключатели и серверные правила доставки не изменены.

**Settings search:** the search model receives the already-filtered section navigation; it cannot expose a hidden administrative section through its results. A manually forged deep link still reaches the existing restricted-access explanation. The search query is temporary UI state, not a workspace write. Production used the owner session; member/guest restrictions were covered by isolated model/view tests, not live role changes.

**Graph:** `graphAnchors` is a validated boolean personal preference. Defaults show sparse anchors in simplified mode; users can switch them off. The render identity includes this preference while the existing topology/session boundary remains. Label selection changes neither material membership nor edges, pinning, camera or physics semantics. The existing list remains the keyboard alternative. Unit cases include crowded labels and large graphs; no large-browser FPS benchmark is claimed.

## Production verification / Проверка основного сайта

The observed CSS viewports were **320 × 567, 390 × 844, 767 × 900, 844 × 390, 1024 × 767, 1366 × 767 and 1920 × 1080**. Files, Knowledge, Graph and Settings were inspected across the RU/EN matrix; additional Activity, Timeline, Home, palette, folder-dialog and notification-overview scenarios were checked where relevant. This is not every action on every size.

The local matrix contains **74 observations: 70 ready, 4 loading states excluded**. None of the 70 ready observations had root horizontal overflow. Intended scrolling inside a table, folder tree or result list was treated separately. Ready graph labels were additionally inspected in a dark theme; an earlier dark loading screenshot was excluded.

Concrete results / Подтверждённые результаты:

- RU mobile date input: after the first date, the period remained open and focus was `activity-from`; after the second it was `activity-to`. Both languages showed the inverted-range explanation, and clearing restored valid results.
- RU/EN timeline: the 15 November group appeared once. Focusing 1 November without an event showed the English nearest-events explanation rather than relabelling a later event. Today was restored afterwards.
- RU/EN palette: ArrowDown selected `pi-1`; the single selected row, CSS highlight and combobox active descendant matched; focus remained in `pal-in`. Pointer/empty-result consistency is covered by the shared-function test. No screen-reader acceptance is claimed.
- Knowledge at 390 px: the first note began at approximately **y=271 px**, compared with roughly y=319 in the audit observation. The comparison uses the observed current catalog state; it is not a universal fixed-height guarantee. Import and type/template actions remained reachable in Tools on both languages.
- Mobile folder search found a nested folder, preserved the query through selection and reopening, and displayed its full current path. At 320 px, the English folder surface measured **320 px client width and 320 px scroll width**, with a 533 px-high contained surface. Query/current folder were returned to All notes with an empty folder search.
- File cards at 1024 px measured about **356 px**. The location region increased from about **128 px** before the footer correction to **263 px** afterwards; favorite/menu controls remained separate. Full path data was unchanged.
- Notification overview displayed all seven email-event rows and relevant browser states in RU/EN. Workspace diagnostics were initially collapsed. No test-delivery action or permission prompt was invoked.
- Settings search: Russian `сессии` found Account security; English `time zone` found Date & time. Following a result cleared search and focused the section heading. The authorized-navigation model tests cover hidden administrative sections and empty/unknown queries.
- Simplified graph: two sparse anchors were observed at 390 px, three at 1024 px. Switching labels off produced zero anchors; after reload the off preference remained off and the session restored. Labels were then re-enabled. Ready dark-theme rendering showed separated project anchors.
- Activity grouping: production showed **four groups with all 50 original page events still present**. A real two-event subtask group expanded correctly. Grouping remained enabled after reload; it was then returned to off. English group wording and the shared Home control were checked. The final Home route loaded successfully.

At completion Russian, light theme, full graph rendering, physics-on and grouping-off were restored. The new graph-label preference was left on, equivalent to its default. Sidebar visibility was preserved. Temporary browser tabs/viewport overrides were cleaned up. Only personal/display preferences were exercised; team materials, ACLs, note types, files, relations, unread items and backups were not edited.

## Automated verification / Автоматические проверки

| Check                                                        | Result                                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Full `npm run test:server` after JavaScript acceptance fixes | **641/641 passed**, 0 failed, 0 skipped; approximately 34 seconds            |
| Full `npm run lint`                                          | Passed; changed JavaScript was linted again before each later commit         |
| Final `npm run build` including final file CSS               | Passed; approximately 33 seconds; **581.8 KiB / 600 KiB** initial JavaScript |
| `npm run check:tokens`                                       | Passed                                                                       |
| Formatting and `git diff --check`                            | Passed for every committed change                                            |

New focused cases cover invalid activity ranges, palette semantics, bilingual authorized settings search, sparse graph anchors, validated false-valued personal preferences, numeric timestamps and lossless grouping boundaries. Existing timezone-inclusive date, timeline scope/page and large folder cases passed. The folder suite exercised 10,000 nested folders/notes in an isolated model; this does not represent rendering that entire dataset in production.

Local evidence: `output/y11-delivery-2026-11-03/`, `output/y11-tests-complete.log`, `output/y11-lint-acceptance.log`, `output/y11-build-published.log`. These remain untracked because they may include private UI content. They must not be committed as public fixture data.

## Limits and follow-up / Ограничения

- Physical iOS/Android, virtual keyboards, touch inertia and real screen readers were unavailable. Browser resizing is not physical-device acceptance.
- No new production content-write/import/restore, Gmail/push delivery, member/guest login or multi-user concurrency test was run. Existing server/shared tests passed; they do not substitute for those external scenarios.
- Several incremental deployments invalidated old lazy assets during acceptance. The application exposed its update flow; updating restored the session and the latest sections. One embedded-browser tab stopped responding and was replaced. Loading/failed states were excluded rather than counted as passed.
- No new audit package is implied by these limits. Y01–Y11 are delivered; real-device and production-write acceptance remain separate named work.

**English handoff:** all eleven requested code items are live. The active implementation uses lazy Home/Graph support, a shared accessible palette selector, bilingual settings search, a read-only notification overview, optional sparse graph labels and lossless five-minute activity grouping. Final app SHA is `5559b3d`; 641 tests pass. Review the limits above before reporting a physical-device, delivery or production-write guarantee.
