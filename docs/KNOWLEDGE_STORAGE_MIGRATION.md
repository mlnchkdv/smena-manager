# Knowledge storage split / Разделение хранилища знаний

Status: **A06 foundation, not an enabled migration**. The production workspace format and browser loading path have not changed. No migration endpoint is exposed. Do not call A06 complete until the acceptance gates below pass.

## Русский

Текущая история A05 уже хранит неизменяемые версии отдельно. Следующий шаг A06 отделяет **актуальный текст** от каталога заметок. Хранилище остаётся Google Drive; локальный провайдер нужен для разработки и тестов. PostgreSQL не требуется.

Формат тела: JSON `smena-knowledge-body-v1`, содержащий ID заметки и исходный `formatted_markdown`. Имя объекта вычисляется по SHA-256 всех сериализованных байтов. Каталог получает `bodyRef: {kind, sha256, bytes}` и сохраняет остальные поля, включая стабильные ID, ссылки на блоки, папки и индекс истории. Текущий предел одного объекта — 8 МиБ; это предел формата хранения, **не новый лимит загрузки через HTTP**. Действующий транспортный предел 4 МиБ пока сохранён.

Ссылка на объект не даёт прав доступа. Будущий публичный обработчик обязан сначала проверить сессию, текущее пространство и доступ к заметке, найти её каноническую запись и только затем читать сохранённую ссылку. Нельзя принимать произвольный хеш или Google file ID от клиента как разрешение на чтение. Drive ищет объект строго по родительской папке пространства, имени и `smenaKnowledgeBody=1`; несколько совпадений означают ошибку. Содержимое проверяется по размеру, SHA-256, формату и ID заметки.

`stageKnowledgeBodyWindow` подготавливает до 20 заметок за вызов, не меняя исходный снимок. При ошибке или отмене корневой документ не публикуется. Объекты, записанные до сбоя, могут остаться неподключёнными; их наличие не означает успешную миграцию. Только успешный CAS корня становится журналом завершённых записей. Уже сохранённые объекты не перезаписываются. Local публикует завершённый временный файл атомарной эксклюзивной ссылкой; Drive создаёт неизменяемый объект и повторно использует проверенное совпадение.

`expandKnowledgeBodies` восстанавливает самостоятельный снимок, включая заметки в корзине. Выборочные чтения загружают только указанные заметки; каталог файлов не клонируется и не читается. Штатные Local/Drive backup-провайдеры уже расширяют такие ссылки перед сериализацией; потоковая запись каталога файлов при этом сохраняется.

Следующая последовательность внедрения:

1. Подключить расширение тел к резервированию, экспорту, восстановлению и проверке ёмкости; старая и новая запись должны читаться одновременно. Сначала мигрировать inline-историю через A05.
2. Подготовить резервную копию и review плана с количеством, текущими бюджетами и прогнозом; сохранять состояние миграции в каноническом корне. Публиковать небольшие окна с CAS, повторным контролем членства и поддержкой продолжения после сбоя. При новой inline-заметке повторять поиск оставшихся записей с начала, чтобы не пропустить ID перед курсором.
3. Добавить каталог метаданных и отдельное чтение тела по ID заметки/ревизии. Старые клиенты получают совместимый полный снимок; новые объявляют поддержку загрузки по запросу. Нельзя отдавать пустую строку вместо незагруженного текста.
4. Заменить запись коллекции на изменение выбранной заметки с её ревизией/хешем. Неизменённые тела, незагруженные заметки и другие каталоги должны сохраняться без перезаписи.
5. Разделить поисковый индекс и тела. Холодный поиск читает индекс и загружает только выбранные результаты; частичная локальная выдача честно обозначает покрытие.
6. Сделать импорт партиями с прогнозом бюджета, подтверждением, журналом завершённых заметок и отменой оставшихся. Обработать конфликт, удаление, перенос, Undo, смену аккаунта и пространства.
7. Пройти нагрузочную и интерфейсную приёмку RU/EN, мобильные размеры и текущие роли. Только после этого включать миграцию для рабочих пространств.

Откат: проверенный самостоятельный backup содержит исходные тексты и историю, поэтому не зависит от существования объектов A05/A06. До отдельного согласованного обслуживания старые объекты не удаляются. Изменение тарифа Vercel и восстановление production-доступности не входят в эту миграцию.

## English

A05 already stores immutable historical snapshots separately. A06 separates the **current body** from note metadata while retaining Google Drive and the local development provider. PostgreSQL is not required.

Each `smena-knowledge-body-v1` JSON object binds the note ID to the original `formatted_markdown`. Its SHA-256 covers every serialized byte. The catalog keeps `bodyRef: {kind, sha256, bytes}` and the other stable metadata, folder/block references and version index. The 8 MiB object cap is a storage-format boundary; the existing 4 MiB HTTP transport limit has **not** been increased.

A reference is not authorization. A future public handler must resolve the canonical note through the current authenticated workspace before reading the stored ref. Arbitrary client hashes or Google file IDs cannot grant access. Drive lookups require the workspace parent, exact name and `smenaKnowledgeBody=1`; ambiguity fails closed. Reads verify byte count, digest, format and note identity.

`stageKnowledgeBodyWindow` stages at most 20 notes without mutating the source snapshot. Cancellation/provider failure does not publish a root. Staged but unreferenced objects may remain; only a successful root CAS records migration progress. Local uses atomic exclusive publication of a completed temporary file; Drive creates immutable objects and verifies existing matches.

`expandKnowledgeBodies` can produce a standalone snapshot including notes in Trash, or load only selected note IDs. It does not read or clone the file catalog. Local/Drive backup providers now expand these refs before serialization while preserving the streamed file-catalog path.

Implementation order: finish export/restore/capacity compatibility after the completed backup expansion; migrate legacy inline history through A05; prepare a reviewed backup-backed migration with canonical CAS receipts; add demand-aware metadata/body APIs and legacy-client compatibility; add per-note conflict-checked writes; split the full-text index; add journaled/cancellable import batches; then complete RU/EN, role, concurrency and mobile acceptance. Newly inserted inline IDs preceding a cursor must be picked up by a fresh pass.

Recovery uses a verified standalone backup containing current text and history, without depending on external objects. No old objects are deleted automatically. Production acceptance remains unavailable while Vercel returns `402 DEPLOYMENT_DISABLED`.
