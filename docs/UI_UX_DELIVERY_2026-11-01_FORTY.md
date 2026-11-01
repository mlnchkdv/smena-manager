# Внедрение 40 пунктов / Forty-item implementation

План: [глубокий аудит от 1 ноября](UI_UX_DEEP_AUDIT_2026-11-01.md). Все **40 пунктов реализованы в коде**; у каждой самостоятельной правки есть отдельный commit и push. Это не означает сертификацию физических телефонов или повторное выполнение опасных операций на данных команды.

All **40 items are implemented**. The table identifies the first implementation commit; follow-up commits fix regressions discovered during acceptance. Device emulation and production read-only inspection do not establish physical-device or production write/recovery coverage.

| №   | Правка                      | Result / implementation                                                    | Первый commit |
| --- | --------------------------- | -------------------------------------------------------------------------- | ------------- |
| 01  | Жизненный цикл графа        | Owned graph instances; drain physics frames before disposal                | `5df2572`     |
| 02  | Личное избранное            | Per-member overrides and non-destructive legacy migration                  | `ddcbb02`     |
| 03  | Локализация                 | Translated events/filter builders and RU/EN plurals                        | `33a1505`     |
| 04  | Позиция хронологии          | Restore scope-specific scroll after responsive remount                     | `07ba97a`     |
| 05  | Web capture на телефоне     | Named compact capture action                                               | `c115f3a`     |
| 06  | Название в быстром поиске   | Two-line result with title receiving available width                       | `de93739`     |
| 07  | Состояние Select            | Keep query/caret/selection during safe redraws                             | `381f825`     |
| 08  | Зоны нажатия                | 44px touch targets; compact desktop controls                               | `94cbf2a`     |
| 09  | Область настроек            | Distinguish personal preferences from workspace operations                 | `4ba745e`     |
| 10  | Контекст доступных имён     | Material/member-specific action names                                      | `1a6f96b`     |
| 11  | Единый реестр навигации     | Hidden personal sections remain discoverable in commands                   | `93d68d3`     |
| 12  | Контекст результатов        | Search heading, folder paths and partial-file scope                        | `0c83af2`     |
| 13  | Контракт карточки           | Native open button; independent assignment and drag handle                 | `4077d88`     |
| 14  | Навигация доски на телефоне | Status shortcuts with counts and horizontal positioning                    | `91ca802`     |
| 15  | Шапка проекта               | Compact mobile identity/status and grouped secondary actions               | `2e073d0`     |
| 16  | Мобильные строки задач      | Two-line title plus secondary project/date context                         | `e9a8ec5`     |
| 17  | Карточка задачи             | Core fields first; extra properties collapsed; discussion shortcut         | `052a3e6`     |
| 18  | Главная и работа команды    | Real personal/team work switch and scope-correct links                     | `7459fd9`     |
| 19  | Чтение и предпросмотр       | Separate Read and Preview alongside modes                                  | `fcbfbd8`     |
| 20  | Фокус редактора             | Height-filling editor with optional properties inspector                   | `5e39620`     |
| 21  | Плотность заметок           | Compact/comfortable cards; suppress exact stock boilerplate                | `38b3e3e`     |
| 22  | Закреплённые поиски         | Device-local legacy saved-search shortcuts beside folders                  | `aa717f9`     |
| 23  | Покрытие истории            | Early snapshot-limit warning and source download                           | `4d9f4bf`     |
| 24  | Очередь TXT/MD              | Up to 1,000 files, 50-file read batches, cancellation/retry, atomic commit | `a78d9e7`     |
| 25  | Область папок               | Visible recursive-note count explanation; direct file counts retained      | `c204870`     |
| 26  | Панель холста               | One mobile row; secondary tools grouped and nested menus fixed             | `f3f3946`     |
| 27  | Камера холста               | Auto-fit versus manual center/scale; preserve restored layouts             | `646dfc6`     |
| 28  | Инспектор графа             | Open/pin before description; balanced mobile stage/details                 | `9922d20`     |
| 29  | Простой граф                | Minimum visible dot size and independent screen-space hit radius           | `41ce5c3`     |
| 30  | Режим взаимодействия        | Touch switch in navigation, outside the graph canvas                       | `ede08f0`     |
| 31  | Контекст файлов             | Independent workspace and per-project filters/upload destination           | `5370156`     |
| 32  | Пустые состояния файлов     | Explicit filtered/project/folder/global empty messages                     | `9cdf4ce`     |
| 33  | Обновление каталога         | Keep last same-query authorized rows; separate retry/error state           | `dae1bcf`     |
| 34  | Плотность закладок          | Compact reading/date actions; hide empty connections with add path         | `07a55df`     |
| 35  | Системные инциденты         | Recorded event/date/channel versus current diagnostics                     | `ba0aac3`     |
| 36  | Фильтры участников          | Full-width mobile search, compact role filter and result count             | `2c092c9`     |
| 37  | Компоновка настроек         | Switch beside its label; compact scope disclosure                          | `471ace2`     |
| 38  | Корзина                     | Search/type/date/location filters, pagination, guarded restore preview     | `994d959`     |
| 39  | Все материалы в избранном   | Six ACL-checked material types and personal star controls                  | `5c337e7`     |
| 40  | Слои календаря              | Personal tasks/events/milestones/project-date layers and distinct actions  | `ae2d331`     |

