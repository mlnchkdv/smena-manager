# Автоматизации проекта / Project automations

## Русский

**Статус: P08c, интерфейс черновиков и HTTP-предпросмотр.** Настройки сохраняются, но выполнение, журнал и фоновый запуск ещё не подключены. Откройте меню проекта → «Правила проекта». Модуль `src/shared/project-automations.js` ничего не записывает, не ставит в очередь и не отправляет уведомления.

Программа версии 1 содержит до 20 правил. Правило задаёт идентичность, название до 80 символов, флаг `enabled`, исходные состояния и целевой стандартный статус. Поддерживаются создание задачи (`created`) и смена статуса внутри того же проекта. Восстановление из архива и перенос между проектами не считаются такими событиями.

Действия ограничены приоритетом, исполнителем и циклом. Произвольные скрипты, запросы, письма и изменение статуса действием не поддерживаются. У одного правила не может быть двух действий над одним полем. Пример структуры:

```json
{
  "version": 1,
  "rules": [
    {
      "id": "assign-on-progress",
      "name": "При начале работы",
      "enabled": false,
      "trigger": { "from": ["todo"], "to": "progress" },
      "actions": [{ "field": "priority", "value": "high" }]
    }
  ]
}
```

`planProjectAutomations(current, next, projectId, program, options)` сравнивает два снимка и возвращает только предполагаемые поля задач. Вызывающий сервер должен получить `actorId` из авторизованной канонической сессии; переданный идентификатор сам по себе не является доказательством входа. Проверяются активное членство и видимость проекта в обоих снимках. Читателю разрешён только расчёт, это не даёт права выполнять изменения. При подключении HTTP API нельзя принимать полные снимки и чужой `actorId` непосредственно от клиента.

Отключённые правила исключаются, пока вызывающий код явно не задаст `inspectDisabled: true`. Даже тогда `executionEnabled` остаётся `false`, а `appliedOperations` — `0`. Расчёт не включает тела заметок, файлов или описания задач. Исполнитель должен быть доступен проекту, цикл — неархивным. Несовместимые действия разных правил блокируют весь план; порядок правил не задаёт приоритет исполнения.

Пределы: 100 совпавших событий, 200 изменений полей, 20 показанных диагностик и 256 KiB UTF-8 для отчёта. Превышение лимита или ошибка даёт `blocked: true` и пустой `changes`; частичный план для выполнения не возвращается. `complete: false` означает остановку по лимиту. Число `issueCount` может превышать длину ограниченного списка `issues`; это явно отмечено `issuesTruncated`.

`projectAutomationsSignature` даёт стабильное содержимое для будущего хеширования, а `automationEventKey` различает проект, правило, задачу, переход и ревизию. Они не являются подписанным разрешением, долговечной квитанцией или защитой от повторной записи сами по себе.

HTTP API:

- `GET /api/projects/:id/automations` — программа, hash, ревизия и фактические права. Доступен читателю проекта.
- `POST /api/projects/:id/automations` — `{program, programHash}`; нужен полный доступ к проекту. Сохраняются только отключённые правила. Попытка включения возвращает `409 AUTOMATION_EXECUTION_UNAVAILABLE`.
- `POST /api/projects/:id/automations/preview` — `{program, transitions: [{taskId, to}]}`; нужно право редактировать задачи. Весь расчёт работает с текущим серверным снимком, без передачи полного снимка или `actorId` клиентом.

Настройки защищены hash/CAS. Повтор той же записи после потерянного ответа не создаёт новую ревизию; устаревшая отличающаяся запись даёт `409 AUTOMATION_STALE`. Активное членство и проектные права повторно проверяются внутри записи. Обычный workspace PUT сохраняет каноническую конфигурацию, а у копии/нового проекта удаляет чужие правила и происхождение. Изменение касается только четырёх полей проекта; холодные тела/каталоги знаний и файлов не загружаются даже при конфликте CAS.

Предпросмотр сначала проверяет сам переход пользователя с WIP и готовностью, затем проверяет предполагаемые назначения. Он не меняет задачи, уведомления или ревизию. `canExecute` и `executionAvailable` равны `false`. Следующие обязательные шаги P08: ограниченный журнал и атомарная квитанция повтора, выполнение с новой проверкой актуальных прав, процесса, готовности, зависимостей и ревизии. Поле `requiresCanonicalValidation: true` не позволяет считать расчёт разрешением записи. Внешние сообщения и сторонние сервисы остаются отдельным включением.

