# N01–N24: внедрение / Delivery — 1 November 2026

## Статус / Status

**RU.** Все 24 программных пункта [аудита](UI_UX_DEEP_REAUDIT_AFTER31_2026-11-01.md) реализованы, каждый логический шаг закоммичен и отправлен в `main`. Основной сайт проверен авторизованным владельцем на русском и английском. Материалы команды, права, письма и резервные копии не изменялись; переключались только представления и личный язык, возвращённый на русский.

**EN.** All 24 code items are implemented and pushed as individual logical commits. Authenticated production verification used the owner account, both locales and seven viewport sizes. Team materials, permissions, email and backups were not modified. Only view state and personal language were changed; Russian was restored.

**Публикация ограничена / Deployment limitation.** Production reports build `72306d9ecaaf3b6609a494ef0ecd1bb16a99624f`, containing all N01–N24 features. A subsequent deployment attempt was rejected by Vercel: `api-deployments-free-per-day`, more than 100 deployments, retry after 24 hours. No plan or billing changes were made. Three final runtime corrections are pushed and locally verified but **not yet verified on production**:

- `e825ec7`: sticky search-match controls while scrolling long notes.
- `e01ebf1`: sticky whiteboard selection reserves the mobile bottom-navigation height.
- `f7a83f0`: project names and task identifiers explicitly opt out of UI translation in home, overview and task lists.

После восстановления лимита нужно опубликовать актуальный `main` и повторить эти три проверки. HTTP 200 существующей сборки не означает публикацию последних commits. / Once the deployment allowance is available, publish current `main` and repeat these three checks. A successful response from the existing build is not proof that later commits are live.

## Изменения по пунктам / Changes by item

