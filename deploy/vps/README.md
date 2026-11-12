# Smena Manager на VPS Aeza

Готовый комплект для **Ubuntu 24.04, 4 CPU, 8 ГБ RAM, 120 ГБ NVMe**.
Он сохраняет Express API, Google Drive и вход через Google. PostgreSQL не нужен.
Файлы подготовлены в репозитории; реальный VPS этими действиями ещё не настроен.
Замените `tasks.example.com` своим доменом во всех командах ниже.

**EN:** This kit installs a single Express process behind Nginx on Ubuntu 24.04,
keeps Google Drive and Google Sign-In, and provides checked releases and code
rollback. Configuration and secrets live outside Git. Follow the commands below
with your domain. Scheduled delivery is opt-in; rollback never restores data.

## Что входит

| Файл                    | Назначение                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `bootstrap.sh`          | Пакеты Ubuntu и отдельная проверенная по SHA-256 сборка Node 22                    |
| `install.sh`            | Пользователи сервисов, шаблоны окружения, HTTP для получения TLS                   |
| `update.sh`             | Сборка выбранного commit, проверки, переключение и автоматический откат при ошибке |
| `rollback.sh`           | Возврат к предыдущему или явно выбранному сохранённому релизу                      |
| `enable-cron.sh`        | Отдельное включение ежедневных напоминаний и резервных копий                       |
| `smena.env.example`     | Параметры Drive, Google, Gmail и push без реальных секретов                        |
| `profiles.example.json` | Формат разрешённых пользователей                                                   |
| `templates/`            | Nginx, systemd и hook продления сертификата                                        |

Один процесс Node слушает **127.0.0.1:3001**. Nginx выдаёт `dist/` и проксирует
`/api` без удаления этого префикса. Backend доверяет только локальному прокси;
Nginx заменяет входящие forwarded-заголовки. При HTTPS сохраняются Secure/HttpOnly
cookies и заголовки, нужные для Google popup.

Нельзя запускать несколько экземпляров приложения, PM2 cluster, второй контейнер
или одновременно оставлять записывающий Vercel backend с тем же Drive. Этот
комплект рассчитан на один процесс и не добавляет распределённую блокировку.

## 1. Подготовить доступ, домен и исходники

Нужны SSH с `sudo`, домен и доступ к существующим настройкам Google. DNS A должен
указывать на VPS. AAAA добавляйте только при работающем IPv6. Откройте TCP 80/443;
сохраните свой доступ к SSH. Порт 3001 наружу открывать не требуется.
Скрипты не меняют firewall, swap, тариф или чужие сайты Nginx.

Используйте доверенную копию репозитория. Для приватного GitHub-репозитория
подойдёт отдельный **read-only deploy key**; не вставляйте токен в URL Git.

```bash
sudo apt-get update
sudo apt-get install -y git ca-certificates
sudo git clone https://github.com/mlnchkdv/smena-manager.git /srv/smena-manager-source
cd /srv/smena-manager-source
sudo bash deploy/vps/bootstrap.sh --install-packages-and-node
sudo bash deploy/vps/install.sh --domain tasks.example.com --source /srv/smena-manager-source
```

Для приватного репозитория замените URL клонирования на SSH URL и заранее
настройте ключ и проверку host key для пользователя, который выполняет `fetch`.
`sudo` обычно не передаёт ваш SSH agent.

Установка остановится при конфликте домена с существующим Nginx vhost.
Повторный `install.sh` с тем же доменом и source не перезаписывает настройки.
HTTP пока отвечает 503, кроме `/.well-known/acme-challenge/`: приложение не
публикуется без TLS.

Node устанавливается в `/opt/smena-node/versions/`, не заменяя системный Node.
Исполняемый файл, выбранный при установке, фиксируется в `deploy.json` и units.
Повторный bootstrap сам по себе **не обновляет Node работающего сервиса**.
Обновление Node требует отдельного согласованного изменения пути `node` в
защищённом `deploy.json` и следующего проверенного выпуска; старую версию Node
до успешной приёмки удалять нельзя.

## 2. Сохранить настройки Google и пользователей

Редактируйте файлы на сервере, не в рабочей копии Git:

```bash
sudoedit /etc/smena-manager/smena.env
sudoedit /etc/smena-manager/access-ids.json
sudo chown root:smena /etc/smena-manager/smena.env /etc/smena-manager/access-ids.json
sudo chmod 0640 /etc/smena-manager/smena.env /etc/smena-manager/access-ids.json
```

