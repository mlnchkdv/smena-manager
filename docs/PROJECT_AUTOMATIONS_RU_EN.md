# Правила проекта / Project rules

## Русский

**P08d: выполнение при сохранении задач и ограниченный журнал.** Откройте меню проекта → «Правила проекта». Включение требует полного доступа к проекту и явного подтверждения сохранения. Отключённые правила остаются черновиками. Сохранение конфигурации не запускает правила на существующих задачах.

Правило версии 1 задаёт имя до 80 символов, `enabled`, исходные состояния и целевой стандартный статус. До 20 правил на проект. Поддерживаются создание (`created`) и смена статуса задачи внутри прежнего проекта. Восстановление, перенос между проектами, замена из резервной копии и служебные записи без пользовательского контекста не запускают правила. Таймеры, cron-правила и webhooks в этот этап не входят.

Действия: priority, assignee и cycleId. У одного правила нельзя повторять поле. Не меняются статус и описание; нет скриптов или внешних API-действий. Одинаковые назначения объединяются, несовместимые блокируют всю команду. При включении проверяются доступность исполнителя, живой цикл и пересекающиеся противоречивые правила. При выполнении эти проверки повторяются по актуальным данным.

```json
{
  "version": 1,
  "rules": [{
    "id": "assign-on-progress",
    "name": "При начале работы",
    "enabled": true,
    "trigger": {"from": ["todo"], "to": "progress"},
    "actions": [{"field": "priority", "value": "high"}]
  }]
}
```

Порядок записи:

1. Канонический сервер проверяет обычное изменение задачи, процесс, готовность, WIP и зависимости.
2. Внутри той же блокировки берётся сохранённая программа проекта. Проверяются активный участник и право редактировать проект в исходном и итоговом снимке. Роль из устаревшего запроса не заменяет канонические права.
3. Рассчитываются назначения только для новых задач и реальных переходов. Суммарно на одну команду пространства разрешены 100 совпавших задач и 200 изменений полей.
4. Итог повторно проходит проверки процесса и целостности. Задача, запись выполнения и обычные события уведомлений сохраняются одним CAS корня. Ошибка не оставляет частично применённую команду или запись об успешном запуске.

Запрос со старой ревизией получает `409 REVISION_CONFLICT`, не выполняясь повторно. Повтор уже сохранённого состояния не создаёт ещё один запуск. Ограничение срока хранения журнала не разрешает повтор старой команды: её исходная ревизия остаётся устаревшей. Это защита записи пространства; доставка Gmail/push сохраняет отдельную политику повторов. Правила сами не отправляют внешние запросы; обычные уведомления о назначении следуют настройкам участников.

Журнал `project.automationHistory` хранится вместе с задачами: до 20 последних записей на проект и 512 KiB суммарно в пространстве, включая корзину. Старые записи постепенно удаляются. Запись содержит hash программы, автора, время, исходную и итоговую ревизии, число совпавших задач, назначений, no-op и до трёх task ID для примера. Полные описания, тексты заметок, файлы и внешние токены не сохраняются. Интерфейс получает названия только из текущих доступных задач; перенесённая или недоступная задача не раскрывается через журнал. Это ограниченная история подтверждённых запусков, не полный архив всех прошлых операций.

Предпросмотр отдельно вызывает read-only `planProjectAutomations`. Он включает отключённые правила и несохранённые правки, не меняет задачи/журнал/ревизию. `executionEnabled: false`, `appliedOperations: 0`, `requiresCanonicalValidation: true` относятся именно к preview и не являются разрешением записи. До и после предполагаемых назначений проверяется обычный переход пользователя. Лимиты отчёта: 20 диагностик и 256 KiB UTF-8; блокировка даёт пустой `changes`.

HTTP API:

- `GET /api/projects/:id/automations`: программа, hash, ревизия, `history`, фактические права и `executionAvailable`. Доступен читателю проекта.
- `POST /api/projects/:id/automations`: `{program, programHash}`; полный доступ к проекту. Hash/CAS, повтор того же сохранения без лишней ревизии, `409 AUTOMATION_STALE` при чужом изменении.
- `POST /api/projects/:id/automations/preview`: `{program, transitions: [{taskId, to}]}`; право редактировать задачи. Сервер получает участника из сессии и не принимает произвольные снимки или чужой actorId.

Конфигурация, происхождение и журнал защищены от обычного workspace PUT. У нового/копируемого проекта они удаляются; у существующего сохраняется серверная версия. Metadata scope конфигурации разрешает менять только четыре поля настройки и не может переписать журнал. Настройка/чтение не загружают холодный каталог файлов или тексты знаний. Выполнение использует уже открытый канонический снимок обычной записи задач, без дополнительных чтений этих материалов.

