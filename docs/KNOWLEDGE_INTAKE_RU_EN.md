# Командный разбор / Team intake

## Русский

В базе знаний откройте **Инструменты → Командный разбор**. Эта же команда
есть в умных подборках панели папок и в дополнительных действиях заметки.
Очередь общая для пространства и отделена от личных входящих уведомлений.
Показывает по 25 материалов, поддерживает открытые/разобранные материалы,
назначение «мне» и поиск по названиям, описаниям и тегам.

Быстрый сбор создаёт заметку «На разбор». Обычную заметку можно явно добавить
из её окна разбора. Выберите действующего участника с правом редактирования
и нажмите «Назначить». Ответственный или администратор может завершить разбор;
гость может читать состояние, но не менять его. Администратор может передать
ответственность, в том числе за закрытый материал, если прежний участник ушёл.

Доступны четыре итога:

- **Оставить в базе знаний** — заметка принята как материал знаний.
- **Передать в проект** — сохраняется ссылка на доступный для редактирования
  проект. Заметка остаётся общей для пространства: права не сужаются, задача
  и вторая копия автоматически не создаются.
- **Дубликат** — найдите и явно выберите оригинал, добавьте пояснение. Поиск
  использует названия и индексированный текст; совпадение само по себе не
  доказывает дубликат. Выдача ограничена первой страницей (до 60 заметок);
  уточните запрос, если оригинал не попал в неё. Автоматического слияния нет.
- **Не требует работы** — необходимо пояснение. Материал не удаляется.

Перед решением можно прочитать заметку. Закрытый материал можно вернуть на
разбор; исходное решение остаётся в журнале. При снятии доступа к проекту
ссылка и его идентификатор скрываются от участника в ответе API. При удалении
оригинала дубликата показывается недоступность цели.

Ответственность и исход живут отдельно от текста и истории его версий.
Восстановление текстовой версии не стирает решения разбора. Старое поле
`captureStatus` поддерживается для материалов до этой функции; после начала
разбора его место в подборках определяется каноническим состоянием очереди.

Сервер перепроверяет членство, роль, ответственного, цель и ревизию при записи.
Конфликт требует обновить окно. При неопределённом сетевом ответе можно
повторить тот же запрос — в пределах сохранённого журнала это не создаёт
дубликат события. Журнал хранит последние 50 событий и число пропущенных.
Слишком старый повтор отклоняется как конфликт, а не исполняется заново.
Это журнал решений внутри приложения; Gmail и push этим этапом не включаются.

Каталог переносит только небольшой статус, ответственного и дату, а журнал
загружается по запросу. При разделённом хранении операции разбора не читают
тела заметок. Поиск дубликатов использует производный индекс. Канонические
копии/корзина сохраняют журнал; переносимый импорт новой заметки не принимает
чужую историю разбора или согласований.

## English

In Knowledge base, open **Library tools → Team intake**. The command is also
available in the folder pane's smart collections and a note's extra actions.
This shared workspace queue is separate from personal notification Inbox.
It pages 25 materials at a time, with open/resolved, assigned-to-me and
title/summary/tag filters.

Quick capture creates a material to process. An ordinary note can be explicitly
enrolled from its intake dialog. Assign an active editor. Only its responsible
member or an administrator manages a claimed material; guests can read it.
Administrators can reassign closed materials, including after a member leaves.

Four outcomes are available:

- **Keep as knowledge** accepts the note as knowledge.
- **Hand off to project** records an editable project's link. The note stays
  workspace-shared: no permission narrowing, task or second copy is implicit.
- **Duplicate** requires an explicitly selected original and a reason. Search
  includes indexed text; suggestions are not proof of equality. Only the first
  page of up to 60 matches is shown; refine the query if necessary. Nothing is
  automatically merged or deleted.
- **No action needed** requires a reason and retains the material.

Read the note before deciding when necessary. Reopen a resolved item while
retaining its prior journal. Revoked project access redacts the target ID/link
from that member's API response; a deleted duplicate target is unavailable.

Responsibility and outcomes are separate from source text/version history.
Restoring a text version does not erase intake decisions. Legacy `captureStatus`
is supported, while managed materials use canonical intake state in collections.

Canonical membership, roles, responsibility, targets and intake revision are
rechecked inside the write boundary. Refresh after conflicts. An uncertain
response can be retried with the same operation ID, without another event while
that event remains in the bounded journal. Older retries fail as conflicts.
The last 50 events and omitted count are retained. Gmail/push delivery is not
enabled by this feature.

Cold catalog rows carry only status, responsibility and timestamp; journals load
on demand. Split-storage intake operations read no note bodies. Duplicate search
uses the derived index. Canonical backups/trash retain decisions; portable note
copies discard foreign intake/review journals.

Queue filters are remembered in memory for the current browser/account/workspace context, not synchronized across devices. / Фильтры очереди удерживаются в памяти текущего браузера, аккаунта и пространства, а не синхронизируются между устройствами.

Local acceptance: Node 22 code gate 892/892, lint/tokens/build, startup 594.7/600 KiB; Chromium RU/EN × four viewports plus final compact 320/1366; WebKit guest/editor 12 states each. No modal axe violations; four editor contrast results at 390 remained incomplete. Production/Google/physical devices are not accepted by these local tests.