Интерфейс редактирует одно правило за раз: имя, исходные статусы, целевой статус и необязательные назначения. «Не менять» отличается от снятия исполнителя/цикла. Редактор задачи может проверять сохранённые правила, но не менять конфигурацию; читатель видит только настройки. Поиск задачи ограничивает список первыми 50 совпадениями. «Рассчитать результат» проверяет все черновики и явно показывает, что к задачам ничего не применено. Незавершённый черновик хранится только в открытом окне: закрытие/обновление запрашивает сброс; сеть с потерянным ответом предлагает повтор той же записи. Обычная перезагрузка браузера не сохраняет несохранённый черновик.

Локальная серверная приёмка включает модель, политику обычного PUT, отдельное хранилище и настоящий HTTP API на временных вымышленных аккаунтах: права, replay, stale, запрет включения, отсутствие записи при preview, WIP/готовность и отсутствие чтения тел. Drive-подобный metadata-адаптер проверен на 1 001 заметке, конкурирующей записи и отзыве прав; настоящий Google не вызывался. Браузерная приёмка P08c записана отдельно в журнале внедрения. Реальный Drive и фоновые запуски этим не приняты.

## English

**Status: P08c, draft UI and HTTP preview.** Settings can be saved, but execution, durable journals and background triggers are not connected. Open the project menu → Project rules. The shared planner does not write, enqueue or send anything.

A version 1 program contains up to 20 named rules. Each rule declares its identity, a name of up to 80 characters, an `enabled` flag, source states and a canonical destination status. Events cover task creation (`created`) and status changes within the same project. Restore and cross-project moves are deliberately excluded.

Actions are limited to priority, assignee and cycle assignment. Scripts, network calls, messages and status-changing actions are unsupported. Duplicate actions on the same field within one rule are invalid. The JSON example above is a disabled rule that proposes high priority when a task moves from To Do to In Progress.

The planner compares two snapshots and returns proposed task fields only. The server caller must derive `actorId` from the authenticated canonical session; an ID is not authentication. Active membership and project readability are checked in both snapshots. A reader may inspect a preview without gaining execution rights. Future HTTP handlers must not accept arbitrary snapshots or another actor ID directly from a client.

Disabled rules require explicit `inspectDisabled: true` to inspect. This still returns `executionEnabled: false` and `appliedOperations: 0`. The model reads no note/file bodies or task descriptions. Assignees must be available to the project; cycles must be live. Conflicting rules block the complete plan instead of choosing whichever rule happens to appear first.

Limits are 100 matching events, 200 field operations, 20 displayed diagnostics and 256 KiB of UTF-8 output. An error or exceeded limit returns `blocked: true` and no runnable `changes`. `complete: false` identifies a limit interruption. `issueCount` and `issuesTruncated` distinguish the complete issue count from the bounded diagnostic list.

The canonical signature is input for future hashing; event keys separate project/rule/task/transition/revision identities. Neither is a signed permission, a durable receipt or an atomic replay guarantee.

The API provides `GET /api/projects/:id/automations` to project readers, `POST` with `{program, programHash}` to users with full project access, and `POST .../preview` with `{program, transitions: [{taskId, to}]}` to task editors. The session supplies the actor; clients cannot supply arbitrary snapshots. Only disabled rules can be saved; activation returns `409 AUTOMATION_EXECUTION_UNAVAILABLE`.

Canonical drafts use hash/CAS protection. Identical lost-response retries do not create another revision; competing changes return `409 AUTOMATION_STALE`. Membership and project access are rechecked inside the mutation. Ordinary workspace snapshots retain canonical fields; new/copied projects cannot inject rules or provenance. Only four project fields may change. Cold file/note catalogs and bodies are not loaded, including the CAS-conflict path.

Preview validates the user's transition against readiness/WIP, then validates the proposed assignments. Tasks, notifications and revisions stay unchanged. `canExecute` and `executionAvailable` are false. Remaining P08 work includes a bounded durable journal and atomic replay receipts, then execution with fresh access, workflow/readiness/dependency and revision checks. `requiresCanonicalValidation: true` prevents treating a preview as permission to write. External delivery and integrations remain separate opt-ins.

The UI edits one rule at a time: name, source/destination states and optional assignments. Keep current value differs from clearing an assignee/cycle. Task editors can preview saved rules; readers can only inspect settings. Task search displays at most 50 matches. Preview result evaluates all draft rules and explicitly states that tasks remain unchanged. Unsaved edits exist only in the open dialog; closing/refreshing it asks before discarding them. A lost-response save offers an identical retry. Browser reload does not persist an unsaved draft.

Local server checks cover the planner, snapshot policy, temporary local storage and real HTTP middleware with synthetic accounts: roles, replay/stale behavior, refused activation, preview immutability and workflow guards. A Drive-like metadata adapter checks 1,001 notes, concurrent writes and permission revocation without real Google calls. Browser acceptance is recorded separately in the implementation ledger. Real Drive and background execution remain unaccepted.
