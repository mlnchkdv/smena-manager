# Сводки связей / Connection summaries

## Русский

В панели «Связи» материала раскройте «Сводка связей». Она показывает число
непосредственно связанных доступных материалов, группировку по виду материала
и типу связи, происхождение связей и известного автора материала. Сводка
свёрнута по умолчанию и доступна также в локальном инспекторе графа.

Для решения, относящегося к задаче, откройте заметку с решением, добавьте связь,
выберите тип «Решение по» и нужную задачу. Решение появится среди входящих
связей задачи. Связь не завершает задачу и не заменяет согласование документа.

Правила подсчёта:

- Права применяются до подсчёта. Закрытые проекты и их материалы не попадают
  ни в строки, ни в итог. Удалённые и отсутствующие материалы исключаются.
- Учитываются прямые связи, включая доступный архив. Транзитивные соседи
  соседей не входят в сводку. Графические линии холста не создают смысловую связь.
- Один материал считается один раз в каждой строке. Строки типов и происхождения
  могут пересекаться, поэтому их сумма может превышать общий итог.
- Сервер считает до ограничения отображения графа в 250 узлов. Список/граф может
  показывать меньше материалов, чем сводка. Клиент со старым полным каталогом
  рассчитывает сводку по этому локальному каталогу.
- «Вручную», «Из текста», «Из проекта или холста» объясняют происхождение.
  Автор последней записи ручной связи ставится сервером. Чтение и изменение
  личных настроек не меняют эту отметку. Старые записи без отметки не получают
  вымышленного автора. Автор материала берётся из его метаданных, если известен.

При сохранении раздельного тела заметки строится индекс явных ссылок, привязанный
к SHA-256 тела: до 512 уникальных ссылок с сохранением вида синтаксиса. Сам текст
не сокращается. При превышении лимита или отсутствии индекса у старой заметки
сводка помечается `≥` и поясняет, что известны не все связи. Открытие сводки
не скачивает и не переиндексирует все старые тексты. Сохранение соответствующей
заметки обновляет её индекс; пакетная обратная индексация пока не подключена к UI.

Локальная приёмка: RU/EN, Chromium и WebKit, 320×567, 390×844, 844×390,
1366×768; выбранные тёмные состояния 390/1366. Сохранение/удаление служебных
связей проверено в изолированном локальном пространстве. Реальный Drive,
production и физические телефоны этой приёмкой не подтверждены.

## English

Expand **Connection summary** inside a material's Connections panel or local
graph inspector. It summarizes directly linked accessible materials by entity
kind, relationship type and provenance, and shows the material author when known.
The summary is collapsed by default.

To connect a decision to a task, open the decision note, add a connection, choose
**Decision for**, then choose the task. The task shows this incoming relationship.
This does not complete the task or approve the document.

Counting rules:

- ACL filtering happens before counting. Hidden projects/materials, missing
  endpoints and deleted relationships do not contribute to totals.
- Only direct connections count, including accessible archived materials.
  Transitive neighbors and decorative canvas lines do not count.
- Each material counts once per row. Type/provenance rows can overlap, so their
  sum can exceed the unique-material total.
- Server totals are calculated before the 250-node display cap. A legacy client
  with a full local catalog calculates its summary from that catalog.
- Manual, text and project/canvas origins explain provenance. The server stamps
  the actor of a manual relationship write; reads and preference changes leave
  the stamp intact. Legacy records are not assigned invented authors. Material
  authorship uses its metadata when available.

Separately stored note bodies receive a SHA-256-bound derived index of up to
512 distinct explicit material/media references, retaining syntax identity.
The original text is never shortened. Older unindexed or capped notes make the
summary a known lower bound, marked `≥` with an explanation. Opening a summary
does not download every old body. Saving that note updates its index; a batch
backfill UI is not yet connected.

Local acceptance covers RU/EN, Chromium/WebKit, 320×567, 390×844, 844×390,
1366×768 and selected dark states at 390/1366. Test-only relationship writes,
reloads and soft removal were verified in isolated local storage. Real Drive,
production and physical phones remain outside this acceptance.