## Решения и ограничения / Decisions and boundaries

- **Избранное / Favorites:** validated personal preferences, scoped by member/workspace. Explicit false overrides old shared stars without changing shared records or colleagues. Legacy flags remain an initial fallback. Limit: 500 references. The six-type view checks current visibility; file identities are requested only for selected IDs. Personal favorites are separate from folder pins and shared collections.
- **Импорт / Import:** 1,000-file intake is staged in read batches of 50; the complete payload still respects the 4 MB transport ceiling. Progress/cancellation and failed-file retry occur before publication. One revision-fenced atomic confirmation avoids half-imported collections. Server checks merged document capacity before the safety backup. This does not create an unlimited database or promise reload-resume of local File objects. Confirmed duplicate-only batches do not offer a redundant write.
- **История / History:** the existing five-version, snapshot-size and total-history limits remain. Editor/import review disclose when new individual versions are unavailable; users can download their current MD/TXT source. Existing versions and server restore protections remain. Large history storage was not silently expanded.
- **Поиски / Saved searches:** pinned legacy searches remain device-local, matching their existing storage. Synced personal/shared smart collections remain a separate feature. Card density is also a per-device view choice.
- **Папки / Folders:** knowledge counts include descendants; file-folder cards show direct files. Existing search reveal, ancestor paths and bounded folder pages are retained. The 10,000-folder fixture covers iterative search/count/paging; no unnecessary replacement of the tree was introduced.
- **Холсты / Whiteboards:** auto-fit can follow viewport changes; zoom/pan/named or deployment-restored layouts are manual. Responsive resizing preserves the manual center and scale. Materials, saved layouts and card positions are not rewritten by resizing. Secondary tools use a compact accessible menu with independent Undo.
- **Граф / Graph:** the 250-material visual window remains explicit. Unit measurements cover 100/1,000 isolated nodes; that is not a claim of full 1,000-node browser rendering. Simple dots have a separate touch-hit radius; keyboard access remains through List/Locate. Lifecycle cleanup drains the queued final COSE frame before renderer destruction.
- **Файлы / Files:** stale display is reused only for the same query and authenticated scope, filtered through current authorized metadata; authentication/permission errors discard cached pages. Global and project filter contexts are independent. No permissions checks were removed to achieve continuity.
- **Инциденты / Incidents:** event timestamps and recorded channel information are historical evidence. Configuration readiness never marks delivery resolved. A generic old delivery failure does not identify email versus push; the UI says so rather than guessing.
- **Корзина / Trash:** restoration has a separate preview and repeats parent/ID/permission checks on confirmation. Missing note/bookmark folders fall back to root explicitly; no silent overwrite. Bulk restore is deliberately not added across conflicting destinations: inspect and restore individually. No automatic purge, production restoration or permanent deletion was used in this acceptance.
- **Календарь / Calendar:** layers are synced personal preferences. Task filters apply to tasks; project filters scope every layer. Date-only values remain date-only. Milestone/project markers open their own context and cannot complete tasks.

