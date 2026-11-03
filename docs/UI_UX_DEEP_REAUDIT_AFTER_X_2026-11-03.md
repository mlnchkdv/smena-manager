# UI/UX re-audit after X01–X16 / Повторный аудит после X01–X16

**Dates / Даты:** 2–3 November 2026. **Site / Сайт:** <https://smena-manager.vercel.app/>. **Audit baseline:** application `0a3b76d`, repository HEAD `58bca0a`. **Final application after six requested corrections:** `d8b9676`.

**Status update / Статус:** Y01–Y11 subsequently implemented and published as application `5559b3d`. [Delivery, production acceptance and limits / Внедрение, проверки и ограничения](UI_UX_DELIVERY_2026-11-03_ELEVEN.md). The findings and pending wording below describe the original audit baseline, not the final application. / Формулировки исходного плана ниже сохранены как историческая точка сравнения.

## Conclusion / Вывод

**RU:** В просмотренных сценариях новых блокирующих проблем интерфейса не обнаружено. Следующий пакет содержит **11 задач: три воспроизведённых дефекта, одну проблему доступности по исходному коду и семь UX-предложений**. Это план; он ещё не внедрён. Исправления шести отдельных запросов пользователя уже опубликованы и описаны в [отчёте о выполнении](UI_UX_FOLLOWUP_2026-11-03.md).

**EN:** No new blocking UI problem was observed in the inspected scenarios. The next package contains **11 pending items: three reproduced defects, one source-supported accessibility issue and seven UX proposals**. The six additional user-requested fixes are already published; see [delivery and acceptance](UI_UX_FOLLOWUP_2026-11-03.md).

Приоритет P2 ниже означает заметную ошибку взаимодействия или доступности. P3 означает улучшение эффективности и ясности интерфейса. Предложения не следует выдавать за потерю данных, нарушение доступа или неисправность уже существующей возможности.

## Scope and evidence / Охват и доказательства

Проверка выполнялась через штатный авторизованный интерфейс владельца. Основной охват — RU/EN на **390 × 844** и **1366 × 767 CSS px**. Дополнительно проверялись **320 × 567, 767 × 900, 844 × 390, 1024 × 767, 1920 × 1080**. Размеры обозначают фактически измеренный CSS viewport, а не физическое разрешение дисплея.

| Area / Область                   | Coverage / Охват                                                                                                                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main sections / Основные разделы | Home, Inbox, My tasks, Favorites, Notifications, Overview, Projects, Files, Tasks, Calendar, Timeline, Knowledge, Bookmarks, Whiteboards, Graph, Members, Activity, Archive, Settings; RU/EN at mobile and laptop sizes |
| Project / Проект                 | Overview, Board, List, Table, Calendar, Timeline, Files, Activity; RU/EN at laptop size                                                                                                                                 |
| Settings / Настройки             | All 18 sections in RU/EN on mobile; selected desktop sections, personal/workspace scope indicators                                                                                                                      |
| Knowledge / База знаний          | Catalog, mobile folder navigator, note reader, Markdown rendering, editor opened without typing, compact type dialog opened/cancelled                                                                                   |
| Graph / Граф                     | Display/physics controls, material location, selection, real native cluster drag, retained renderer, responsive sizing, reload/session restoration                                                                      |
| Search and forms / Поиск и формы | Palette, full search results, task open/close; workspace/project create forms opened/cancelled at 320 px                                                                                                                |
| Final checks / Финальная приёмка | Files, Knowledge and Whiteboards across seven sizes in both languages; selected graph/overview checks; 50 ready geometry observations without root horizontal overflow                                                  |

Это не полный перебор каждого действия на каждом разрешении. Состояния загрузки не засчитывались как готовый интерфейс. Горизонтальная прокрутка внутри специально предназначенной таблицы не является корневым overflow. Некоторые попытки получить скриншот завершились ошибкой захвата и не использовались для визуальных выводов.

Production data was read only. Personal language and display settings were temporarily exercised and restored. No team content, note type, file, relation, permission, delivery or backup was changed. The graph drag changed only unsaved local geometry. Physical devices, a screen reader, 200% text and production member/guest sessions were not available for acceptance. Large-model unit tests are not large-production-browser performance tests.

