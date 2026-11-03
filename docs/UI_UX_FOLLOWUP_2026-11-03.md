# Six requested UI fixes and graph behaviour / Шесть правок интерфейса и поведения графа

**Проверка / Verification:** 2–3 November 2026. **Production:** `d8b967694bcfd261b4c3b9911c2eacdc591ff0d3`, confirmed by the public version manifest on 3 November. All application commits below were pushed separately to `main`.

**RU:** Выполнены шесть дополнительных запросов пользователя, поступивших во время повторного аудита. Исправлены аватар в свёрнутом меню, портфель, значки форматов файлов, выбор типа заметки, действия карточек холстов и поведение графа. Новый список оставшихся задач находится в [повторном аудите Y01–Y11](UI_UX_DEEP_REAUDIT_AFTER_X_2026-11-03.md). Он является планом, а не списком уже внедрённых изменений.

**EN:** Six additional user requests raised during the re-audit are delivered: collapsed-sidebar avatar, portfolio sizing, file format badges, note type selection, whiteboard card actions and graph retention/drag physics. [The new Y01–Y11 audit](UI_UX_DEEP_REAUDIT_AFTER_X_2026-11-03.md) is a separate pending plan.

## Delivered changes / Выполненные изменения

| Request / Запрос                                           | Result / Результат                                                                                                                                                                                                                                                                                                                                        | Application commits                        |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Collapsed-sidebar account avatar / Аватар в свёрнутом меню | The collapsed text rule no longer hides the avatar/status wrapper. The visible avatar measured 22 × 22 CSS px, and its account menu opens. / Правило скрытия текста больше не скрывает сам аватар и статус.                                                                                                                                               | `8ea531f`                                  |
| Overview portfolio / Портфель обзора                       | The portfolio sizes to its own content rather than stretching to the height of neighbouring summaries. Deadline cells remain on one line, including a different year. The table retains a local horizontal scroll at narrow widths. / Убрана огромная пустая нижняя область; даты читаются целиком.                                                       | `b498982`                                  |
| File format icons / Значки форматов файлов                 | A fixed 40 × 44 px badge contains a non-stretching 20 × 20 px glyph and a compact format label. Grid and mobile column allocation match the badge. / TXT больше не выглядит вытянутой вертикальной плашкой.                                                                                                                                               | `860882d`                                  |
| Note type / Тип заметки                                    | A small type badge next to note metadata opens a focused type-and-properties dialog. The large always-visible type form is removed from the reader. The editor uses the same entry point; the full properties dialog remains available. / Тип выбирается по компактной кнопке, а не через большую форму под текстом.                                      | `bfccfaf`, `fe2f906`                       |
| Whiteboard favorites / Избранное холстов                   | Favorite and overflow actions are grouped beside the title, below the thumbnail. Mobile titles reserve space for two 44 px controls and an 8 px gap. / Звёздочка закреплена в строке действий и не висит поверх содержимого холста.                                                                                                                       | `5949981`, `3ea9d16`                       |
| Graph updates and physics / Обновления и физика графа      | An unchanged, authorized graph surface is retained across shell renders. With physics on, dragging a node pulls its loaded connected component using bounded springs; with physics off, native individual dragging remains. / Фоновое обновление интерфейса больше не сбрасывает неизменившийся граф; связанный кластер следует за перетаскиваемым узлом. | `2f2dd5c`, `250d353`, `573a936`, `d8b9676` |

### Graph lifecycle and boundaries / Жизненный цикл и границы графа

The retained object is a `.graph-surface` wrapper containing the existing Cytoscape canvas. Keeping the canvas's observed parent intact avoids the renderer being destroyed when the surrounding application shell is replaced. Responsive grid tracks and explicit minimum widths allow that retained surface to shrink. Renderer resize refreshes pointer coordinates after reflow; scroll-related refreshes are coalesced into animation frames.

Сохранение поверхности разрешено только для того же владельца/сессии и той же авторизованной топологии. Загрузка через границу доступа не использует старую поверхность. Изменения материалов, названий, связей, выделения и параметров отображения по-прежнему обновляют граф. Это не отключение синхронизации и не сохранение устаревших прав.

Drag physics operates on the **loaded connected component**, not on materials outside the current graph scope. Locked nodes stay fixed; unrelated components do not move. A click without dragging does not restart layout. The settling phase is bounded to 1.5 seconds and preserves the camera. Reduced-motion mode follows the drag directly without post-release animation. Position changes during the gesture do not write workspace content or implicitly save a personal layout.

Физика здесь означает упругое следование связанного кластера за узлом. Это не бесконечно работающая симуляция всего графа. При выключенной физике узлы перемещаются по отдельности. Настройка остаётся личной.

