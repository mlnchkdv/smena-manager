# Повторяемая приёмка интерфейса / Repeatable browser acceptance

Проверки в `scripts/browser-acceptance.js` читают уже открытую страницу. Они не входят в аккаунт, не создают материалы, не меняют язык, права или интеграции. Запускайте из корня репозитория через Playwright CLI в изолированном браузере:

```sh
node scripts/build-browser-acceptance.js
playwright-cli -s=qa run-code --filename output/browser-acceptance.cli.js
node scripts/build-browser-acceptance.js --self-test
playwright-cli -s=qa run-code --filename output/browser-acceptance-self-test.cli.js
```

These checks inspect the current authenticated page without signing in, creating content, changing preferences or sending notifications. Run the command from the repository root in an isolated Playwright CLI session. Inspect the returned `passed` value; a successful CLI process exit alone is insufficient.

`--self-test` открывает и закрывает временную about:blank страницу. Отрицательные контроли воспроизводят вложенное обрезание при root overflow 0 и неверно доступные команды при Can view. Они не меняют приложение. / The self-test uses a temporary blank page to ensure the checks reject nested clipping and misleading edit controls for a canonical reader, without modifying the app.

Проверять / Check:

- RU и EN: 320×567, 390×844, 767×900, 844×390, 1024×600, 1366×768, 1920×1080.
- Готовый каталог после запросов и тихого окна, а не только шапку или skeleton. `signed-out`, восстановление сессии и незавершённая загрузка — разные результаты. / Wait for settled content, not merely the header. Signed-out, session restoration and incomplete loading are distinct outcomes.
- Открытый диалог с конечными действиями: корневое **и вложенное** переполнение, горизонтальное обрезание и перекрытие кнопок. Вертикальная прокрутка и внутренняя панорама холста сами по себе не являются ошибкой. / Check nested dialog geometry and action obstructions; legitimate vertical scrolling and canvas panning are allowed.
- Задача: Guest, Member с Can view / Can comment / Can edit. Ожидания вычисляются по участнику из `/api/auth/me`, каноническому членству и конкретному проекту. Общее `data.me` и класс CSS роли не служат доказательством прав. / Derive expectations from the authenticated canonical member and the task project, not the shared stored `data.me` or a CSS role class.
- Дополнительно вручную: клавиатура, меню, focus/выход, контраст поверх изображений, экранная клавиатура, реальные iOS/Android. / Manually verify keyboard flows, focus exit, contrast over images, soft keyboards and physical devices.

JSON содержит только состояния и геометрию; helper не выводит Cookie, исходники заметок или имена материалов. При исключении возвращается `acceptance-incomplete`. Контроль ACL на сервере остаётся обязательным — UI-проверка его не заменяет.

The JSON contains state and geometry only. Request exceptions are sanitized because raw errors can contain cookies. `acceptance-incomplete` is not a pass. Server ACL checks remain mandatory.