## Already corrected in this pass / Уже исправлено в этом проходе

1. Account avatar remains visible in the collapsed sidebar / Аватар виден в свёрнутом меню.
2. Portfolio height follows its table; deadlines do not break across lines / Портфель не растягивается пустотой.
3. File format badges and glyphs have stable dimensions / Значки файлов больше не вытягиваются.
4. Note type is a compact badge with a focused dialog / Тип заметки выбирается через компактную кнопку.
5. Whiteboard favorite/menu actions are grouped below the thumbnail / Звёздочка холста закреплена в строке действий.
6. Unchanged graphs retain their renderer; dragging with physics pulls the loaded connected component / Устранены лишние пересоздания графа и добавлено упругое следование кластера.

These are delivered changes, **not** pending Y items. Commit mapping, tests, production observations and limits are in the [delivery report](UI_UX_FOLLOWUP_2026-11-03.md).

## Pending package Y01–Y11 / Следующий пакет

### Y01 — Keep the activity period open / Сохранять раскрытие периода активности

**P2 · Reproduced in production RU/EN.** В «Активности» после заполнения первой даты панель «Период» закрывается, фокус теряется и оказывается на BODY. Для второй даты приходится снова раскрывать панель. Это особенно неудобно с мобильной клавиатурой и при вводе с клавиатуры.

`src/pages/activity.js` перерисовывает страницу при изменении `actFrom`/`actTo`; открытое состояние `details.activity-date-options` не сохраняется. Сохранять раскрытие и осмысленный фокус через обновление результатов. Быстрые периоды должны подчиняться той же модели поведения.

**Acceptance / Приёмка:** RU/EN, 320/390/1366; ввести обе даты подряд без повторного открытия; Tab не возвращается в начало страницы; результаты обновляются; reset корректно очищает значения и восстанавливает предсказуемый фокус. Не менять включительность границ периода.

### Y02 — Explain an invalid activity range / Явно показывать ошибочный период

**P2 · Reproduced in production RU/EN.** Ручной период **2026-11-15 → 2026-11-01** выдаёт пустой список как обычный результат поиска. Непонятно, что даты перепутаны. Нативные `min`/`max` не заменяют валидацию состояния фильтра.

Проверять порядок дат до фильтрации. Показывать локализованную ошибку рядом с полями, связать её через `aria-describedby`, сохранить введённые значения и дать одно понятное действие исправления/сброса. Не переставлять даты молча.

**Acceptance:** невозможный диапазон не маскируется сообщением «нет событий»; ошибка читается скринридером, исчезает после исправления; одинаковые даты допустимы; крайние дни периода и локальные часовые границы не теряются.

### Y03 — Merge duplicate timeline date headings / Убрать повторяющиеся даты хронологии

**P3 · Reproduced in production RU/EN on mobile.** При переходе к дате существующего события мобильная хронология показывает два одинаковых заголовка дня: маркер перехода и заголовок группы. В исходнике `src/views/timeline.js` они строятся независимо. Для даты без события появляется отдельный заголовок якоря, который можно принять за дату следующего материала.

Объединить якорь фокуса с заголовком группы, если даты совпадают. Для отсутствующей даты показать краткое обозначение ближайших событий, не подписывая их чужой датой. Сохранить существующие фокус, пагинацию и переход «Сегодня».

**Acceptance:** один заголовок на один день; переход к дате с событием, между событиями и после последнего события; RU/EN, 390 и горизонтальный телефон; задачи и этапы не меняют свои даты.

### Y04 — Unify palette selection semantics / Согласовать выделение в палитре команд

**P2 · Source-supported accessibility issue; not a proven wrong-result production bug.** `mouseover` в `src/actions/events.js` меняет `S.ui.palette.hl` и CSS-класс строки, но не обновляет `aria-selected` и `aria-activedescendant` одновременно. Визуальное и озвучиваемое выделение могут различаться до следующей перерисовки.

