# Внедрение R01–R31 / Thirty-one-item delivery — 1 November 2026

Все **31 программное изменение** из [повторного аудита](UI_UX_DEEP_REAUDIT_AFTER40_2026-11-01.md) реализованы. Каждая самостоятельная правка опубликована отдельным commit и push; дополнительные исправления приёмки перечислены ниже. Материалы команды при проверке production не изменялись.

**EN.** All thirty-one code items are implemented and individually committed/pushed. This report distinguishes production viewing and interaction, isolated write/permission tests, and outstanding physical-device acceptance. The linked audit is the historical problem statement, not the current missing-feature list.

## Изменения / Implementation

| ID  | Правка                      | Result / behavior                                                                                           | Первый commit |
| --- | --------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------- |
| R01 | Клавиатура модальных окон   | Native summaries participate in focus loops; hidden, inert and closed-detail children do not                | `ff4b262`     |
| R02 | Выбор карточки холста       | Pointer selection renders without moving the card; a 5px threshold separates selection from drag            | `0a4f54d`     |
| R03 | Мобильный инспектор графа   | Normal mode reserves space for primary actions; landscape uses a separate two-column layout                 | `0f66553`     |
| R04 | Прокрутка настроек          | Settings body owns page scrolling; the outer content is bounded and does not scroll                         | `449ef18`     |
| R05 | Камера графа                | Preserve manual zoom and semantic center across resize/remount; explicit Fit remains available              | `efeb712`     |
| R06 | Поиск команд перехода       | Match localized section names as well as inflected command labels                                           | `fc605f1`     |
| R07 | Форматирование Blocks       | Source-only formatting toggle is hidden in Blocks and Read                                                  | `fcbeec2`     |
| R08 | Русские счётчики            | Correct team member/project plurals; explicitly distinguish direct file counts from recursive counts        | `a0fd107`     |
| R09 | Действия выбранной карточки | Open material and edit actions are available outside the scaled canvas world                                | `18d27c8`     |
| R10 | Панель активного блока      | One contextual toolbar, numbered accessible names, disabled move boundaries and focus preservation          | `6b6edc6`     |
| R11 | Список холста               | Search cards and frame titles, collapse containing groups and locate a result on canvas                     | `677c626`     |
| R12 | Жесты холста                | Explicit page-scroll/canvas-pan modes; new mobile/coarse-pointer sessions default to page scrolling         | `6cb45cb`     |
| R13 | Подписи простого графа      | Compensate zoom for bounded selected/neighbour labels as well as point sizes                                | `76e41b9`     |
| R14 | Легенда графа               | Compact explanation of types, connection direction, automatic edges and simplified rendering                | `51813b7`     |
| R15 | Панель папок                | Personal device/workspace/member-scoped visibility and 220–420px width, keyboard range and reset            | `dee7374`     |
| R16 | Путь заметки                | Navigate folder breadcrumbs from reading and editing views                                                  | `cb0fc6d`     |
| R17 | История и исходник          | Reading menu exposes version history and source download; existing guarded restore remains in use           | `f6f4ea9`     |
| R18 | Область сохранённого поиска | Clearly label device-local shortcuts and distinguish them from shared smart collections                     | `459b8c7`     |
| R19 | Плотность карточек          | Inherit interface density unless a personal local override is explicitly selected; support reset            | `5833589`     |
| R20 | Закрытие меню команд        | Named mobile close action; hide desktop-only key hints on narrow screens                                    | `f5ab45c`     |
| R21 | Полный поиск файлов         | Visible continuation to the complete file catalog even when loaded matches are zero                         | `5118930`     |
| R22 | Контекст поиска             | Visible Search heading, consistent category/folder semantics and whiteboard project context                 | `57ea5cb`     |
| R23 | Предпросмотр файлов         | Path and previous/next navigation within current page results; recheck current access and session scope     | `d80e002`     |
| R24 | Статус закладки             | Label processing status as shared by the team, separately from personal favorites                           | `ded3259`     |
| R25 | Большое избранное           | Search, sort and 50-item pages across authorized personal materials                                         | `117baae`     |
| R26 | Длинная активность          | Date range, ordered 50-event pages and result count without deleting history                                | `8a6b991`     |
| R27 | Пустые сроки на главной     | Collapse empty deadline groups into a single useful empty state                                             | `04c9745`     |
| R28 | Статусы проекта             | Comfortable touch targets for status drill-down while retaining compact desktop controls                    | `616d8f4`     |
| R29 | Необязательный срок проекта | Keep an empty date empty through creation/save; remove the implicit thirty-day fallback                     | `5ca6d17`     |
| R30 | Доступные имена             | Avoid redundant avatar names in composed controls; add color/card context and file-preview arrow navigation | `cba789c`     |
| R31 | Мобильное оформление        | Three compact theme choices with one active preview rather than three large preview cards                   | `b234ba4`     |