| ID  | Итог / Result                                                                                                                                                                                                                      | Main commit                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| N01 | Вложенный reader, palette и модальные окна получают клавиатуру раньше Focus-холста; точный возврат на opener. / Nested overlays own keyboard handling above focused whiteboards, with precise opener restoration.                  | `0742db5`, `09f6f41`            |
| N02 | Tab/Shift+Tab остаются внутри графа в Focus; скрытые, inert и закрытые controls исключаются. / Focused diagrams contain visible tab stops and yield to higher overlays.                                                            | `09f6f41`                       |
| N03 | Активное текстовое поле блока имеет локализованное имя и номер. / Active block textareas have localized numbered accessible names.                                                                                                 | `3f5908e`, `66ca9c4`            |
| N04 | Close + Esc локализован в задачах и reader. / Composite close tooltips are localized in both readers.                                                                                                                              | `4587786`                       |
| N05 | Локальный граф показывает разрешённое название материала, глубину и непустые разделители; безопасный loading fallback. / Local context includes the authorized material title and depth without dangling separators.               | `83850a3`                       |
| N06 | Пустая история отличается от нулевого результата фильтров; доступен сброс. / Filtered-empty activity has its own explanation and reset.                                                                                            | `e4fe3c9`                       |
| N07 | Толщина рёбер компенсирует zoom, контраст выделения и обычных связей различается. / Edge widths remain readable in screen space at overview zoom. This is not a numeric WCAG contrast certification.                               | `8e556cc`                       |
| N08 | Стабильные названия переключателей Folder panel, Pan and zoom и Interact with graph с явным pressed-state. / Stable toggle names and explicit state.                                                                               | `ac10c7e`                       |
| N09 | Поиск передаёт запрос в reader, выделяет до 300 фрагментов и даёт Previous/Next; совпадение только в сведениях обозначается отдельно. / Search highlights rendered content and navigates bounded matches without rewriting source. | `5d28bee`                       |
| N10 | Оглавление отделено от меню истории, скачивания, офлайн и избранного. / Contents and utility actions are separate menus.                                                                                                           | `dc5e5b5`                       |
| N11 | Перенос строк исходника сохраняется на устройстве для аккаунта/пространства; текст, выделение и scroll сохраняются. / Personal source wrapping preserves text, caret and scroll.                                                   | `f4d1a2c`                       |
| N12 | Focus-редактор скрывает лишний бренд/path и сокращает шапку. / Focused editing reduces reader chrome.                                                                                                                              | `998be7e`, `6c919b8`            |
| N13 | Один Tab-вход в папки, Up/Down/Home/End и Left/Right для родителя/ветки; активный путь выделен. / Roving folder focus, hierarchical arrows and active-path indication. Folder pagination remains bounded.                          | `ea28f53`                       |
| N14 | Shift+click и Shift+Space выделяют диапазон текущей видимой страницы; выбор за её пределами обозначается отдельно. / Range selection is page-scoped with explicit off-page selection counts.                                       | `60ae407`                       |
| N15 | Действия выделения холста закреплены в screen-space, доступны на низком экране. / Sticky selection actions remain reachable in short normal views. See pending mobile-nav correction above.                                        | `fd318b2`                       |
| N16 | Миниатюра получает bounded geometry и заголовки собственных текстовых карточек/рамок, для материалов — типовой fallback. / Catalog thumbnails include bounded board-owned titles and type fallbacks.                               | `f74db71`                       |
| N17 | Collapse/Expand all; свёрнутые рамки сохраняются лично для аккаунта/пространства/холста. Поиск временно раскрывает совпадения. / Personal outline group state and bulk controls.                                                   | `b3eee9f`                       |
| N18 | Необязательная миникарта только при выходящем за экран содержимом; клик и стрелки перемещают камеру, Enter выполняет Fit. / Optional offscreen minimap, pointer and keyboard camera navigation.                                    | `a12bfd4`, `e9fff43`, `d95eba7` |
| N19 | Один Tab-вход в список графа, стрелки/Home/End; Enter/Space выбирают материал. / Roving graph-list navigation without moving nodes.                                                                                                | `04c7b5c`                       |
| N20 | Предпросмотр обозначает текущую страницу результатов; на границе можно вернуться к следующей/предыдущей странице каталога. / Explicit preview scope and controlled continuation through bounded result pages.                      | `aabf343`                       |
| N21 | «Файлов в папке» и подсказка «без вложенных папок». / Compact direct-file count with explanatory tooltip.                                                                                                                          | `fe5598f`                       |
| N22 | Поиск по автору, задаче/ключу, проекту, типу и тексту доступных уведомлений; группировка и read-state сохранены. / Inbox search across authorized notification context.                                                            | `9b018f3`                       |
| N23 | Избранное и активность запоминают фильтры/сортировку/даты/страницу локально для аккаунта и пространства; есть Reset view. / Scoped personal collection view state and reset.                                                       | `4c35438`, `8e91150`            |
| N24 | Компактная кнопка статуса на мобильной шапке открывает существующее меню аккаунта; не добавляет строку. / Discoverable mobile save-status entry reuses the account menu.                                                           | `aeaddfd`                       |

## Данные и границы / Data boundaries

- Search marks are DOM nodes over sanitized reading markup; Markdown/TXT source and import metadata are not rewritten. Literal query characters are escaped before building a regular expression; query operators are excluded from body highlighting.
- Range selection uses currently rendered note IDs, a scoped anchor and the current page order. It does not request every search result or bypass existing move/trash checks.
- Minimap and group-collapse changes affect camera/device preferences only. Arrow keys on the minimap are excluded from card-movement handling; Undo stays unchanged.
- Thumbnail DTOs keep the existing 40-node/60-edge bounds and are built after workspace projection. No note/file bodies, material targets or cached material titles are added. They do not trigger full catalog reads.
- Preview continuation returns to the normal catalog page loader. It does not automatically download unseen files. Session generation, workspace and current query key are checked; opening the next file checks access again. The production dataset contains three files, so the cross-page continuation boundary is not claimed as a 1000-file live test.
- Collection preferences are optional local device data, scoped to account and workspace, with bounded values and clamped page indices. They are not shared workspace queries and are not advertised as cross-device sync.
- The mobile status is about data synchronization, not proof of Gmail/push delivery. Production exercised the saved state; notification delivery was not retested here.

