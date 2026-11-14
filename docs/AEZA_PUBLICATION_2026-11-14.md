# Публикация smena.team / Publication

14.11.2026 сайт **https://smena.team** опубликован на Ubuntu 24.04 с Nginx,
systemd и отдельным Node 22.23.5. Приложение использует существующий Google
Drive. PostgreSQL, новое пустое хранилище и новые пользователи не создавались.

## Подтверждено

- Production release: `a076d85665fadfc4549cf972663f5561039cac21`.
  SHA frontend и API совпадают. Более новые коммиты с этим отчётом не меняют
  запущенный код приложения.
- A-запись основного домена настроена в действующей зоне Aeza. Google и
  Cloudflare DNS вернули адрес VPS.
- Сертификат Let's Encrypt получен для `smena.team`, действителен до
  12.02.2027. Таймер автоматического продления включён. ACME dry-run завершён
  с кодом 0: все имитируемые продления успешны. Первый запуск прервался после
  тайм-аута SSH во время случайной паузы Certbot; повтор выполнен с
  `--no-random-sleep-on-renew`, без изменения действующего сертификата.
- Перед переключением создана штатная резервная копия с меткой
  «Перед публикацией smena.team 14.11.2026». Восстановление не запускалось.
- Сохранены все девять существующих Drive ID, секреты и шесть профилей.
  В существующем ENV задан новый `APP_ORIGIN` и явно добавлен
  `NOTIFICATION_START_PAUSED=true`; остальные значения сохранены.
- Временный localhost-предпросмотр остановлен, его автозапуск и отдельный
  Nginx vhost отключены. Запущен один production backend на `127.0.0.1:3001`.
- Smena cron выключен. Первоначальная пауза доставки Gmail/push сохранена;
  разбор очереди и повторная рассылка не запускались.
- На VPS прошли ESLint, production build и серверные проверки:
  **1017 passed, 0 failed, 1 skipped** из 1018 тестов.
- Публичный smoke прошёл. Закрытые API без авторизации возвращают `401`,
  служебные cron/monitor API снаружи — `404`. Вход по Access ID выключен.
  ENV и файл профилей через веб не доступны.
- Экраны входа RU/EN проверены в Chromium и WebKit на 320×568, 390×844,
  768×1024, 844×390, 1366×768 и 1920×1080: 24 сцены без горизонтального
  переполнения. Для выбора языка использован только локальный cache тестового
  браузера; личные настройки участников не изменялись.
- Публичные страницы About, Privacy и Terms проверены на 320, 390 и 1366 px,
  включая раскрытие английского текста: ещё 18 сцен без переполнения.

## Что ещё не подтверждено

Инструмент управления встроенной панелью не инициализируется
(`failed to write kernel assets`, Windows error 3). В отдельном Comet Google
потребовал повторную авторизацию. Пользователь вошёл в Google Console в боковой
панели; ему передан точный шаг добавления `https://smena.team` в
**Authorized JavaScript origins существующего Web OAuth client**.
Прежние origins и redirect URI должны сохраниться. Новый callback не нужен.

До подтверждения сохранения origin и настоящего входа нельзя считать Google
авторизацию и авторизованные рабочие сценарии принятыми. Доступность экрана
входа и `googleAuthEnabled=true` не доказывают успешную авторизацию пользователя.
Сохранение после входа, перезапуска и обновления, а также внутренние разделы
следует проверить после этого. Проверки на физических телефонах не выполнялись.

Повторная доставка Gmail/push, включение расписания, восстановление резервной
копии и изменение материалов команды в рамках публикации не выполнялись.
Настройка SSH-ключей и дальнейшее ограничение административного доступа остаются
отдельной эксплуатационной задачей; пароль root при публикации не сохранялся.

Машинные результаты: [JSON](audits/2026-11-14-aeza-publication.json).
Конфигурационный снимок до переноса хранится в защищённом staging-каталоге root
на VPS; точный путь и развёрнутые результаты — в локальном игнорируемом `.data/`.
Секреты и адреса объектов резервных копий в этот отчёт не включены.

## English

**https://smena.team** is running on the VPS with Nginx, systemd and Node 22.23.5.
The existing Drive storage, nine IDs, six profiles and secrets were preserved.
A fresh application backup was created before cutover. The localhost preview
was stopped and disabled; only the production backend writes to Drive.

TLS, a renewal dry-run and public smoke checks passed. The server ran 1018 tests: 1017 passed,
one skipped, none failed. Login layout passed 24 RU/EN Chromium/WebKit scenes,
plus 18 public disclosure-page scenes. No physical-device acceptance was done.

The Google OAuth origin and an actual Google sign-in still require confirmation
because the embedded-browser tool failed and the separate browser required
reauthentication. A reachable login screen is not proof of successful sign-in.
Authenticated workflows remain pending. Smena cron is disabled and delivery
starts paused; no notification replay or data restore was performed.