### Доработки при проверке / Acceptance follow-ups

- `e3eb78e`: переводы новых подписей результатов, сортировки и недоступного материала; переход по пути заметки проверяет несохранённый текст. / Localize new controls and guard dirty-note breadcrumb navigation.
- `4ee63e0`: обзор проекта без срока показывает «Без срока», а не «Завершён —»; добавлен изолированный RU/EN-сценарий создания проекта без даты, файлового preview, избранного и фильтра активности. / Correct the no-deadline overview and cover persistence workflows.
- `0c9733c`: поиск Outline учитывает название самой рамки и показывает её вложенные карточки; счётчик отражает найденные элементы, включая рамки. / Include frame-title matches and their children.
- `4f40fd8`: изолированная проверка предела 200 карточек: 40 рамок и 160 вложенных карточек, RU/EN, четыре размера. / Verify grouped outline search at the document limit.
- `3dec45f`: форматирование исходников исключает весь каталог сгенерированных доказательств `output/`, а не только `output/playwright/`. / Keep generated audit evidence outside source formatting checks.

## Проверка основного сайта / Production acceptance

Авторизованный интерфейс [smena-manager.vercel.app](https://smena-manager.vercel.app/) проверен на русском и английском. Записано **308 замеров 44 состояний**, по семь размеров: 320×740, 390×845, около 767×1024, 1024×767, 844×390, 1366×767 и 1920×1080 CSS px. Дробные CSS-размеры встроенного браузера округлены в этой записи. Это измерения и выборочные взаимодействия, не 308 независимых функциональных тестов.

**EN.** The production matrix covers catalog and nested states, not a new exhaustive audit of every unmodified route. Root width did not exceed the viewport by more than 1px in the recorded rows. Geometry alone does not prove keyboard, scrolling or write correctness; interaction evidence follows.

- **База знаний:** каталог, мобильная панель папок, чтение, редактор, Blocks и история. На русском клавиатурный обход достигает поиска и дерева, а не зацикливается перед ними. Меню истории открывается из чтения в RU/EN; у выбранной существующей заметки предыдущих версий нет. В Blocks нет ложной кнопки форматирования; у первого блока перенос вверх выключен. Скрытие панели папок пережило reload; после проверки выполнен reset ширины/видимости. Текст заметок не менялся.
- **Холсты:** обычный клик показывает выделение и экранные действия; Undo остаётся выключенным, поскольку документ не меняется. Поиск карточки и поиск названия рамки работают, «Найти на холсте» возвращает Canvas. RU/EN-поиск рамки повторён после публикации `0c9733c`. Production-холст небольшой: 3 карточки и 2 связи; сценарий 200 карточек относится к локальному fixture.
- **Граф:** готовый граф из 28 материалов и 18 связей, выбор материала, обычный/фокусный режимы, легенда. На 390px инспектор около 251.8px, его primary-блок около 139px; кнопка открытия помещается полностью. Ручной масштаб после трёх Zoom in и возврата desktop → mobile → desktop визуально сохраняется; парные снимки записаны. Затем выполнен явный Fit.
- **Настройки:** Appearance проверен в RU/EN; внешний `.content` имеет `overflow:hidden`, внутренний `.set-body` — `auto`. Большой `scrollHeight` скрытого внешнего контейнера не означает вторую доступную прокрутку. Мобильные темы показывают компактные варианты и один активный preview.
- **Файлы:** готовы TXT-preview, полный путь проекта/папки, соседние файлы и ArrowLeft. Крайний элемент корректно выключает недоступное направление. Переходы не выполняют загрузку нового каталога целиком; список ограничен разрешёнными результатами текущей страницы. Запись, удаление и явное скачивание production-файлов не запускались.
- **Поиск:** явный полный поиск каталога доступен при нуле загруженных файлов; запрос передаётся в раздел файлов. «Команды» на русском находит переход; скрытое личное избранное доступно из команд. Полная выдача имеет название раздела и контекст заметок/холстов.
- **Проекты, главная, закладки, избранное, активность:** RU/EN × семь размеров. Новая форма проекта открывается с пустой датой и отменяется. Статус обработки закладки явно общий для команды. Лента показывает 50 из 66 событий; будущая начальная дата даёт ноль результатов, очистка возвращает ленту. В production личное избранное пустое; непустое сохранённое избранное проверено изолированно.

После штатного обновления приложения сессия восстановилась. Перед последними проверками сайт отдавал `app-version.json` с commit `0c9733c98e79f5bd3277d5ab8d355d7beb657ba3`; последующий `4f40fd8` изменяет только тест. Read-only Vercel inspect показал production `READY`, deployment `dpl_HbGXsow7UgwcHExhUAYcKMbAfsiP`. Это подтверждение выбранной публикации, не мониторинг uptime.

В процессе серии публикаций старая открытая сборка потребовала штатное обновление из-за заменившихся lazy-чанков. После обновления проверенные разделы открылись; итоговое чтение warning/error-журнала временной вкладки вернуло пустой список. Это не утверждение об отсутствии любых ошибок за всю историю сайта или во всех серверных логах.

Локальные доказательства находятся в `output/reaudit31/`: `matrix.json`, RU keyboard-focus log, снимки 390/1366px, парные снимки камеры. Каталог `output/` в Git не добавлен.

Проверка Prettier прошла после исключения сгенерированных доказательств; журнал — `output/reaudit31-format-final.log`. Двуязычные пользовательские инструкции обновлены вместе с этим отчётом.

## Автоматические проверки / Automated verification

Изолированный Playwright использует отдельные локальные данные; конфигурация обнуляет Google/Gmail/Redis/VAPID credentials. Реальные Drive-материалы, письма, push, cron и резервные копии этими сценариями не затрагиваются.

| Проверка                                                                | Результат / result                                                                                                      | Локальный журнал                        |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Server/shared                                                           | 608 passed, 0 failed                                                                                                    | `output/reaudit31-server.log`           |
| Knowledge save/history/search + whiteboard persistence/access, Chromium | 2 passed                                                                                                                | `output/reaudit31-browser.log`          |
| Core task flow + simplified graph, Chromium/Firefox/WebKit              | 6 passed                                                                                                                | `output/reaudit31-engines.log`          |
| Optional deadline, file preview, favorites and activity, RU/EN          | 1 passed                                                                                                                | `output/reaudit31-additional.log`       |
| Whiteboard save/layout/permissions after frame-search fix               | 1 passed                                                                                                                | `output/reaudit31-whiteboard-final.log` |
| 200-card grouped outline, RU/EN, 320/390/844/1366                       | 1 passed; frame match includes four children, child match retains frame, no-match state and unchanged document verified | `output/reaudit31-capacity.log`         |
| Russian responsive route sweep, three engines × five sizes              | 15 passed (13.1m)                                                                                                       | `output/reaudit31-ui.log`               |
| ESLint                                                                  | passed                                                                                                                  | `output/reaudit31-lint-final.log`       |
| UI token references                                                     | passed                                                                                                                  | `output/reaudit31-tokens.log`           |
| Build and entry budget                                                  | passed; 568.7KiB / 600KiB                                                                                               | `output/reaudit31-build-final.log`      |

Серверные 409 при конкурирующих изолированных сохранениях и ожидаемый 403 при запрещённой записи холста не объявлены продуктовым сбоем: сценарии проверяют итоговое сохранение и отклонение запрещённой операции. Последний whiteboard-прогон прошёл после доработки поиска. Числа в таблице — результаты отдельных запусков; повтор одного сценария не является новым уникальным тестом.

Vite по-прежнему предупреждает о чанке entry больше 500kB и смешанном static/dynamic import `workspace-size.js`; установленный проектом предел 600KiB проходит. Исторический `check:ergonomics` не принят этим прогоном: он требует отдельно запущенный Layout QA fixture на порту 5194, а без него завершился `ERR_CONNECTION_REFUSED`. Это не production-ошибка и не успешная проверка. Вместо него есть production-матрица и актуальные изолированные сценарии выше.

## Что остаётся проверить / Explicit remaining acceptance

- Реальные iPhone/iPad Safari и Android Chrome: прокрутка/панорама/щипок, экранная клавиатура, фокус при её открытии, блокировка экрана и длинные передачи. Код R12 реализован, **физическая приёмка остаётся открытой**; responsive desktop и WebKit не заменяют устройство.
- Полный скринридерный/WCAG-аудит, все контрастные пары и масштаб 200–400%. Точечные исправления имён и Tab не являются сертификацией доступности.
- Production-запись текста/restore версии и межаккаунтная проверка в роли обычного участника не повторялись на материалах команды; сохранение, конфликтные пути и запрет записи проверялись на изолированных данных.
- Стресс-производительность тысяч материалов и FPS диаграмм не измерялись. 200-card fixture подтверждает поиск/группировку/неизменность документа на поддерживаемом пределе холста, а не общую нагрузочную сертификацию.

**EN.** No material edits, restores, deletions, notifications or cron jobs were run against production. Only personal language and view preferences were temporarily changed; Russian/light appearance and the folder-pane defaults are restored. Hardware gestures, exhaustive accessibility, production write recovery and large-workspace performance remain explicitly unclaimed.