Сделать единый способ обновления выделения для мыши и клавиатуры: актуальный индекс, ровно одна выбранная строка, активный descendant существующего поля поиска. При смене набора результатов не оставлять ссылку на исчезнувший DOM id. Не перерисовывать поле на каждое движение указателя.

**Acceptance:** RU/EN, поиск материалов и команд, ArrowUp/Down, Enter/Escape, hover и новый запрос; CSS/ARIA указывают на одну строку. Отдельно выполнить проверку со скринридером. Наблюдения этого аудита не доказывают, что production открывает «не тот результат».

### Y05 — Reduce mobile knowledge chrome / Упростить верхнюю панель базы знаний

**P3 · UX proposal based on measured layout.** На телефоне до первой заметки последовательно идут создание/импорт, типы, инструменты, вид, поиск, фильтры и выбор. В наблюдении 390 px первая карточка начиналась примерно на y=319 px. Горизонтальная компоновка уже компактнее; её не следует ухудшать общим правилом.

Оставить один основной вход «Новая заметка», поиск и понятный доступ к папкам. Редкие операции импорта/администрирования собрать в одном вторичном меню. Активные фильтры должны оставаться видны, даже если их настройка скрыта. Не уменьшать текст и зоны нажатия ради экономии высоты.

**Acceptance:** сравнить высоту до первой заметки на 320/390/844 landscape; 44 px мобильные цели; новая заметка, импорт TXT/MD, фильтры, View и массовый выбор доступны без поиска по нескольким меню; RU/EN не обрезает названия основных действий.

### Y06 — Simplify the mobile folder navigator / Сделать навигатор папок спокойнее

**P3 · UX proposal.** У навигатора уже есть поиск, полные пути, недавние папки, раскрытие/сворачивание и ограниченное окно строк. Повторно добавлять эти возможности не нужно. Пространство расходуют постоянное пояснение о счётчиках, дополнительная секция недавних и несколько вложенных поверхностей вокруг дерева.

Перенести статическое пояснение в явную справку, не показывать пустую вспомогательную секцию, выделить текущую папку/путь и оставить компактные действия дерева в одном месте. Счётчики вложенных заметок должны сохранить нынешний смысл. Не менять иерархию автоматически.

**Acceptance:** текущая папка различима без чтения всей ветки; поиск и возврат в исходную ветку сохраняют раскрытие и прокрутку; длинные одноимённые папки различаются по пути; проверить большой изолированный набор, 200-строчное окно, 320/390, RU/EN и клавиатуру. Новая массовая реорганизация папок не входит в задачу.

### Y07 — Give file locations enough width / Выделить место расположению файла

**P3 · Observed truncation, no data defect.** На промежуточной ширине 1024 px три карточки примерно по 221 px оставляют слишком мало места папке в нижней строке: даже конечное имя обрезается до нескольких символов. Полный путь уже доступен, а leaf-first отображение реализовано ранее.

Пересмотреть распределение ширины: отдельная строка расположения либо более подходящий порог двух колонок. Звёздочка и меню должны сохранять доступные зоны нажатия. Не делать карточку выше без сравнения плотности всего каталога.

**Acceptance:** 767/900/1024/1366, RU/EN, длинные папки и файлы, grid/list; название конечной папки полезно для различения карточек, полный путь доступен, действия не перекрывают текст и не открывают файл случайно.

### Y08 — Clarify notification settings / Сделать настройки уведомлений обозримее

**P3 · UX proposal, not a delivery failure finding.** Личные параметры распределены между «Упоминаниями», «Назначениями», «Эл. почтой» и «Уведомлениями браузера». Последний раздел также содержит подключение устройства и диагностику пространства. Различия областей настроек уже обозначены, но общую картину трудно быстро проверить.

Добавить компактный обзор «событие × канал» либо краткую сводку текущих каналов с переходами в подробности. Диагностику и тестовые инструменты раскрывать отдельно. Не включать новые каналы автоматически и не менять фактические правила доставки ради визуального объединения.

**Acceptance:** пользователь понимает, что включено лично у него, а что относится к пространству; текущие переключатели и проверки прав сохранены; RU/EN mobile/laptop; не отправлять тестовое письмо/push при обычном открытии настроек. Реальная доставка — отдельная проверка.