Окружение использует строго `KEY=value`: без `export`, кавычек, пробелов,
подстановок shell и комментариев после значения. Не выполняйте `source` этого
файла. `preflight` проверяет формат и сообщает только имена проблемных параметров.

Перенесите существующие значения:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` — действующий
  OAuth-доступ аккаунта хранения к Google Drive;
- **все существующие** `GOOGLE_DRIVE_*_ID`: основной JSON, папки загрузок и копий,
  сессии, push, доставка, отдельные документы knowledge/bookmarks при наличии.
  Сохраняйте ID, а не создавайте новый пустой каталог;
- разрешённые профили из прежнего `ACCESS_IDS_JSON` или файла — **с теми же `id`,
  `email`, `role`, `accessId`, `active`**, именами, должностями и командами.
  Сохраните всех участников. Заглушка Administrator не является реальным профилем;
- постоянный `SESSION_SECRET`, существующие Gmail grant и VAPID ключи, если
  соответствующие функции используются. Секреты не отправляйте в Git, логи или чат.

В `smena.env` обязательны `NODE_ENV=production`, `TRUST_PROXY=loopback`,
`APP_ORIGIN=https://tasks.example.com`, `WORKSPACE_WRITE_MODE=drive` и
`ACCESS_ID_LOGIN_ENABLED=false`. Не добавляйте `VERCEL`, даже со значением `false`,
`ACCESS_IDS_JSON` или `REDIS_URL`. Профили читаются из защищённого файла.
Фиксированные пути `DATABASE_PATH`, `UPLOADS_PATH`, `BACKUPS_PATH` оставьте
из шаблона. Они не означают перенос базы с Drive на локальный диск.

Если `SESSION_SECRET` раньше отсутствовал, создайте постоянный случайный секрет
не короче 32 символов. Для `CRON_SECRET` также используйте случайный секрет.
Можно получить их на доверенном терминале через `openssl rand -hex 32` и сразу
вставить в защищённый файл; не помещайте значения в историю команд.

**Google Cloud → нужный OAuth Web client → Authorized JavaScript origins:**
добавьте `https://tasks.example.com`. Старый origin удалять не нужно.
Вход использует Google Identity Services popup и `POST /api/auth/google`.
Новый `/api/auth/callback` или redirect URI для входа не нужен. Уже настроенный
локальный redirect для отдельного получения Gmail grant оставьте как есть.

После выбора домена защищённый ENV можно подготовить штатным helper:

```bash
sudo /opt/smena-node/bin/node deploy/vps/configure-origin.mjs --domain tasks.example.com
sudo /opt/smena-node/bin/node deploy/vps/configure-origin.mjs --domain tasks.example.com --write
```

Первая команда только проверяет и показывает origin без секретов. Вторая меняет
только `APP_ORIGIN`, сохраняя остальные строки и права файла. Домен должен
совпадать с выбранным при `install.sh`. DNS, TLS и Google Console этим helper
не изменяются. EN: preview is read-only; `--write` updates APP_ORIGIN only.
Сохраняются существующие пользователи OAuth consent screen и разрешения API.
Повторно выдавать Drive/Gmail refresh token при рабочем grant не требуется.

Новый домен — новый browser origin: cookies, офлайн-черновики, service worker и
push-подписки со старого домена туда автоматически не переедут. Перед переносом
синхронизируйте черновики. На новом домене пользователи войдут через Google и
при необходимости заново включат push. При неизменном секрете, профилях и Drive
сессия на **новом** домене сохраняется после следующих перезапусков backend.

Не запускайте `setup:storage` и миграцию коллекций при обычном переносе.
Незавершённые функции A06 этим комплектом не активируются. Поведение каталога,
права, версии и резервные копии остаются в текущей модели приложения.

## 3. Получить HTTPS-сертификат

После распространения DNS выполните Certbot, указав свой email. Certbot запросит
согласие с условиями Let's Encrypt у оператора; оно не принимается автоматически.

```bash
sudo certbot certonly --webroot -w /var/www/smena-manager-acme \
  --cert-name tasks.example.com -d tasks.example.com --email admin@example.com
sudo systemctl enable --now certbot.timer
sudo certbot renew --dry-run
```