### Note type scope / Границы изменения типа заметки

The existing type mutation, validation, metadata and revision handlers are reused. The compact badge changes how users reach them. The focused dialog contains the type selector and fields relevant to that type; the ordinary full-properties entry point remains available.

На основном сайте проверены открытие, закрытие и компоновка в читателе и редакторе на обоих языках. **Тип, свойства и текст реальной заметки не изменялись.** Существующий изолированный тест типизированных метаданных и восстановления прошёл. Это не заменяет отдельную production-проверку записи типа под разными ролями.

## Production acceptance / Проверка основного сайта

- Baseline application: `0a3b76d` (documentation-only HEAD at audit start: `58bca0a`). Final application: `d8b9676`.
- RU/EN route audit at **390 × 844** and **1366 × 767 CSS px** covered the main sections, 18 settings sections and eight project tabs. Additional checks were selective at 320 × 567, 767 × 900, 844 × 390, 1024 × 767 and 1920 × 1080.
- Final catalog acceptance covered Files, Knowledge and Whiteboards in both languages across those seven viewport sizes, with selected graph/overview checks. The final evidence file contains **50 ready geometry observations** with no root horizontal overflow; six loading/empty-heading observations were excluded. This is a selective matrix, not every interaction at every size.
- Graph: a real native browser drag in the visible production tab moved a connected component of **six nodes**. The renderer identifier remained the same during the gesture and settled afterwards. Physics-off interaction was checked, then physics was restored to on. Opening and closing display settings also retained the renderer. The deterministic model tests cover movement of neighbours, fixed nodes, unrelated components and reduced motion.
- Graph after a page reload at 390 × 844: authorized route restored, Russian UI, physics on, settled state, retained wrapper present, canvas width approximately 357 px. The temporary session-restoration screen completed successfully; the user was not asked to sign in again.
- At 320 px, whiteboard action controls measured 44 × 44 px; the title region ended 8 px before the action group. The note type dialog fit its 310 px inner width without internal horizontal overflow.
- Portfolio: before correction the measured 1920 px English panel was 608 px high around a 176 px table. A final 1920 px Russian observation was 236 px around a 193 px table. Languages differ, so these measurements demonstrate removal of stretching, not an exact like-for-like percentage reduction.
- File glyph/badge geometry matched 20 × 20 / 40 × 44 px in production.

**RU:** В конце возвращены русский язык, светлая тема, развёрнутая боковая панель и включённая физика. Временная вкладка закрыта, переопределение размера браузера снято. Не менялись материалы команды, права, типы заметок, связи, непрочитанные сообщения или резервные копии; рассылки и загрузки файлов не запускались.

**EN:** Russian, light theme, expanded sidebar and physics-on were restored. The temporary tab was closed and the viewport override reset. Team content, access rights, note types, relations, unread items and backups were not edited; no messages or file uploads were sent.

## Automated verification / Автоматические проверки

| Check                                          | Result                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| `npm run test:server`                          | **635/635 passed**, 0 failed, 0 skipped; approximately 51 seconds |
| `npm run lint`                                 | Passed                                                            |
| `npm run build`                                | Passed; initial JavaScript **599.9 KiB / 600 KiB**                |
| `npm run check:tokens`                         | Passed                                                            |
| Changed-file formatting and `git diff --check` | Passed before commits                                             |

New deterministic regressions cover graph surface ownership/topology boundaries, order-independent render identity, preservation of the observed canvas parent and cluster drag physics. A 500-node model case checks finite numerical results; it is **not** a production browser frame-rate benchmark. Targeted tests are included in the full total and must not be added to 635 again.

The initial bundle budget was kept unchanged. The type badge and graph renderer details load with their existing lazy features rather than enlarging the shell. The budget now has very little headroom; future feature work should reduce the entry bundle before adding eager dependencies.

Local evidence is under `output/y-audit-2026-11-02/` and the `output/y-*.log` files. It is deliberately untracked and may contain private production UI content. Screenshot capture was unavailable for several final attempts; those attempts are not counted as visual evidence. Successful native-drag screenshots, DOM geometry and visible control-state checks remain available locally.

## Limits / Ограничения

Browser viewport tests do not replace physical iOS/Android, touch inertia, virtual keyboard, screen-reader or 200% text testing. No fresh end-to-end production write/recovery or multi-user concurrency test was performed in this pass. Existing server/shared authorization tests passed, but this UI audit is not a security certification or a new delivery test for Gmail, push or scheduled backups.

**Next / Далее:** [Y01–Y11: reproduced issues, source findings and UX proposals with acceptance criteria](UI_UX_DEEP_REAUDIT_AFTER_X_2026-11-03.md).
