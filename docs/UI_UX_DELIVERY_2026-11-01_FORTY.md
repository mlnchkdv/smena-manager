# Внедрение 40 пунктов / 40-item delivery

План: [глубокий аудит](UI_UX_DEEP_AUDIT_2026-11-01.md). Реализация выполняется последовательно, отдельный commit и push на каждую самостоятельную правку. Номер ниже соответствует исходному аудиту. Не считать ещё не перечисленные пункты выполненными.

## 01 — Graph lifecycle

- Установлена причина: COSE `stop()` помечает раскладку остановленной и отправляет `layoutstop`, но ранее запланированный кадр всё ещё применяет финальные позиции. Немедленный `cy.destroy()` оставляет этот кадр без renderer.
- Cleanup снимает обработчики и останавливает раскладку, затем уничтожает старый экземпляр после уже поставленного в очередь кадра. Это также учитывает остановку по grab/timeout, которая уже очистила running-layout reference.
- Добавлены поколение mount и проверка user/workspace scope; старые observer callbacks больше не могут уничтожить новый граф или менять его состояние.
- Проверки: 3/3 graph-physics tests, targeted ESLint, production build и bundle budget — успешно. Production RU/EN/resize/navigation acceptance пока ожидается после деплоя.

## 02 — Personal favorites

- Tasks/projects/notes now read personal favorite overrides from validated user/workspace preferences, including explicit false values for old shared stars. Existing shared flags remain untouched as a non-destructive initial state. Readers can star notes without editing their content.
- Preferences reset on workspace/account load; material rendering uses existing visible collections/ACLs. Server knowledge search receives only the authenticated member's preference, and the client rejects results based on an older favorite state.
- A bounded 500-entry preference is validated server-side; removing a new personal star releases its entry. Parsed lookup maps are cached for large lists.
- Acceptance: 601/601 server/shared tests, targeted lint, build and bundle budget (548.6/600 KiB). Tests cover two members, legacy overrides, unchanged shared records, reload serialization, invalid inputs and existing preference retry/account isolation. Production persistence test remains pending; no production stars were changed yet.

## Verification limits / Границы приёмки

### 03 — Localization

Localized subtask completion/reopen events, filter help/fields/operators/selection, and the favorite-limit message. Custom Select accessible names translate their label while preserving authored option text. Team/comment counts use shared RU/EN plural rules; graph hint spans have word separation. Targeted localization/activity tests: 6/6; targeted lint passed. Production RU/EN visual acceptance is tracked separately after deployment.

Физические iOS/Android остаются недоступны; смена browser viewport не заменяет жесты, экранную клавиатуру и PWA. Production материалы команды и права не изменяются ради проверки. Multi-user и опасные операции проверяются в изолированных фикстурах; production-запись требует конкретного согласованного сценария.