Комплект ожидает сертификат в `/etc/letsencrypt/live/tasks.example.com/`.
Не используйте `certbot --nginx` для автоматической переработки управляемого
конфига. Hook `smena-manager-nginx.sh` после настоящего продления проверит
Nginx и перезагрузит его, чтобы применился новый сертификат. Dry-run обычно
проверяет ACME renewal, без исполнения deploy hook.

## 4. Переключить приложение

Сначала дождитесь сохранения изменений команды и создайте штатную резервную
копию в прежнем приложении. Убедитесь, что она доступна. Затем остановите
старые HTTP-записи и старый cron, включая Vercel. Выключенный cron сам по себе
не останавливает запись из старых вкладок; старый backend тоже должен быть
недоступен для записи. Предусмотрите короткое окно обслуживания.

На VPS:

```bash
cd /srv/smena-manager-source
sudo bash deploy/vps/update.sh --ref HEAD --acknowledge-single-writer
```

Скрипт разворачивает **только закоммиченный** commit через `git archive` в новом
каталоге. Отдельный непривилегированный `smena-build` выполняет `npm ci`, lint,
серверные тесты с параллелизмом 2 и production build. Google-секреты сборке
и тестам не передаются. Frontend содержит SHA релиза.

Затем скрипт приостанавливает timer, проверяет отсутствие работающего cron,
останавливает прежний backend, переключает `current`, проверяет Nginx/systemd,
запускает один backend и проверяет его готовность. Действующие HTTP-запросы
получают до 45 секунд на завершение при остановке; не планируйте обновление
во время операций записи, импорта и восстановления.

Прочитанные через **локальный TLS vhost с проверкой сертификата/SNI** frontend
и API должны иметь одинаковый SHA. Проверка также требует доступности Drive и
401 у закрытых API без авторизации. Она не вызывает cron и не выполняет запись.
При неудаче после переключения восстанавливаются предыдущие код и конфиги,
затем повторно проверяется готовность. Данные из резервной копии не накатываются.
При неудаче восстановления timer остаётся остановленным.

Это короткий перезапуск, а не zero-downtime или blue/green deployment. Старые
хешированные JS/CSS chunks сохраняются в общем каталоге, чтобы открытые вкладки
могли догрузить их после смены версии. Совместимость старой вкладки с будущим
API проверяйте отдельно при несовместимых изменениях.

## 5. Проверить и включить расписание

Проверка без записи, отправки уведомлений или восстановления:

```bash
sudo systemctl status smena-manager.service --no-pager
sudo journalctl -u smena-manager.service -n 80 --no-pager
curl --fail --silent --show-error https://tasks.example.com/api/health
node scripts/smoke-deployment.js https://tasks.example.com --allow-custom-origin
```

Последнюю команду выполняйте Node 22, например
`/opt/smena-node/bin/node scripts/smoke-deployment.js ...`, если системный Node
не установлен. Smoke — публичные чтения без cookies и секретов. Успешный smoke
не заменяет авторизованную приёмку сохранения и реальной доставки.

На новом домене проверьте владельца, обычного участника и viewer; изоляцию
пространств; reload и вход после перезапуска; задачи, MD/TXT, историю, граф,
холсты и файлы. Проверьте RU/EN, телефон, планшет и ноутбук. Для записи используйте
отдельное тестовое пространство. Реальное получение Gmail/push подтвердите
на устройстве получателя с его разрешения.

Только после этого отдельно включите расписание:

```bash
sudo bash deploy/vps/enable-cron.sh --acknowledge-scheduled-delivery
sudo systemctl list-timers smena-manager-cron.timer --no-pager
```

По умолчанию **08:00 Europe/Saratov**. Timer изначально выключен. `Persistent=true`
может вызвать пропущенный запуск сразу после включения: это настоящий запуск
с возможной доставкой и резервным копированием. Не включайте одновременно
старый Vercel cron. HTTP-метод cron в публичном Nginx закрыт; systemd обращается
на loopback, не передавая секрет в аргументах процесса.

Контроль последнего выполнения:

```bash
sudo journalctl -u smena-manager-cron.service -n 50 --no-pager
sudo cat /var/lib/smena-manager/cron-last-run.json
```

HTTP 200 недостаточно: helper требует `status=ok` и успешные результаты всех
пространств. Ошибка транспорта или timeout видны в journal; в таком случае
JSON может содержать **предыдущий** запуск — сверяйте `at`. Автоматических
повторов доставки нет. Не делайте ручной retry до выяснения исхода операции.

