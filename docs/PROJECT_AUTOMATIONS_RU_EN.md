# Автоматизации проекта / Project automations

## Русский

**Статус: P08a, модель предварительного расчёта.** Настройки, HTTP API, выполнение, журнал и фоновый запуск ещё не подключены. В интерфейсе пока нет новой функции автоматизаций. Модуль `src/shared/project-automations.js` ничего не записывает, не ставит в очередь и не отправляет уведомления.

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

Следующие обязательные шаги P08: канонические настройки с hash/CAS и защитой обычного workspace PUT; предварительная проверка в интерфейсе RU/EN; ограниченный журнал и атомарная квитанция повтора; выполнение с новой проверкой актуальных прав, процесса, готовности, зависимостей и ревизии. Поле `requiresCanonicalValidation: true` намеренно не позволяет считать этот расчёт готовым разрешением записи. Внешние сообщения и сторонние сервисы остаются отдельным включением.

Локальная приёмка P08a: 16 тестов модели и 17 регрессий процесса/целостности. Это не приёмка HTTP API, интерфейса, Google Drive или фоновых запусков. У приложения на этом шаге нет нового пользовательского экрана, поэтому браузерная проверка новой функции ещё невозможна.

## English

**Status: P08a, preview-planning model only.** Settings, HTTP endpoints, execution, durable journals and background triggers are not connected. No new automation UI is exposed. The shared module does not write, enqueue or send anything.

A version 1 program contains up to 20 named rules. Each rule declares its identity, a name of up to 80 characters, an `enabled` flag, source states and a canonical destination status. Events cover task creation (`created`) and status changes within the same project. Restore and cross-project moves are deliberately excluded.

Actions are limited to priority, assignee and cycle assignment. Scripts, network calls, messages and status-changing actions are unsupported. Duplicate actions on the same field within one rule are invalid. The JSON example above is a disabled rule that proposes high priority when a task moves from To Do to In Progress.

The planner compares two snapshots and returns proposed task fields only. The server caller must derive `actorId` from the authenticated canonical session; an ID is not authentication. Active membership and project readability are checked in both snapshots. A reader may inspect a preview without gaining execution rights. Future HTTP handlers must not accept arbitrary snapshots or another actor ID directly from a client.

Disabled rules require explicit `inspectDisabled: true` to inspect. This still returns `executionEnabled: false` and `appliedOperations: 0`. The model reads no note/file bodies or task descriptions. Assignees must be available to the project; cycles must be live. Conflicting rules block the complete plan instead of choosing whichever rule happens to appear first.

Limits are 100 matching events, 200 field operations, 20 displayed diagnostics and 256 KiB of UTF-8 output. An error or exceeded limit returns `blocked: true` and no runnable `changes`. `complete: false` identifies a limit interruption. `issueCount` and `issuesTruncated` distinguish the complete issue count from the bounded diagnostic list.

The canonical signature is input for future hashing; event keys separate project/rule/task/transition/revision identities. Neither is a signed permission, a durable receipt or an atomic replay guarantee.

Remaining P08 work includes hash/CAS-protected canonical settings, preserving configuration against ordinary workspace PUT, RU/EN preview controls, a bounded durable journal and atomic replay receipts, then execution with fresh access, workflow/readiness/dependency and revision checks. `requiresCanonicalValidation: true` explicitly prevents treating a preview as permission to write. External delivery and integrations remain separate opt-ins.

Local acceptance covers 16 planner tests plus 17 workflow/integrity regressions. It does not establish API, UI, real Drive or background execution acceptance. No new user-facing screen exists at this stage, so there is no new mobile or language UI to verify yet.
