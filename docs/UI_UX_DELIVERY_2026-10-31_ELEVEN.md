# Audit delivery: knowledge, projects and diagrams / Внедрение 11 пунктов аудита

This report supersedes the backlog and coordinate-persistence limitations in [the original audit](UI_UX_AUDIT_2026-10-31_KNOWLEDGE_PROJECTS.md). / Этот отчёт обновляет статус исходного аудита; его старые ограничения по раскладкам больше не описывают текущую реализацию.

## Implementation / Реализация

| #   | Result / Результат                                                                                                                                                                                                                   | Commit    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 1   | Personal card type visibility and up to three populated fields per type. / Личные настройки типа и свойств на карточках.                                                                                                             | `5af2cdc` |
| 2   | Reader-header properties, preserved reading position on button/Escape close. / Свойства из шапки читателя с возвратом к месту чтения.                                                                                                | `6dfa611` |
| 3   | Typed/template creation and direct Library tools entry. / Создание по типу/шаблону и заметный вход в инструменты.                                                                                                                    | `4d6cfa7` |
| 4   | All project views in mobile selector; desktop active-tab reveal. / Мобильный выбор всех видов проекта, прокрутка активной вкладки на десктопе.                                                                                       | `f4f8eb5` |
| 5   | Personal pinned/recent folders, parent navigation, retained move search/scroll. / Закреплённые и недавние папки, родительская папка и контекст переноса.                                                                             | `714a0a3` |
| 6   | Explicit search scope, removable quoted/typed conditions and modified collection context. / Явная область поиска, отдельные условия и состояние подборки.                                                                            | `96a2c16` |
| 7   | Whiteboard multiselect, alignment/distribution, connected copy/paste and undo. / Множественное выделение, выравнивание, распределение и копирование со связями.                                                                      | `db5d0e3` |
| 8   | Durable bounded board history, private on-demand endpoint and guarded restoration. / Серверная история холста, загрузка по запросу и безопасное восстановление.                                                                      | `2aa91e5` |
| 9   | Personal named graph/board layouts and graph pins, account/workspace isolation. / Личные раскладки графа и холста, закрепления, изоляция пользователей.                                                                              | `e8918d8` |
| 10  | Native import, JSON Canvas interchange, review, append and hash-guarded replacement. / Импорт, обмен JSON Canvas, предварительная проверка и защищённая замена.                                                                      | `70bcf02` |
| 11  | Bilingual task guides and device acceptance checklist implemented. Physical iOS/Android acceptance remains pending: user has no devices available. / Справка и чек-лист готовы; проверка на физических устройствах ещё не выполнена. | `0a08ae9` |

Additional production finding: mobile creation menu used block buttons and squeezed the folder heading. Corrected icon/text alignment and moved controls into their own mobile row (`b29061d`). Shared metadata text token corrected in `959eb52`. / Дополнительно исправлены мобильное меню создания, место для заголовка папки и общий токен вторичного текста.

## Data and safety boundaries / Границы данных

