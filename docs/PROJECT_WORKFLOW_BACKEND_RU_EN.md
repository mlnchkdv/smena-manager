# Процессы проектов: серверный контракт / Project workflow backend

## Русский

Это серверный этап P07. Интерфейс настройки, предварительная проверка клиентских
команд, выбор/фильтры циклов и полная UI-приёмка ещё находятся в работе.

Процесс хранится в `project.workflow`. Пять существующих идентификаторов
`backlog/todo/progress/review/done` сохраняются для отчётов, этапов, фильтров
и уведомлений. Проект без процесса работает по прежнему стандартному варианту:
переходы между статусами разрешены, дополнительных условий и WIP нет.

Модель версии 1 содержит:

- `transitions` — допустимые выходы из каждого статуса; одинаковый статус не
  является переходом. Пустой список запрещает выходы.
- `wip` — лимит каждого статуса от 0 до 999; 0 означает отсутствие лимита.
  Для `done` остаётся 0. Учитываются неархивные задачи проекта.
- `ready` — пять булевых условий на входе в статус: доступный ответственный,
  текст описания, корректный срок, завершение существующих подзадач и зависимостей.
- `cycles` — до 500 циклов с `id/name/start/end/archived`.
- `activeCycleId` — идентификатор неархивного цикла или пустая строка.
  Сервер этой стадией не назначает цикл новой задаче автоматически.

Задача ссылается на цикл через `cycleId` внутри своего проекта. Архивирование
сохраняет прежние назначения; новое назначение в архивный цикл запрещено.
Удаление используемого цикла отклоняется. Перед включением процесса старые
неизвестные идентификаторы циклов требуют явного сопоставления или снятия.
Полная проверка снимка также проверяет ссылки при восстановлении копии.
Иные старые поля задачи проекта без поля workflow сохраняются.

`GET /api/projects/:id/workflow` возвращает конфигурацию, `workflowHash`, текущую
ревизию/автора/дату изменения, доступность настройки, счётчики статусов и циклов.
Чтение требует канонического членства и доступа к проекту. Скрытый проект не
раскрывает свои настройки или счётчики. Для записи нужен полный доступ к проекту
и действующая роль редактора/администратора; архивный проект не настраивается.

`POST /api/projects/:id/workflow` принимает только `{workflowHash, workflow}`.
Hash — SHA-256 текущего канонического значения. Семантически уже сохранённая
цель повторно не записывается, в том числе после потерянного ответа. Изменившаяся
конфигурация возвращает `WORKFLOW_STALE`; конфликт общей ревизии имеет отдельный
код. Членство и права перепроверяются внутри записи, Root CAS сохраняет
параллельные несвязанные изменения.

У существующего проекта настройки меняются этим endpoint. Обычный workspace PUT,
в том числе старый клиент без новых полей, сохраняет канонический процесс и его
метаданные. Новая копия проекта не наследует чужое авторство настройки. Корзина
также не служит обходом проверки. Штатное восстановление копий сохраняет процесс.

Проверка задач встроена в существующую каноническую проверку назначений/зависимостей.
Массовое изменение оценивается целиком: обмен освобождённого слота допустим, если
итог укладывается в лимит. Снижение лимита сохраняет уже начатую работу; входящая
работа при превышении не принимается. Условия готовности применяются на входе,
не переписывая старые несвязанные задачи. Приватная зависимость даёт общее
замечание недоступности независимо от её скрытого статуса.

Коды отклонений: `WORKFLOW_TRANSITION`, `WORKFLOW_WIP`, `WORKFLOW_READY`,
`WORKFLOW_CYCLE_UNAVAILABLE`, `WORKFLOW_FORBIDDEN`, `WORKFLOW_ENDPOINT_REQUIRED`,
`WORKFLOW_INVALID`, `WORKFLOW_STALE`, `WORKFLOW_INTEGRITY`. Отказ не публикует
часть пакета. В режиме разделённого файлового каталога сохранение настроек
использует ограниченную metadata-запись и сохраняет указатели/учёт файлов.

## English

This is the P07 backend stage. Configuration UI, client-side command checks,
cycle selection/filtering and full UI acceptance remain in progress.

`project.workflow` keeps the five canonical state IDs so existing reports,
milestones, filters and notifications retain their meaning. Unconfigured
projects keep the legacy unrestricted workflow. Version 1 defines allowed
outgoing transitions, WIP limits, entry readiness, up to 500 dated/archivable
cycles and an optional active cycle. Zero is unlimited; Done has no WIP cap.
Readiness can require an accessible assignee, description text, due date,
completed existing subtasks and dependencies. Automatic cycle assignment is
not enabled by this stage.

`task.cycleId` is scoped to its project. Archival retains historical assignments
while rejecting new ones; used identities cannot be removed. Enabling a process
requires explicit resolution of unknown legacy cycle IDs. Snapshot validation
also checks known-process references during backup restoration. Unconfigured
legacy projects retain their unrelated fields.

`GET /api/projects/:id/workflow` returns the configuration/hash, current revision,
author/timestamp, capabilities and status/cycle counts. Canonical membership and
project read access precede disclosure. Configuration requires full project
access and an active editor/administrator. Archived projects are read-only here.

`POST` accepts only `{workflowHash, workflow}`. The hash describes the current
canonical value. An already matching semantic target is a no-op, including
lost-response replay. Changed configuration returns `WORKFLOW_STALE`; unrelated
root revision contention is distinct. Membership/access and Root CAS are checked
inside the write boundary. Ordinary core/trash writes preserve existing process
configuration and its provenance; new copies cannot impersonate an earlier
configurator. Canonical backup restoration preserves configuration.

The existing canonical task validator now applies process rules. A complete
batch is checked together. Slot swaps fitting the final limit are allowed.
Lowering a limit preserves existing work, while new entrants above the limit
are rejected. Entry readiness does not rewrite unrelated old tasks. Private
dependency state is not exposed through readiness diagnostics. Rejected batches
are not partially published. Split file-catalog configuration writes retain
immutable file pointers and accounting through the limited metadata path.

Local acceptance / Локальная приёмка: Node 22 final code gate 909/909, lint/tokens/build, startup 594.8/600 KiB; isolated Local and fake-Drive CAS/ACL/storage tests. Legacy UI: RU/EN × four viewports × three routes; final backend HTTP write/replay/stale/batch/reload and service-project archival passed. Configuration/task-command UI remains pending; these tests do not accept production, Google delivery or physical devices.