## 6. Обновление и откат

Обновление получает исходники, но не делает `git reset`, не трогает локальные
правки source и не использует их в сборке:

```bash
cd /srv/smena-manager-source
sudo git fetch --prune origin
sudo git pull --ff-only origin main
sudo bash deploy/vps/update.sh --fetch --ref origin/main
```

`pull` нужен для обновления самого комплекта управления. Если source содержит
незакоммиченные изменения, сначала разберите их; не удаляйте их автоматически.
Для проверенного исторического выпуска вместо `origin/main` передайте полный
SHA. Применение уже активного commit не перезапускает сервис.

Откат к предыдущему успешно сохранённому релизу:

```bash
sudo bash deploy/vps/rollback.sh
readlink /srv/smena-manager/current
readlink /srv/smena-manager/previous
```

Или явно укажите **basename** существующего каталога релиза, состоящий из
40-символьного SHA и UUID. Не передавайте произвольный путь:

```bash
sudo bash deploy/vps/rollback.sh --to SHA40-UUID
```

Замените `SHA40-UUID` настоящим ID из `/srv/smena-manager/releases/`.
Новый код и старый релиз должны поддерживать текущий формат данных. Этот откат
не отменяет пользовательские изменения, миграции, настройки Google или секреты.
Не откатывайте несовместимую схему без отдельного плана восстановления.

После аварийного отключения в момент переключения скрипт блокирует новое
обновление при статусе `switching` или `recovery-failed` в `deploy-state.json`.
Посмотрите journal и выберите заведомо рабочий релиз через `rollback.sh --to`.
Явный `--to` повторно установит конфиги и запустит выбранный релиз, даже если
`current` уже указывает на него. Ссылка `previous` при этом не заменяется собой.
Не удаляйте журнал блокировки и не включайте cron без проверки рабочего API.

## Хранение, ограничения и обслуживание

| Путь                                     | Содержимое                                        |
| ---------------------------------------- | ------------------------------------------------- |
| `/srv/smena-manager-source`              | Git checkout комплекта и исходников               |
| `/srv/smena-manager/releases/<SHA-UUID>` | Отдельные root-owned релизы с зависимостями       |
| `/srv/smena-manager/current`, `previous` | Ссылки выбора релиза                              |
| `/srv/smena-manager/shared/assets`       | Неизменяемые chunks, включая предыдущие версии    |
| `/srv/smena-manager/deploy-state.json`   | Статус последнего переключения, без секретов      |
| `/etc/smena-manager/`                    | Секреты, профили и описание установки, вне Git    |
| `/var/lib/smena-manager/`                | Постоянное служебное состояние runtime            |
| `/var/lib/smena-build/`                  | Отдельный npm cache сборщика, без Google-настроек |

Runtime: heap 2 ГБ, `MemoryHigh=3G`, `MemoryMax=4G`; оставшаяся память нужна ОС,
Nginx и сборке. Сборка при недостатке ресурсов завершится до переключения.
Релизы, shared assets и неудачные `.stage-*` автоматически не удаляются.
Проверяйте `df -h`, `du -sh /srv/smena-manager/* /var/lib/smena-build` и journal.
120 ГБ — системный диск, а не объём вашего Google Drive.

Реальные пользовательские данные и медиа остаются в Drive. Очередь больших
медиа использует прямую resumable browser-to-Drive загрузку, до 20 GiB на файл
по умолчанию; Nginx принимает до 105 MiB для существующего proxy-пути API,
который ограничен приложением 100 MiB. Увеличение `client_max_body_size` не
повышает лимиты приложения и не заменяет прямую загрузку. Блокировка экрана,
фоновые ограничения Safari/Chrome и огромные видео требуют отдельной приёмки
на реальных устройствах.

Резервируйте `/etc/smena-manager/` отдельно в зашифрованном хранилище вместе
с процедурой восстановления доступа. Штатные Drive-копии сохраняются по
прежним правилам; сертификат или `git rollback` не заменяют резервную копию.
Не публикуйте содержимое env, профилей, OAuth-токены и заголовки авторизации.

## Проверки комплекта на 06.11.2026

- 742/742 серверных/shared теста, включая активацию, ошибки и возврат прежнего
  релиза, сохранение immutable assets, proxy boundaries и graceful shutdown;
