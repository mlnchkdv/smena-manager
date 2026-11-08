# Проверка знаний / Knowledge reviews

## Русский

В открытой заметке выберите **Действия с заметкой → Проверка заметки**.
В редакторе команда находится в меню дополнительных действий рядом с историей
версий. Обычное чтение не меняет статус и не создаёт запись в журнале.

Ответственный за актуальность или администратор может выбрать ответственного,
дату пересмотра и запросить проверку у 1–5 действующих участников с правами
редактирования. Для новой заметки исходным ответственным считается её автор;
старые заметки без действующего автора получают ответственного при настройке.
Запрос доступен владельцу знания и администратору, решение — назначенным
проверяющим с действующими правами редактирования. Администратор не подменяет
решение другого проверяющего. Самопроверка разрешена и записывается под своим именем.

Назначенный проверяющий может подтвердить версию или запросить изменения.
Для запроса изменений обязательно пояснение, до 1 000 символов. Для общего
подтверждения версии нужны положительные решения всех назначенных проверяющих.
Текущий запрос и журнал показывают, кто принял решение и когда. Запросы хранятся
в приложении; отдельная доставка уведомлений по Gmail/push здесь не подключается.

Согласование относится к точной версии текста, описания, тегов, расположения,
типа/свойств, aliases, ссылок на материалы, формата TXT/Markdown и имени
импортированного источника. Сервер проверяет полный SHA-256; в окне для чтения
показан короткий префикс. Клиент сравнивает его с загруженной заметкой перед
доступом к решениям. Время сохранения и сам статус проверки не меняют этот hash.

После правки статус становится «Содержание изменено». Прежнее решение остаётся
в журнале. Если восстановить **точно** согласованную версию, её согласование
снова распознаётся. Дата пересмотра — отдельный признак актуальности, учитывающее часовой
пояс участника; она не меняет текст и не переписывает прошлое решение.
Версии файлов по ссылкам и содержимое внешних сайтов в это согласование не входят.

Настройки и решения записываются явными кнопками. При неподтверждённом сетевом
ответе можно обновить статус или повторить тот же запрос. Повтор использует
тот же operation ID и не создаёт вторую запись. Конфликт текста/состава проверки
требует обновления состояния. Права заново проверяются внутри границы записи.

Журнал хранит последние **100 событий**, а текущий запрос и последние решения
его проверяющих сохраняются отдельно. Число событий за пределами лимита видно
в интерфейсе. Это отдельный журнал проверки, а не неограниченный архив: обычная
история версий текста остаётся самостоятельной возможностью.

Проверки хранятся в серверных метаданных заметки вместе с её каноническими
резервными копиями и корзиной. Обычное сохранение документа или core-пакета
не может подставить чужое согласование, включая обход через корзину. Переносимая
библиотека при импорте не присваивает чужие решения новым заметкам. Чтение или
проверка одной заметки не требует чтения тел остальных заметок.

## English

In an open note, choose **Note actions → Review note**. In the editor, use its
additional-actions menu beside version history. Reading a note does not alter
review status or add journal events.

The knowledge owner or an administrator can set responsibility, a review date
and request review from 1–5 active editors. New notes default to their author;
legacy notes without an active author receive responsibility during setup.
Only the owner/administrator can request review; only assigned active editors
can decide. Administrators do not impersonate reviewers. Self-review is allowed
and recorded under the actor's own name.

Reviewers approve the version or request changes. A change request requires a
comment of up to 1,000 characters. Approval requires all assigned reviewers to
approve. The current request and journal show actors and timestamps. Requests
are recorded in the application; this feature does not enable Gmail/push delivery.

Approval binds the exact text, summary, tags, location, type/properties, aliases,
material mappings, TXT/Markdown format and imported filename. The server checks
a full SHA-256; the dialog shows a short prefix. The client compares it with the
loaded note before exposing decisions. Save timestamps and review state itself
are outside this hash. Linked file versions and external web contents are not approved.

An edit makes the earlier approval **Content changed** while retaining its
decision. Restoring the exact approved snapshot makes that approval recognizable
again. The review date is a separate due indicator in the member's time zone; it
does not change the text or rewrite a previous decision.

Settings and decisions use explicit save buttons. After an uncertain network
response, refresh status or retry the same operation ID. Exact retries create
no duplicate event. Text/review conflicts require a refresh, and canonical
membership/assignment is rechecked inside the write boundary.

The journal retains the last **100 events**, with an explicit omitted count.
The current request and its reviewers' latest decisions remain separately
available. This is a bounded review journal; ordinary content version history
is a distinct feature.

Review metadata stays with canonical note backups and trash. Ordinary document
or core writes cannot forge it, including via trash. Portable-library import
does not transfer someone else's approval to a newly imported note. Reviewing
one note in split storage does not require reading any other note body.

## Local acceptance / Локальная приёмка

Node 22: 887 server/shared tests passed with ESLint, design tokens and production build (startup 594.3/600 KiB). The subsequent cold-catalog projection change passed 25 targeted tests. Chromium: RU/EN × 320/390/844 landscape/1366, save/reload, stale content, exact restoration and retry after a lost response. Fresh WebKit editor and guest profiles: 12 states each, including dark 390/1366, cold-body menu retention and denied writes. Final Chromium after the catalog change: RU/EN × 320/1366, persisted decisions and stale/restore; modal axe found no violations. Desktop color-contrast remained incomplete and is not accepted as passed. Production, Google delivery and physical devices remain unverified.
