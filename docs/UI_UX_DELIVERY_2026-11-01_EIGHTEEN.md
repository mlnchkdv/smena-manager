# Q01–Q18: внедрение и проверка / Delivery and verification

**1 ноября 2026. Все 18 программных пунктов реализованы, каждый отдельным commit и push в `main`.** Основной сайт проверен на RU/EN, в светлой и тёмной теме. Финальный `/app-version.json` сообщает `b90ebe611b93f23443dcc60e4e8bfa0f2af4e27d`: эта версия содержит все Q01–Q18 и все дополнительные исправления приёмки. После повторного входа обе последние правки отдельно проверены на основном сайте в RU/EN.

**EN. All 18 code items are implemented and individually committed/pushed.** Production build `b90ebe6` includes Q01–Q18 and all acceptance follow-ups. The last two corrections were separately verified live in RU/EN after sign-in was renewed.

Исходные факты и критерии: [аудит Q01–Q18 / original audit](UI_UX_DEEP_REAUDIT_AFTER24_2026-11-01.md). N01–N24 остаются реализованными; этот пакет не повторяет их.

## Изменения / Changes

| ID  | Результат / Result                                                                                                                                                                                                      | Commit    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Q01 | Режимам редактора выделена полная строка на узком экране; подписи не сжимаются. / Full-width mobile editor-mode row.                                                                                                    | `979e17b` |
| Q02 | Подписи свойств задачи получают 128 px в узкой карточке и переносятся по словам. / Readable property-label column.                                                                                                      | `2bf6363` |
| Q03 | Статус и дата закладки отделены от действий; убрано принудительное обрезание статуса. / Separate metadata and action rows.                                                                                              | `160d5b1` |
| Q04 | Толщина связей и стрелок холста компенсирует масштаб; нейтральный цвет читаем в обеих темах. / Zoom-independent edge visibility.                                                                                        | `15c5754` |
| Q05 | Подсказка холста описывает текущий режим жестов и способ вернуть прокрутку страницы. / Mode-specific gesture hints.                                                                                                     | `57fc92e` |
| Q06 | Account в области настроек переводится как «Аккаунт». / Localized account scope.                                                                                                                                        | `39ce83c` |
| Q07 | Компактная мобильная панель выделения: счётчик, перенос, меню остальных действий, сброс; Shift-подсказка скрыта на сенсорном экране. / Compact mobile bulk toolbar.                                                     | `5b8f4b5` |
| Q08 | Личное место чтения для 50 заметок, раздельно по аккаунту и пространству; поиск имеет приоритет; есть «К началу заметки». / Scoped bounded reading positions.                                                           | `d5348a4` |
| Q09 | При текстовом поиске папки становятся свёрнутой навигацией, не отодвигая найденные заметки; предпочтение вида сохраняется. / Secondary folder navigation during search.                                                 | `c09dae0` |
| Q10 | Оглавление исходника Markdown с переходом к позиции текста; учитываются frontmatter, CRLF, fenced code, повторные заголовки. TXT не получает MD-оглавление. / Source-heading navigation without conversion.             | `3a44b75` |
| Q11 | «Показать карточку» доступно прямо в панели выбора холста, используя существующий Locate. / Direct locate from canvas selection.                                                                                        | `8257c46` |
| Q12 | Поиск списка графа занимает полную строку на мобильном. / Full-row mobile graph-list search.                                                                                                                            | `d1c7e53` |
| Q13 | Подписи графа показывают полезный путь, проект или домен; повторы названия и типа убраны; одноимённые материалы различимы доступным именем. / Useful bounded graph-list context.                                        | `abceec4` |
| Q14 | Лично включаемое сворачивание пустых колонок; настройка хранится на устройстве по аккаунту, пространству и виду доски. Навигатор раскрывает любой статус для создания задачи. / Optional personal empty-lane reduction. | `9275471` |
| Q15 | Справка клавиатуры стала компактной двухколоночной; последовательности `G затем H` отличаются от сочетаний. / Compact shortcut reference.                                                                               | `4d66b7e` |
| Q16 | Видно унаследованную общую плотность и локальное переопределение карточек; отдельная кнопка сбрасывает только плотность. / Explicit density inheritance and reset.                                                      | `19923d2` |
| Q17 | Счётчики явно различают страницу каталога, файл на странице и страницы PDF. / Explicit preview-counter scopes.                                                                                                          | `02d321c` |
| Q18 | У файлового поиска вместо `0+` показано «Не проверено»; доступен явный переход к каталогу. / Unsearched file scope is not a confirmed zero.                                                                             | `1f2f959` |

## Исправления, найденные при проверке / Acceptance follow-ups

- `a95f8ec`: меню массовых действий позиционируется над мобильной панелью, а не расширяет узкую кнопку. / Bounded bulk-action popover.
- `f822260`: исходник использует оформление существующего всплывающего оглавления. / Reuse the source-outline popover surface.
- `dfd0fff`: переведена подсказка Enter/Esc у создания задачи. / Localized composer hint.
- `70a4135`: длинный счётчик файлов занимает отдельную строку над мобильными кнопками. / Mobile preview-counter layout.
- `c39d29b`: курсор поискового поля графа сохраняется при смене вида и последующих фоновых ответах, без перехвата фокуса. / Preserve graph-query selection across redraws.
- `eb0cf73`: явные доступные имена команд перехода к заголовку исходника. **Опубликовано и проверено в `b90ebe6`.** / Explicit source-outline action names; published and verified in `b90ebe6`.
- `d06e0ea`: исправлен первый переход из общего поиска в каталог: контекст Files инициализируется до установки запроса. **Опубликовано и проверено в `b90ebe6`.** / Cold search-to-Files context ordering; published and verified in `b90ebe6`.
- `c581890`: `.vercelignore` исключает локальные fixtures, секреты и скриншоты из ручной публикации. / Exclude local-only artifacts from manual deployment.

