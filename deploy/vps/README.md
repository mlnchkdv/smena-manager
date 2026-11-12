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