## Проверки / Acceptance

Проверка выполнена 1 ноября 2026 года. Основной сайт: [smena-manager.vercel.app](https://smena-manager.vercel.app/). Итоговая матрица компоновки проверена на `7c7330e`. После исправлений синхронизации Vercel подтвердил `READY` для `6e07ad7`; граф дополнительно проверен на этой сборке в обоих языках и семи размерах, включая сохранение физики после перезагрузки. Each implementation was committed and pushed separately to `main`; the first-commit table above is not a list of deployment IDs. Later test/documentation commits do not add untested product behavior. Local logs and screenshots live under `output/`, outside versioned source; real team text is not published in Git.

### Основной сайт / Production

- Повторный итоговый обход **17 основных разделов × 2 языка × 7 размеров = 238 состояний**: 320×740, 390×845, 767×1024, 1024×767, 844×390, 1366×767, 1920×1080 CSS px. В каждой строке проверено фактическое содержимое, не экран загрузки. Общего горизонтального переполнения не обнаружено. This measures document reflow; it does not imply every possible internal state is covered.
- Все **18 страниц настроек** просмотрены на обоих языках и семи размерах. Область личных/рабочих настроек, переключатели рядом с подписями и мобильное раскрытие доступны. Настройки доступа, почты, push и резервного копирования не отправлялись.
- База знаний: открытие папок на телефоне, возврат к общему каталогу, быстрый просмотр, Read/Editor, отдельный режим фокуса. В EN textarea проверена на семи размерах; на коротком landscape доступно 222 CSS px для текста. Финальный RU-снимок 390×845 подтверждает заполнение редактором доступной высоты. В режиме чтения источник и форматирование скрыты; текст заметки не менялся.
- Личное избранное: заметка «Тест» добавлена, пережила полную перезагрузку и появилась в общем «Избранном»; затем личная звезда снята. Сам документ и звёзды коллег не изменялись.
- Календарь: все четыре слоя показали разные типы маркеров; настройки пережили обновление. Исходная маска Tasks/Events восстановлена. Этапы и сроки проекта открывают свой контекст, не используют действие завершения задачи.
- Холст: существующие три карточки/две связи, меню More и вложенные раскладки, пустая история, mobile→desktop. Ручной масштаб 25% сохранился; после проверки применён Fit. Карточки, связи и сохранённые раскладки не редактировались.
- Граф: повторные Graph/List и уход/возврат, 28 материалов/18 связей, простой вид/физика, инспектор и режим фокуса. После исправления на 390×845 у canvas осталось 354 CSS px высоты, у инспектора 255 px; первичное действие видно без раскрытия длинного описания. Переключатель взаимодействия находится вне canvas. По завершении восстановлены Graph и обычный режим.
- Файлы: каталог из трёх загруженных файлов, переход из проектных файлов в общий каталог и независимый контекст фильтров; проверены семь размеров. Архив: поиск служебной записи и предпросмотр восстановления закрыты без подтверждения.
- Полные обновления сохранили авторизованную сессию. Возвращены русский язык, светлая тема, исходные календарные слои и отсутствие тестовой звезды. Во время последовательных публикаций старые lazy chunks иногда отвечали 404; штатное «Обновить приложение» восстановило загрузку с сохранением сессии. Это не результат «в консоли никогда не было ошибок».

### Изолированные проверки / Isolated verification

| Проверка / check                                                                          | Результат / result                                                                                                 | Локальный журнал / local log              |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| Полный server/shared набор                                                                | **608 passed, 0 failed**; импорт, личные настройки, граф, ACL и восстановление                                     | `output/audit40-server-final.log`         |
| ESLint                                                                                    | Passed                                                                                                             | `output/audit40-lint-final.log`           |
| Production build / entry budget                                                           | Passed; 565.5 KiB initial JavaScript against 600 KiB budget                                                        | `output/audit40-build-final.log`          |
| RU/EN responsive, Select/background redraw, palette, folders, editor/save/history/offline | **4 passed**                                                                                                       | `output/audit40-browser-repeat.log`       |
| Самостоятельные холсты и multi-select/alignment/clipboard/undo/persistence                | **2 passed**; layout case rerun separately below                                                                   | `output/audit40-whiteboards-repeat.log`   |
| Личные раскладки, камера, pins, filters и изоляция аккаунта                               | **1 passed** after menu/toolbar fixes                                                                              | `output/audit40-layouts-accepted.log`     |
| Импорт 200 TXT, retry, личная звезда, фокус и слои календаря                              | **1 passed**                                                                                                       | `output/audit40-persistence-accepted.log` |
| Chromium/Firefox/WebKit: creation menus and core task/session flow                        | All six scenarios passed within the combined run; its historical WebKit graph failure was fixed and retested below | `output/audit40-engines-final.log`        |
| Graph: RU/EN, 100 materials, physics/simple mode, reload, forced 409 refresh              | **3 passed** on Chromium, Firefox and WebKit                                                                       | `output/audit40-graph-three-engines.log`  |

Дополнительно прошли проверка разрешения всех CSS custom properties (`output/audit40-tokens-final.log`), форматирование изменённых файлов и 14 целевых тестов координации личных настроек, повторов чтения и графовых прав (`output/audit40-graph-retry-unit.log`). Итоговая геометрия сохранена в `output/audit40-proof/final-matrix.json`; кроме основной матрицы там есть 14 повторных состояний графа на последней сборке.

The 200-file browser scenario stages the complete intake, simulates a failed atomic POST, checks that nothing was published, retries successfully and verifies persistence after reload. A duplicate-only batch leaves confirmation disabled. Shared note data remains byte-equivalent after a personal favorite toggle. This is isolated local data, not a 200-file import into the team's production workspace.

During acceptance, actual regressions were corrected: mobile inspector consuming the graph, restored whiteboard camera reverting to fit, nested menus closing their parent, 320px toolbar hiding More, folder count hint reducing list space, and source formatting remaining available in Read. Follow-ups include `aff7389`, `c640cc7`, `d8d48c9`, `2154e0b`, `5c3095f`, `7c7330e`, `aa8983d`, and `6e07ad7`. The last two cover queued preference journals and one guarded graph-read revision refresh; server fences remain enforced. Older failed logs remain diagnostic evidence; use the final/targeted result for each scenario, not a claim that every historical run passed.

No new shared production imports, restores, backup jobs, emails, push sends or permission changes were used to obtain this result. Version restoration, conflicts, permissions and account isolation are exercised in isolated fixtures. Production history inspection alone does not establish a successful new restore.

## Непроверенное на реальных устройствах / Remaining physical acceptance

Физических iPhone/iPad/Android сейчас нет. Жесты, экранная клавиатура, safe-area реального устройства, PWA/offline, блокировка экрана и скачивания в мобильном Safari остаются отдельной приёмкой. Responsive browser sizes do not replace those checks.

Production uses the available owner's session. Independent member/guest behavior and destructive/conflict workflows are checked in isolated fixtures, not by changing real team permissions. No emails/push, cron, retries, new backups, shared imports or recovery operations are triggered merely for this UI audit.
