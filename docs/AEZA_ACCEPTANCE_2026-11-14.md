# Проверка smena.team после переноса / Authenticated acceptance

14.11.2026 проверен основной сайт **https://smena.team** с настоящей Google-сессией
Dmitriy. Использованы существующие материалы пространства. Файлы, заметки,
холсты, права и состав команды не изменялись. Личный язык временно переключён
на English (US) и возвращён на русский; поисковый запрос очищен, выбран список
всех заметок.

## Результаты на основном сайте

| Область      | Что проверено                                                                                                                                                         | Результат                                                            |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Google OAuth | Новый origin сохранён в существующем Web client и остался после повторного открытия Google Console. Пользователь подтвердил настоящий вход.                           | Пройдено                                                             |
| Сессия       | Пользователь подтвердил обновление страницы; дополнительно обновлена прямая ссылка на TXT. После восстановления сессии снова открыт файл без повторного Google-входа. | Пройдено                                                             |
| Файлы        | Каталог из трёх файлов и двух папок, чтение TXT из Google Drive, предпросмотр на десктопе и в мобильной компоновке, доступность нижних элементов при прокрутке.       | Пройдено                                                             |
| База знаний  | Шесть заметок, чтение без редактора, поиск существующего названия, мобильный выбор папки и три результата с учётом вложенных папок.                                   | Пройдено                                                             |
| История      | Открыта история выбранной заметки; сервер вернул корректное пустое состояние.                                                                                         | Пройдено только чтение пустой истории; восстановление не выполнялось |
| Холсты       | Два холста и миниатюры, загрузка сцены с тремя карточками и двумя связями, увеличение/уменьшение и показ всего холста на узком экране.                                | Пройдено                                                             |
| Граф         | 28 материалов и 18 связей, стабилизация расположения, переключение между графом и списком, окно настроек вида/физики.                                                 | Пройдено чтение и навигация                                          |
| Сервер       | Health и SHA релиза, конфигурация входа/Drive; запросы к закрытым API без cookies возвращают 401, ответы не кешируются.                                               | Пройдено                                                             |

Проверки RU/EN проводились в обычном окне Chrome и через его responsive mode:
390×844 для EN и 320×844 для RU. Это эмуляция размеров, а не приёмка физических
iPhone/Android. Горизонтального обрезания основных панелей не обнаружено;
длинные названия сокращаются или переносятся. В браузере также работают
расширения, которые накладывают свои кнопки поверх сайта: их элементы не
относятся к интерфейсу Smena.

## Найденная и исправленная проблема

После выбора раздела в мобильном меню восстановление фокуса возвращало его
в кнопку уже закрытой боковой панели. Chrome сообщал `Blocked aria-hidden`;
пользователь клавиатуры или скринридера мог потерять текущую точку навигации.

В коммите **`db2a122`** переход из меню переносит фокус в содержимое раздела.
При скрытии панели фокус выводится из неё до установки `aria-hidden`, включая
сужение десктопного окна. Закрытие меню через Escape по-прежнему возвращает
фокус на кнопку меню.

Проверка воспроизвела ошибку в Chromium до исправления. После исправления
**Chromium, Firefox и WebKit прошли регрессионный сценарий** на RU/EN при 320
и 390 px: переходы в файлы, базу знаний, холсты и граф, Escape и изменение
размера. Предупреждений `Blocked aria-hidden` в этих сценариях нет. ESLint,
Prettier и `git diff --check` прошли.

Исправление опубликовано на VPS: активный релиз
`db2a122db08c9c2074da64ac611642d473237ae8`. На сервере прошли lint, сборка и
1018 серверных тестов: 1017 успешно, один пропущен, ошибок нет. Публичный smoke
прошёл, SHA frontend и backend совпадают. Сравнение конфигурации не выявило
изменённых значений; все шесть профилей совпадают с исходными.

Финальное обновление открытой вкладки после перезапуска backend не удалось
наблюдать: Computer Use остановил управление из-за ошибки определения URL.
Сохранение сессии после обновления до этого перезапуска проверено успешно.
В последнем снимке после возвращения из узкой компоновки граф показал пустое
полотно; отличить промежуточную отрисовку от устойчивой проблемы не удалось,
поскольку повторная проверка обновлением прервалась. Это остаётся пунктом
повторной приёмки, а не подтверждённым исправленным дефектом.

## Границы проверки

Новые загрузки, редактирование/восстановление версий, массовые операции,
изменение связей, размеров карточек и проверка физики перетаскиванием рабочих
узлов не запускались. Для такой проверки записи нужен изолированный служебный
набор; успешное чтение не доказывает сохранение всех этих операций.

Cron и первоначальная пауза доставки уведомлений сохранены. Gmail/push,
повторная доставка и восстановление резервных копий не запускались.
Постоянные секреты и Google-конфигурация приложения не менялись.

Машинные результаты: [JSON](audits/2026-11-14-aeza-authenticated-acceptance.json).
Публикация сервера: [отчёт](AEZA_PUBLICATION_2026-11-14.md).

## English

The live **https://smena.team** deployment was checked with Dmitriy's real Google
session. Reloading an authenticated file deep link preserved sign-in and loaded
the TXT again. Existing Drive files, note reading/search/folder navigation,
whiteboard scenes/thumbnails/zoom and graph/list rendering worked. The graph
contained 28 materials and 18 connections. Team materials and permissions were
not changed; the personal language was restored to Russian.

Desktop Chrome and responsive emulation covered RU at 320×844 and EN at
390×844. These are browser viewport checks, not physical-device acceptance.
The selected note had no previous versions, so only the empty history response
was verified. Uploads, content edits, restore operations and physics dragging
were not tested in the live team workspace.

Commit **`db2a122`** fixes focus remaining inside the hidden mobile sidebar after
navigation or resizing. A regression failed before the fix; Chromium, Firefox
and WebKit now pass both locales at 320/390 px, including Escape focus return,
without `Blocked aria-hidden` warnings. The fix is deployed; server lint/build
and 1017 passing server tests (one skipped, zero failures) completed, and public
smoke/release checks passed. Configuration and all six profiles are unchanged.

The final browser reload after the backend restart remains unconfirmed because
Computer Use stopped when it could not determine the browser URL. A final
desktop-return snapshot also showed a blank graph canvas; transient versus
persistent rendering could not be determined before that interruption. Earlier
authenticated reload and graph/mobile checks passed. Recheck these two final
observations before treating acceptance as complete. Cron and notification
delivery remain paused as configured during cutover.
