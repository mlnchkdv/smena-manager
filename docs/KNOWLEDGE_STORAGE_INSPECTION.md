# Проверка хранилища знаний / Knowledge storage inspection

## Использование

Администратор текущего пространства открывает **Настройки → Перенос данных → Проверка хранилища знаний**. Создание проверки сохраняет начальную точку; «Продолжить» выполняет небольшие последовательные запросы. «Пауза» и закрытие окна прекращают следующие запросы после текущей порции. После обновления страницы или перезапуска backend можно открыть проверку и продолжить с сохранённого места. Это не фоновый cron: при закрытом окне новые порции не запускаются.

Тексты заметок, файлы, настройки и резервные копии не изменяются. **Сам прогресс записывается** в отдельный служебный `smena-storage-inspection.json` текущего хранилища Local/Google Drive. Журнал не входит в каноническое состояние пространства. На Local предполагается один Node-писатель; Drive обновляет существующий журнал с ETag/CAS. Конкурирующий checkpoint отклоняется, неоднозначная identity журнала не перезаписывается.

Обход учитывает активные заметки, корзину, историю, части метаданных и поиска, независимые копии и незавершённые подготовки копий. Сначала перечисляется безопасный inventory; корни/метаданные читаются только по подтверждённым identity, без bootstrap отсутствующих папок. Для объектов без ссылок проверяются содержимое и hash. Объекты, сохраняемые по действующим ссылкам, не перечитываются целиком ради проверки их текстов: это отчёт достижимости, а не полная побайтовая проверка всех данных.

В отчёте есть количество, известный объём, причины неполноты и кандидаты. Размер — сумма известных объектов inventory, **не занятое место всего Google Drive**. Неизвестный формат, непроверенная копия, отсутствующая ссылка или изменение корня не дают объявить отчёт полным. Смена прав проверяется до чтения журнала и повторно после долгих чтений. Отчёт скачивается без исходников, hash, имён заметок и provider ID.

Кандидат требует завершённого согласованного обхода, известного формата, проверки hash и минимум 30 дней с первого подтверждённого обнаружения без ссылок. Старый `createdAt` сам по себе недостаточен. Текущая реализация переносит наблюдения только между полными проверками неизменившегося корня; при изменениях действует консервативный новый отсчёт. **Удаление отсутствует**, `deletionEnabled` всегда `false`.

Ограничения одного задания: до 10 000 объектов, до 2 000 снимков, журнал до 8 МиБ. Снимок больше 8 МиБ не загружается обходом и делает результат неполным. Страница inventory — до 100 объектов; шаг читает максимум один дополнительный объект содержимого. Ошибка не продвигает checkpoint неуспешного шага. Изменение пространства требует новой проверки. Реальный Drive и production ещё требуют отдельной приёмки; локальные и mock-тесты её не заменяют.

## Usage

A canonical workspace administrator opens **Settings → Data transfer → Knowledge storage check**. Start creates a saved checkpoint; Continue drives bounded sequential requests. Pause or closing stops subsequent requests after the current block. Reopening after page reload or backend restart resumes from the persisted checkpoint. It is not a background cron job.

Notes, files, settings and backups remain unchanged. **Progress itself is written** to a separate `smena-storage-inspection.json` in the active Local/Google Drive store. It is outside canonical workspace data. Local assumes one Node writer; Drive updates use ETag/CAS. Stale checkpoints are rejected; ambiguous journal identities fail closed.

The walk retains active, trashed and historical note references, metadata/search parts, independent backups and unfinished backup preparations. Reference reads resolve verified inventory identities without creating missing folders. Unreferenced objects require content/hash verification. Referenced note bodies are not all downloaded merely to inspect their text: this is reachability inspection, not a complete byte audit.

The report shows counts, known object bytes, incomplete-result reasons and candidates. Bytes are not total Google Drive usage. Unknown formats, unverified backups, missing references and changed roots prevent a complete report. Canonical access is checked before journal reads and again after slow reads. Downloaded reports exclude source text, note names, hashes and provider IDs.

Candidates require a complete consistent walk, known format, verified hash and at least 30 days since first confirmed unreferenced observation. Creation time alone is insufficient. Observations currently carry forward only between complete inspections of an unchanged root; changed roots conservatively restart retention. There is **no deletion API or action**; `deletionEnabled` is always `false`.

Limits: 10,000 objects, 2,000 snapshots, an 8 MiB checkpoint. Snapshots larger than 8 MiB are skipped and prevent completeness. Inventory pages contain at most 100 objects; a step reads at most one additional content object. A failed step does not advance its checkpoint. Workspace changes require a new check. Live Google Drive/production acceptance remains separate from Local and mock verification.