### Y09 — Search settings / Добавить поиск по настройкам

**P3 · Findability proposal.** Восемнадцать разделов требуют знания названия нужной категории; на телефоне используется выбор раздела. Текущие группы и прямые переходы полезны и должны сохраниться.

Добавить поиск по локализованным названиям и понятным синонимам («сессии», «часовой пояс», «push», «резервная копия»). Результат должен вести в конкретный раздел/параметр, объяснять личную или общую область и не предлагать недоступные действия. Не заменять существующую навигацию ещё одним обязательным селектором.

**Acceptance:** RU/EN запросы, нулевой результат, клавиатура, 320/390/1366; переход к найденному параметру, Back и активный раздел работают; скрытые по правам функции не становятся доступными через поиск.

### Y10 — Orient users in the simplified graph / Добавить ориентиры упрощённому графу

**P3 · UX proposal.** Упрощённый вид без выделенного материала показывает немаркированные точки. Это ожидаемая минималистичная визуализация, однако при общем обзоре сложнее понять, где какой кластер. Подписи выбранных соседей и легенда уже существуют; не нужно включать все названия сразу.

Предложить несколько приоритетных подписей якорей проектов/кластеров с учётом пересечений либо отдельную настройку таких подписей. Сохранить действительно упрощённый режим, масштабирование, locate и список как альтернативу. Это отдельная задача после уже исправленных физики и пересоздания поверхности.

**Acceptance:** маленький и большой изолированный граф, RU/EN, 390/1366, светлая/тёмная темы; подписи не перекрывают друг друга и не превращаются в стену текста; выбор/перетаскивание не сбрасывают камеру; отсутствие подписи не скрывает материал из списка.

### Y11 — Group repetitive activity without losing detail / Сгруппировать повторяющуюся активность

**P3 · UX proposal.** В ленте и на главной последовательные изменения одного материала одним участником занимают отдельные строки с повторением контекста. Сейчас группировка преимущественно по дням. Для плотной работы это снижает обзорность.

Прототипировать необязательную компактную группу близких событий одного объекта и автора с раскрытием полного списка. Сохранить исходные id, точные даты, комментарии и полный журнал. Не объединять разные пространства, непрочитанные предупреждения безопасности и события разных объектов. Временное окно группировки выбрать после сравнения прототипа.

**Acceptance:** группа раскрывается в те же события в том же порядке; поиск/фильтры и ссылки на конкретное событие работают; RU/EN, 390/1366; никакие события не удаляются из хранения, не помечаются прочитанными автоматически и не теряют автора.

## Section-by-section outcome / Итог по разделам

| Section / Раздел                                   | Outcome / Результат                                                                                                                             |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Home / Главная                                     | Existing task/team views and empty states usable; Y11 is an optional density improvement. / Y11 — предложение по плотности ленты.               |
| Inbox / Входящие                                   | List/detail, categories and compact navigation inspected; no new mandatory fix identified. Delivery itself was not retested.                    |
| My tasks, Favorites / Мои задачи, Избранное        | Open/filter/navigation inspected; no new mandatory change found in the checked state.                                                           |
| Notifications / Уведомления                        | Existing read-state and settings entry points inspected; no actions that change unread state were run. Y08 concerns settings clarity.           |
| Overview / Обзор                                   | Portfolio height/date issue corrected; summaries inspected in RU/EN.                                                                            |
| Projects / Проекты                                 | Catalog opening and eight project tabs inspected; no new required redesign found. Create form opened/cancelled.                                 |
| Tasks / Задачи                                     | Board/list/table access and task open/close inspected; business edits and drag-status writes not performed.                                     |
| Calendar / Календарь                               | Responsive calendar/agenda inspected; no new mandatory issue found. Native device gestures remain separate.                                     |
| Timeline / Хронология                              | Y03 duplicate mobile date heading reproduced. Project milestone filtering remains implemented; no new cross-project leak observed in this pass. |
| Files / Файлы                                      | Format badges corrected; Y07 intermediate-width location allocation. Catalog reads only; no new upload/download acceptance.                     |
| Knowledge / База знаний                            | Type chooser simplified; Y05/Y06 mobile chrome and folders. Reader/editor inspected without writing note content.                               |
| Bookmarks / Закладки                               | Existing compact cards/search inspected; no new mandatory change found in the observed data.                                                    |
| Whiteboards / Холсты                               | Card favorites/menu corrected and mobile spacing accepted; document opened without edits.                                                       |
| Graph / Граф                                       | Renderer retention and connected drag physics corrected; Y10 orientation proposal. No links/materials were written.                             |
| Members / Участники                                | Directory/profile navigation inspected; no role changes.                                                                                        |
| Activity / Активность                              | Y01/Y02 reproduced; Y11 optional grouping. Invalid test filters reset.                                                                          |
| Archive / Архив                                    | Categories and recovery presentation inspected; restore/delete not performed.                                                                   |
| Settings / Настройки                               | All 18 sections inspected; Y08/Y09 proposals; no permission or security changes.                                                                |
| Global navigation/search / Общая навигация и поиск | Collapsed account avatar corrected; Y04 ARIA selection state needs a focused fix.                                                               |