- `knowledgeCardMeta`, `knowledgeFolderPins`, `diagramViews` are validated personal preference JSON strings. They travel through the existing owner-scoped settings API. Folder recent history and transient move navigation are scoped to user/workspace. / Личные настройки не меняют представление коллег.
- Named diagrams: up to 12 layouts, including three graph layouts; graph layouts/pins retain up to 250 positions and total preference size is 180,000 characters. The layout bridge is session-generation scoped and refuses a previous account’s renderer snapshot. New screen dimensions fit positions into the viewport. / Настройки ограничены по объёму, мост графа привязан к поколению сессии.
- `_whiteboardHistory` is server-derived, omitted from ordinary workspace DTOs, and retained by backups. Up to five previous versions per project and a shared 700,000-character budget. The endpoint checks current project access and uses `no-store`. Restore checks a server hash and saved-version content; previous content becomes a recovery checkpoint. / История не передаётся всем клиентам вместе с рабочим пространством.
- Import file up to 1 MiB; board up to 200 cards/400 edges/350,000 JSON characters. Strict integer geometry and text limits are documented in the guides. Imported node identities are regenerated. Current entity access is checked again on the client and server. Unavailable references become visible text placeholders; no protected title/body is copied. / Импорт не расширяет права и не копирует закрытое содержимое.
- Replacement carries `whiteboardReplaceBaseHash`; stale requests fail with `409 WHITEBOARD_REPLACE_STALE`. The server removes transient markers after validation. Existing canonical persistence and project ACL checks remain in place. / Параллельная правка останавливает замену.
- JSON Canvas support follows [the primary 1.0 specification](https://jsoncanvas.org/spec/1.0/), with explicit limits. External files/URLs become text pointers; backgrounds/fixed sides/two-ended arrows/unsupported colors are reviewed as lossy conversions. Native JSON preserves frame text; Canvas preserves its label. This is not a complete Obsidian vault/media importer. / Совместимость ограничена обменом холстами.

## Verification / Приёмка

Individual Chromium workflows passed for all implemented areas, RU/EN, 320×740, 390×845, 768×1024, 844×390 and 1366×768. The folder fixture contains 500 sibling folders plus ten levels. Tests cover save/reload, independent accounts, private project access, stale restore/replacement rejection, copy/paste connections and history recovery. / Отдельные сквозные проверки пройдены; реальные данные команды для этих записей не использовались.

Full server/shared suite: **588/588 passed**. ESLint passed; all custom property references resolve. Prettier passed. Build initial JavaScript: **534.8 KiB**, below the unchanged 600 KiB budget.

Final cross-engine acceptance: **6/6** help/creation workflows across Chromium, Firefox and WebKit; **6/6** named-layout/import workflows across those engines. The first combined run exposed shared test-fixture IDs, an assumed starting language and an ambiguous menu selector. Test setup was isolated (`e2087bb`) and all six affected workflows passed on repeat. The original full whiteboard workflow also passed in Chromium (**1/1**): cards/frames, real fixture-file reference, connections, drag/reload, outline, undo, native JSON download, separate projects and denied writes. / Финальные межбраузерные сценарии пройдены; исправлено взаимное влияние тестовых данных, а не ослаблены проверки приложения.

Production acceptance used the existing owner session on `smena-manager.vercel.app`, with actual CSS sizes **320×740, 390×845, 767×1024, 844×390 and 1366×767**. Knowledge catalog/header, creation menu, Graph layouts, whiteboard interchange menu and task Help were checked in both languages with no document-wide horizontal overflow. The narrow folder dialog fit the full 390 px viewport. The short landscape whiteboard menu remained within the viewport with internal scrolling. Project view selection opened Whiteboard; the history endpoint loaded the empty real board history in RU/EN. Reader properties were opened and cancelled without changing a note. / На основном сайте проверены интерфейс, навигация и чтение истории; рабочие материалы не изменялись.

Session and English preference survived refresh; Russian was restored and the status was **Saved**. The temporary audit tab was closed and viewport overrides reset. Production team notes, whiteboard contents, files and project permissions were not changed. New write/restore/import and account-isolation assertions use the isolated local server, so those results are not claimed as production write tests. / Сохранение новых данных и восстановление проверены в изолированной базе, а не на материалах команды.

Final small corrections: archived-project history exposes read-only actions (`b6f97c6`), and Russian help matches the exact “Сведения в карточках” caption (`a19e302`).

Physical-device status: **not tested**. Browser resizing/emulation does not verify system keyboard, screen locking, background suspension or actual touch gestures. No physical iOS/Android result is inferred from browser tests. / Приёмка на устройствах остаётся открытой.

User guides: [Русский](KNOWLEDGE_WHITEBOARD_GUIDE_RU.md), [English](KNOWLEDGE_WHITEBOARD_GUIDE_EN.md). They include the real-device checklist and actual interchange/history/layout limits.