## Проверка / Verification

- **608/608 server tests passed.** Includes workspace projection, graph/catalog access, version history, synchronization and bounded storage behavior.
- **12/12 targeted UI tests passed** in Chromium, Firefox and WebKit. Each new flow checks RU/EN: reader matches, source/caret preservation, range selection, personal view reload, nested focus/return, graph Focus and a 200-card/40-frame outline with collapse persistence and minimap keyboard isolation.
- Final sticky-control rerun: **6/6 passed** across Chromium, Firefox and WebKit, including a long-note match jump with reachable find controls and whiteboard selection above mobile bottom navigation. These are repeats of two targeted scenarios with stronger geometry assertions, not six additional unique features.
- A broader seven-scenario acceptance run completed **6 passed / 1 failed**; the remaining WebKit case expected a native date edit to commit before blur. After adding the normal Tab/blur commit, its targeted rerun passed (**1/1**). This covers file preview/navigation, favorites/activity persistence, note editing/history/import/mobile folders and the all-route RU/EN desktop sweep in three engines. The successful rerun is recorded separately, not represented as a clean original run.
- Production was checked at CSS widths **320, 390, 767, 1024, 844 landscape, 1366 and 1920**. **167 accepted geometry rows** (88 RU / 79 EN) had no root overflow above 1px or dialogs outside viewport bounds. Interim loading/local-context rows and obsolete sticky-panel repros were excluded; they are retained in the raw matrix. Accepted geometry rows and private screenshots remain under `output/n24-production/`; they are intentionally outside Git. The matrix records the published build, not the deployment-blocked follow-ups.
- Live checks confirmed: match navigation `1/11 → 2/11`; Shift-selection of six notes followed by clear; localized block input; unchanged source while switching wrap; nested reader Tab/Escape and exact opener return in RU/EN; collapsed frame state after reload; minimap camera keys without Undo changes; graph list End with one tab stop; named local context and depth in both locales; Inbox author search and filtered-empty states; direct file counts, page scope and previous-file navigation; mobile account/status menu; Russian restored with `saved` status.
- `npm run build`, initial JS budget **583.6 KiB / 600 KiB**, full ESLint and token-reference checks passed. Build retains the existing large-chunk warning.
- Initial broader checks exposed test-fixture issues: a duplicate seeded note across engines, repeated file-name prefixes, a close-button selector matching the scrim, and an old Tab-every-folder assumption. Fixtures/selectors were corrected. Project-name/task-key translation boundaries were also corrected in code.

The dedicated CLI ergonomics script could not start because its separate Layout QA server at port 5194 was absent. An initial `check:ui` launch collided with an active E2E server; its underlying route sweep was subsequently run in the broader acceptance suite. These initial launcher errors are not counted as passing checks.

Physical iOS/Android hardware, touch gestures, software-keyboard obstruction and screen lock were not tested. No real devices are currently available. Browser resizing and WebKit tests do not substitute for those checks. Production member-account ACL writes, restores, mass uploads, notification sending and billing changes were outside this verification.

## Как продолжать / Handoff

1. Treat N01–N24 as implemented code, not a fresh backlog. Keep the deployment limitation separate from feature completion.
2. After Vercel permits a new deployment, publish current `main`. Confirm `/app-version.json` matches that commit, use the normal update panel, then verify the sticky find bar, mobile selection above the bottom navigation and translation opt-outs. Do not alter plan/billing or repeatedly retry a rejected deployment.
3. Retain canonical Drive/version/ACL checks and bounded catalog APIs when extending previews or thumbnails.
4. Future mobile hardware acceptance remains a separate task; team production materials must not become load-test fixtures.