- ESLint и production build прошли, начальный JS 587.9 KiB из бюджета 600 KiB;
- bootstrap и TLS-конфиги прошли `nginx -t` на Nginx 1.24.0 **Windows** с
  локальным тестовым сертификатом и адаптированными путями; это проверка
  конфигурационного синтаксиса, а не приёмка Ubuntu;
- Bash проверяется отдельно для каждого скрипта. Linux/systemd и настоящая
  установка на Aeza здесь не запускались: локальный Docker engine недоступен.
  Nginx и `systemd-analyze verify` встроены в активацию на целевом сервере;
- Google Drive, Google login и доставки на новом домене ещё требуют описанной
  выше приёмки владельцем. Реальные секреты при подготовке не извлекались.

Предыдущий [промпт передачи задачи](../../docs/VPS_AEZA_DEPLOYMENT_PROMPT_RU.md)
содержит более широкий контекст. Для установки используйте текущий комплект
и этот порядок действий, сверяясь с актуальным кодом.

## Изоляция Google grants / Grant isolation

`check:deploy` отличает отдельное имя переменной Gmail от действительно отдельных
client ID и refresh token. Общий grant сохраняет совместимость и даёт предупреждение.
Для изоляции задайте отдельные GMAIL_OAUTH_CLIENT_ID/SECRET и выполните локально
`npm run setup:gmail -- --require-isolated-client`. Команда открывает consent только
при явном запуске; полученный token не сохраняется, если в нём остались Drive scopes.
После проверки включите `GMAIL_REQUIRE_ISOLATED_GRANT=true`. Существующий grant
не отзывается автоматически. GOOGLE_OAUTH_PUBLISHING_STATUS — декларация оператора;
фактический статус проверяется в Console. External Testing с Drive/Gmail scopes
может иметь семидневные refresh grants.