## Проверки / Verification

**Автоматические / Automated**

- `npm run test:server`: **611/611**, без пропусков. В том числе новые тесты исходных UTF-16/CRLF-позиций и контекста списка графа. / All 611 server/shared tests passed, including the three new source-heading and graph-context tests.
- Финальные `npm run build`, `npm run lint`, `npm run check:tokens`, `git diff --check` прошли. Начальный JS: **586.6 KiB**, бюджет 600 KiB. / Final build, lint, token references and whitespace checks passed.
- Старый `check:ergonomics` не является пройденным: его fixture-сервер на 5194 не запущен. В этом этапе браузерные проверки выполнены через CUA на отдельном credential-free сервере 5199. / The legacy ergonomics runner could not connect to its expected fixture port; it is not counted as a pass.
- Локальный `check:deploy` без production-окружения сообщает отсутствующие настройки. Секреты для этой проверки не извлекались; это не проверка реального окружения Vercel. / Local deployment-config preflight lacks production settings and is not evidence about live configuration.

**Браузер / Browser**

- Сохранено **168 геометрических наблюдений: 138 production и 30 локальных**. В этих замерах нет горизонтального overflow корневой страницы; у измеренных кнопок режимов заметки `scrollWidth` не превышает ширину кнопки. Эти числа относятся к геометрии, а не к количеству проверенных бизнес-сценариев. / Geometry observations are not a count of functional scenarios.
- Основная production-матрица RU/EN: фактические ширины **320, 390, 640, 767, 1025, 1367 px**, низкий landscape **844×390**. Есть дополнительные узкие проверки 300/326 px. Округление около breakpoint сохранено в исходных замерах; 767 px не выдаётся за ровно 768. / Actual observed viewport dimensions are recorded, including rounding and additional narrow stress cases.
- Проверены каталог и редактор знаний, задачи, закладки, список графа, холст, предпросмотр файлов, справка клавиатуры и поиск. RU — светлая тема, EN — тёмная; локально обе локализации также проверены на изменённых контролах. / Both languages and themes were exercised across the affected surfaces.
- Функционально: место чтения и «К началу»; приоритет найденного фрагмента; переход Source к offset 1836 с неизменным исходником; меню массового выбора; сброс только плотности; сохранение настройки пустых колонок после новой загрузки; раскрытие пустого статуса и composer без сохранения задачи; курсор графа `8 → 8` после смены вида; контекст списка без повторов; показ карточки при масштабе 1 без добавления Undo; эффективная толщина связей около 1.6 px при Fit; отдельные счётчики каталога и файла.
- Cold search-to-Files проверен локально после новой загрузки (`catalog`, два изолированных TXT) и отдельно на production в новых RU/EN-загрузках: запрос `ТЕСТ` сохраняется в Files. Новые доступные имена Source-команд также подтверждены в RU/EN: caret 275, нужный заголовок у курсора, исходный текст полностью совпадает до/после. / Fresh RU/EN production sessions passed cold query preservation and explicitly named source-heading navigation without document changes.
- Материалы и права команды не менялись. Новые записи и загрузки выполнялись только в `.data/q18` на локальном сервере без Google/Gmail/Redis credentials. Оставленные ранее production TXT, папки и экспорт не удалялись. / Team content and access were unchanged; mutations were limited to isolated local fixtures.
- Перед окончанием production-проверки возвращены русский язык, светлая тема и исходный табличный вид задач; плотность карточек и режим папок production не менялись. / Personal RU/light/table settings were restored.

Скриншоты и точные размеры — локально `output/q18-implementation/`, вне Git и deploy. / Screenshots and exact measurements remain private local artifacts.

## Публикация и оставшаяся приёмка / Publication and remaining acceptance

Финальная проверка публичного `/app-version.json`: **`b90ebe611b93f23443dcc60e4e8bfa0f2af4e27d`**. Ручная попытка Vercel ранее вернула `api-deployments-free-per-day`, но последующая автопубликация из Git завершилась. В production подтверждены все Q01–Q18, включая `eb0cf73` и `d06e0ea`; оба финальных сценария прошли после повторного входа в RU/EN.

**EN.** Production is verified at `b90ebe6`, including all code corrections. A manual deployment encountered the daily cap earlier; subsequent Git auto-publication succeeded. Both final scenarios passed live RU/EN acceptance. Later documentation-only commits need not change the runtime SHA.

Последняя приёмка: свежая загрузка Search → запрос `ТЕСТ` → Files сохраняет запрос в обоих языках. Source-команды имеют локализованные доступные имена; переход устанавливает caret 275 к выбранному заголовку, исходник до/после идентичен. Записи в материалы команды для этих проверок не требовались.

В конце первого длительного production-прогона сервер вернул `Session expired.`. Пользователь восстановил вход, после чего завершены финальные проверки, включая новые загрузки RU/EN. Возвращены русский язык и светлая тема; срок действия и проверки безопасности сессий не менялись.

**EN.** The initial long-running session expired. The user renewed sign-in, and final checks then completed successfully, including fresh RU/EN loads. RU/light preferences were restored; session-security policy was unchanged.

Физические iOS/Android, экранная клавиатура, жесты настоящего устройства, cross-account/member/viewer production-ACL и запись/восстановление production-материалов этим UI-пакетом не сертифицированы. Existing shared/server ACL tests passed; the viewport run is not a substitute for physical-device or production write/recovery acceptance.