## Suggested order and release checks / Порядок внедрения и проверок

1. **Y01 → Y02 → Y03 → Y04:** reproducible interaction defects and source-supported accessibility consistency, each in a separate commit/push.
2. **Y05 → Y06 → Y07:** mobile content density and intermediate-width layout; compare before/after and preserve accessible targets.
3. **Y08 → Y09 → Y10 → Y11:** progressive disclosure, discoverability and optional density improvements; prototype first where the interaction model is not fixed.

Каждый пункт проверять на обоих языках и по соответствующим размерам. Общая приёмка: отсутствие корневой горизонтальной прокрутки, осмысленный фокус, длинные названия, пустое состояние, текущие права и восстановление после обновления. Запись/удаление материалов на основном сайте — только в отдельно согласованном тестовом сценарии. Не считать ограничение оборудования программным дефектом.

Cross-cutting constraint: the entry JavaScript is **599.9 KiB with a 600 KiB budget**. Use the existing lazy feature boundaries; do not raise the budget to fit convenience helpers. The sidebar regression also illustrates why broad selectors that hide arbitrary descendant spans should be replaced with explicit component targets when touched.

## English handoff / Краткий контекст на английском

| ID  | Priority and evidence       | Pending change                                                                                                       |
| --- | --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Y01 | P2, reproduced RU/EN        | Preserve expanded activity date controls and focus after the first date input.                                       |
| Y02 | P2, reproduced RU/EN        | Validate inverted activity ranges and explain the error instead of showing an ordinary empty result.                 |
| Y03 | P3, reproduced mobile RU/EN | Merge timeline anchor and date-group headings; clarify anchors without events.                                       |
| Y04 | P2, source-supported        | Keep palette visual selection, `aria-selected` and `aria-activedescendant` synchronized across pointer and keyboard. |
| Y05 | P3, UX proposal             | Reduce mobile knowledge toolbar height while retaining primary creation, search and active filters.                  |
| Y06 | P3, UX proposal             | Declutter the existing mobile folder navigator without re-adding already shipped search/path/windowing features.     |
| Y07 | P3, observed truncation     | Give file location labels useful width at intermediate grid sizes.                                                   |
| Y08 | P3, UX proposal             | Make personal notification channels/events understandable at a glance; disclose diagnostics separately.              |
| Y09 | P3, UX proposal             | Add localized settings search and deep links while preserving scope and authorization.                               |
| Y10 | P3, UX proposal             | Add sparse optional orientation labels for simplified graph clusters.                                                |
| Y11 | P3, UX proposal             | Optionally group repetitive activity while retaining every original event and security boundary.                     |

**Historical status at audit time:** these eleven items were pending then; they are now delivered in the linked implementation report. Previous X01–X16 and the six user follow-ups remain delivered. No new production write/restore, physical-device, screen-reader, delivery or multi-user-concurrency acceptance was performed in this audit.