EN: use a separate Gmail client and token, verify Console publishing, then opt into
strict isolation. The checker never rotates/revokes grants or treats a declaration
as a live Google verification. [Google token lifecycle](https://developers.google.com/identity/protocols/oauth2).

## Push после переноса / Push migration

При заданном APP_ORIGIN отправляются только подписки этого origin и текущего
VAPID public-key fingerprint. Старые записи остаются для разбора/отката, но
на VPS не получают отправки. Пользователь включает push на новом домене.
Диагностика возвращает migrationRequired без endpoints. При частичном успехе
очередь сохраняет device IDs и не повторяет уже подтверждённую отправку на них.
Сбой процесса после принятия провайдером и до записи подтверждения остаётся
ограничением at-least-once; абсолютное exactly-once не обещается.

EN: origin/key-bound registrations, retained legacy records and per-device retry
progress prevent known-success duplicates; provider/crash ambiguity remains.

### First notification queue start / Первый запуск очереди

A new production VPS starts with delivery paused (`NOTIFICATION_START_PAUSED=true`). Open Settings → Browser notifications → Workspace diagnostics, refresh and review recipients/age. Skip old items deliberately, then enable the reviewed queue. A changed revision requires a fresh preview. Pause prevents new claims; an in-flight delivery may finish. Diagnostics tests remain separate and target only the signed-in admin. The durable decision is protected from ordinary workspace saves. No automatic backlog purge or send occurs during review.

На новом VPS сначала проверьте получателей и возраст очереди в диагностике уведомлений. Пропуск старых заданий сохраняет служебную запись. Кнопка включения разрешает плановую доставку; обновление статуса само по себе ничего не отправляет.

### Independent recovery acceptance / Независимая проверка восстановления

Before DNS cutover: freeze team writes, create a fresh native workspace copy and an **independent media copy** (a workspace JSON alone does not contain photos/videos). Record the copy IDs, revision, note/version counts and source checksums outside Git. Restore into an isolated test workspace; verify exact Markdown, previous versions, folders, access rules, image opening and video Range playback. Do not restore over the team workspace as part of a migration smoke test. Remove neither originals nor the latest known-good copy.

Download the complete recovery set (native manifests **and every referenced immutable object**, plus independent media binaries) to a separate protected directory. Keep a second encrypted copy on a different account/provider/device. The inventory tool verifies byte completeness against the inventory you created; it does **not** prove that all referenced objects were exported, that permissions are correct, or that recovery works. Those are separate restore checks.

```bash
node deploy/vps/backup-inventory.mjs create /secure/export /secure/export.inventory.json
# After copying/decrypting on the second device:
node deploy/vps/backup-inventory.mjs verify /secure/received-export /secure/export.inventory.json
```

Создайте свежую штатную копию данных и независимую копию медиа; проверьте восстановление в отдельном пространстве. Инвентаризация читает файлы потоково, не обращается к Google, не восстанавливает данные и не изменяет экспорт. Она обнаруживает отсутствующие, добавленные и повреждённые объекты. Храните manifest отдельно от папки экспорта и зашифрованную копию вне исходного аккаунта/сервера. Наличие JSON без бинарных вложений не считается резервной копией файлов.

### Session migration / Перенос сессий

Preserve SESSION_SECRET across updates and restarts. Production refuses an absent/short key; Access ID is disabled by default unless explicitly enabled for a controlled emergency. Cookies are HttpOnly, Secure, SameSite=Lax and host-only. A **new domain requires a fresh Google login**; this is expected and differs from an accidental logout on refresh. Old-host browser storage/cookies are not copied to the new host. After signing in on the new origin, check refresh, mobile-size navigation, restart, session revocation and concurrent account tabs. Verify owner/editor/viewer rights and a member-owned separate workspace; try direct URLs across workspaces and ensure denied metadata/binary access. Run the latter locally until a member can sign in to the actual new domain. Never change team roles merely to fake this acceptance.

Сохраняйте ключ сессий при обновлении. На новом домене выполните новый вход через Google, затем проверьте обновление страницы, мобильную навигацию и перезапуск. Права проверяются по серверным профилям; доступ к чужому пространству и бинарным файлам должен отклоняться. Локальные тесты не заменяют consent и вход на реальном HTTPS-origin.

### Ubuntu acceptance / Приёмка хоста

```bash
sudo /opt/smena-node/bin/node /srv/smena-manager/current/deploy/vps/inspect-host.mjs YOUR_DOMAIN EXPECTED_FULL_GIT_SHA
```

Read-only: validates installed Nginx and systemd units, the single managed API instance, matching backend/frontend releases and the local TLS vhost. It probes fixed Google hosts without credentials and without following redirects. HTTPS reachability is **not** authorization or successful Drive reading. No cron, restore, send, restart or rollback is triggered. Run after installation and each deployment; then perform the separately authorized Google/data acceptance. In a staging host, exercise one valid update and a deliberately failing build/health check: old code/config must recover, data and secrets must be untouched, cron must stay stopped if recovery itself fails. Keep the deploy journal and expected SHA as evidence; never print the environment file.

Проверка на Windows использует подставные команды и отказы. Это не означает, что unit-файлы уже запускались на Ubuntu. Реальную установку, обновление и аварийный откат нужно принять на VPS до открытия доступа команде.

### Independent operational monitor / Независимый мониторинг

The optional `smena-manager-monitor.timer` runs every five minutes, separately from cron and Gmail. Configure a random **different** MONITOR_SECRET (32+ characters) in the protected environment, deploy the matching API/units, restart the API to load it, and explicitly enable the timer:

```bash
sudo systemctl enable --now smena-manager-monitor.timer
sudo systemctl status smena-manager-monitor.service
sudo journalctl -u smena-manager-monitor.service --since today
sudo cat /var/lib/smena-manager/monitor-last-run.json
```

The loopback-only, separately keyed `/api/monitor/readiness` is blocked in Nginx. It reads each workspace's storage/coordination, saved cron result, backup age and channel authorization; returns codes/counts without content, recipients or credentials. A paused queue is an explicit issue. The helper also checks process health, <4 GiB free disk and low host memory; HTTP 200 with degraded content still fails. It never invokes cron, resend, restore or cleanup. First-day stale backup/cron alerts are expected until the real scheduled run succeeds. It fails in the service journal and writes a protected summary independently of application email; configure an **external** uptime/certificate/failed-monitor alert before inviting the team. No external alert destination is silently selected or contacted. A journal alone cannot notify you if the whole VPS is offline. Check all required monitors actually run after reboot.

Монитор не использует пользовательскую сессию или ключ cron и ничего не рассылает. Проверки выполняются только после явного включения timer. Успешный health не подтверждает работоспособность Google/копий/планировщика. Для отказа всего VPS нужен внешний монитор HTTPS и отдельный канал оповещения; подключение такого канала остаётся операционной приёмкой.

### Large media transfer acceptance / Приёмка больших файлов

Local regression now exercises a virtual 5 GiB video beyond 32-bit offsets, including a lost partially accepted chunk and exact server-confirmed resume. No real 5 GiB buffer, Drive traffic or disk allocation is used. Existing byte-level ZIP/Range, cancellation, ACL and queue tests remain required. This is protocol evidence, not a throughput or browser-OS test.

On the actual VPS/origin, use a separate test workspace and disposable media: many photos and one 1–5 GiB video. Record local SHA-256/size, upload, pause, resume, switch route, interrupt network, reload/reselect the identical file, then download and compare SHA-256/size. Verify no duplicate metadata after a lost completion reply; test revoke/access denial, video seeking (206/Content-Range) and Unicode names. Repeat Safari/iOS and Chrome/Android with real lock/unlock and keyboard. Small synthetic media cannot prove background-transfer survival. Preserve test evidence, then trash only those disposable files.

Direct Drive supports the configured per-file limit (default 20 GiB), slicing at most 8 MiB. Proxy uploads remain capped at 100 MiB on VPS (Nginx 105m); do not route large videos through an enlarged JSON/multipart API. Resumable ZIP export currently caps a batch at **1 GiB / 500 files**; larger video downloads use the individual file route. Do not present that ZIP limit as unlimited large-file export.

Локально проверены протокол возобновления и смещения больше 4 ГиБ, а не реальная скорость передачи. Для больших медиа нужны прямая загрузка в Drive и проверка контрольной суммы скачанного файла. Проверки блокировки экрана на физических телефонах остаются отдельными.

### Build and disk budget / Сборка и место

For the supplied 4-core / 8 GiB / 120 GB Ubuntu host, every npm/test/build command now runs as `smena-build` in a transient systemd service: **3 GiB aggregate MemoryMax**, 2500 MiB MemoryHigh, 512 MiB swap cap, 300% CPU quota, 256 tasks and 45-minute timeout. The cap includes child Node processes; the 1536 MiB Node heap flag alone is not an aggregate limit. Build environment excludes runtime secrets, and filesystem writes are restricted to staging, build cache and private temporary files. A failing/OOM build never switches the current release. Actual peak RSS/build duration must still be measured on Ubuntu; no swap or host settings are changed automatically.

Before staging and before bundling, free space must be at least **8 GiB and 10%** of the filesystem. Failed staging is retained for inspection. Review cleanup under the deployment lock:

```bash
sudo /opt/smena-node/bin/node deploy/vps/cleanup-releases.mjs
# Review the candidate IDs and protected IDs, then use the exact printed key:
sudo /opt/smena-node/bin/node deploy/vps/cleanup-releases.mjs --apply REVIEW_KEY
```

Default is read-only. Apply refuses a stale review, symlinks and paths outside managed releases. It protects current, previous and five newest releases; release candidates must be >7 days old, failed stages >2 days. It touches **neither shared immutable assets nor application data, secrets, backups or Node installations**. Shared assets deliberately remain available to old browser tabs; asset garbage collection requires a separate retention/usage policy, rather than deleting chunks merely because their release was removed. Check disk monitoring and inspect unexpectedly large failed stages before applying cleanup.

Ограничение cgroup действует суммарно на процессы каждой команды сборки, а не отдельно на каждый Node. Очистка по умолчанию ничего не удаляет; применение требует ключа просмотренного плана. Реальное выполнение systemd/cgroup и замеры ресурсов принимаются на VPS.

### Static compression / Сжатие статики

Public static locations explicitly enable built-in Nginx gzip (level 4, minimum 1024 bytes, Vary: Accept-Encoding). API locations inherit `gzip off`; binary media are not recompressed. No optional Brotli/gzip_static module is assumed. Activation and read-only host inspection now fetch the same built JS asset as identity and gzip through the actual local TLS vhost, check Content-Encoding/Vary, decompress with a bounded output and compare bytes. Missing gzip fails release acceptance rather than trusting configuration text. Verify this on Ubuntu after `nginx -t`; local synthetic HTTP responses do not establish that the VPS module/config has run.

Сжатие включено для публичной статики; ответы API с пользовательскими данными остаются без него. Проверяется не только заголовок, но и совпадение распакованных байтов. Фактическая проверка через HTTPS-Nginx ожидает VPS.