В окне редактируется одно правило за раз. «Не менять» отличается от снятия исполнителя/цикла. Поиск показывает первые 50 совпавших задач. Включённые правила требуют подтверждения; preview остаётся отдельной кнопкой. Журнал свёрнут и показывает сначала пять записей. Несохранённый текст удерживается только в открытом окне, закрытие/обновление спрашивает о сбросе. Потерянный ответ предлагает повторить точный payload. Отказ правила во время синхронизации останавливает повторы и сохраняет последнюю локальную версию для проверки; при недоступном локальном хранилище нельзя выдавать её за долговечную копию.

Локальная приёмка и её границы записываются в `IMPLEMENTATION_15_12_2026-11-07.md`. Проверка временного Local-хранилища и Drive-подобного CAS не является проверкой настоящего Google Drive, production, доставки или физических телефонов.

## English

**P08d: execution with task saves and a bounded journal.** Open the project menu → Project rules. Enabling requires full project access and explicit save confirmation. Disabled rules remain drafts. Saving settings does not run rules retroactively on existing tasks.

Version 1 supports up to 20 named rules per project, with a name of up to 80 characters, an enabled flag and source/destination canonical states. Events cover creation (`created`) and status transitions within the same project. Restores, cross-project moves, backup replacement and service writes without a user context do not trigger rules. Scheduled rules, cron and webhooks are outside this stage.

Actions assign priority, assignee or cycle. Duplicate fields within one rule are invalid. Rules do not change status/descriptions or run scripts/external API actions. Identical assignments merge; conflicting assignments reject the whole command. Activation checks assignee visibility, live cycles and contradictory overlapping enabled rules; execution rechecks current targets.

The canonical task write validates the user's transition, readiness, WIP and dependencies first. Inside the same write lock, it reads the saved program and verifies active membership and project editing rights in both snapshots. A stale request role cannot override canonical access. All projects share a command limit of 100 matched tasks and 200 field changes. The resulting tasks are validated again, then tasks, execution receipts and ordinary notification events commit in one root CAS. Failure publishes neither a partial command nor a success receipt.

An old base revision returns `409 REVISION_CONFLICT` without replaying the command. Re-saving the already committed status does not create another run. Pruning old journal entries does not permit an old command to run again: its source revision remains stale. This is workspace-write idempotency; Gmail/push retain their separate delivery retry policy. Ordinary assignment notifications still follow participant preferences.

`project.automationHistory` retains up to 20 recent runs per project and 512 KiB across the workspace, including trashed projects. Older receipts are gradually removed. Each run records the program hash, actor, timestamp, source/result revisions, matched-task/assignment/no-op counts and up to three sampled task IDs. It stores no descriptions, note/file bodies or external tokens. UI names come from currently accessible tasks; moved/unavailable task details are not exposed. This is bounded operational history, with retention limits.

Preview remains the read-only planner. It includes disabled rules and unsaved edits, validates the user transition and proposed assignments, and changes no tasks, history or revision. `executionEnabled: false`, `appliedOperations: 0` and `requiresCanonicalValidation: true` describe preview only; they are not permission to write. Reports are limited to 20 diagnostics and 256 KiB UTF-8. Blocked reports contain no runnable changes.

The API provides GET `/api/projects/:id/automations` to readers, POST with `{program, programHash}` to full-access participants, and POST `.../preview` with `{program, transitions: [{taskId, to}]}` to task editors. The authenticated session supplies the actor. Settings use hash/CAS and safe identical retries; competing configuration returns `409 AUTOMATION_STALE`. GET includes bounded history and current permissions.

Ordinary workspace snapshots cannot configure rules, forge provenance or erase/insert receipts. New/copied projects cannot inherit these server-owned fields. The configuration metadata scope allows only four settings fields and preserves history. Configuration reads/writes avoid cold file/note catalogs; execution uses the canonical task-write snapshot without extra material reads.

The localized dialog edits one rule at a time, distinguishes keeping a value from clearing it, limits task search to 50 matches and asks before saving enabled rules. Preview is a separate action. History is collapsed and initially shows five runs. Unsaved edits exist only in the open dialog; closing/refreshing asks before discarding them. A lost response offers an identical retry. Rejected rule writes stop automatic retries and retain the latest local work for review, without claiming durable recovery when browser storage is unavailable.

Local evidence and limitations are recorded in the implementation ledger. Temporary local storage and a Drive-like CAS adapter do not establish real Google/production, delivery or physical-device acceptance.
