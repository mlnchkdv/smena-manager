# GitHub Actions → Aeza → smena.team

## RU

После push в `main` workflow [CI](../../.github/workflows/ci.yml) проверяет lint,
форматирование, серверные тесты, сборку и Playwright в Chromium, Firefox и WebKit
(включая RU/EN и мобильные размеры). Только успешная проверка допускает job `deploy`.
PR запускает проверки без доступа к публикации. Повторный запуск доступен через
GitHub → Actions → CI → Run workflow → `main`.

В GitHub environment `aeza-production` разрешена только ветка `main`:

| Настройка                        | Значение                                       |
| -------------------------------- | ---------------------------------------------- |
| Secret `SMENA_VPS_SSH_KEY`       | Отдельный приватный Ed25519-ключ публикации    |
| Variable `SMENA_VPS_HOST`        | `45.88.176.194`                                |
| Variable `SMENA_VPS_PORT`        | `22`                                           |
| Variable `SMENA_VPS_KNOWN_HOSTS` | Проверенная строка OpenSSH known_hosts для VPS |

Приватный ключ не коммитят. Google OAuth, Drive, сессии и остальные секреты
приложения остаются в защищённом окружении VPS. Новый ключ создают вне Git;
на сервер передают только публичную часть. Администратор устанавливает доступ:

```bash
sudo /opt/smena-node/bin/node /srv/smena-manager-source/deploy/vps/ci-install.mjs /root/deploy.pub
```

Установщик рассчитан на действующий сервер `smena.team`, Node 22 по пути
`/opt/smena-node/bin/node` и checkout `/srv/smena-manager-source`. Он создаёт
отдельного `smena-deploy`; root-owned forced command принимает только `status`
или `deploy` с полным SHA. Интерактивная консоль, PTY и перенаправления отключены
для этого ключа. В sudo разрешён только валидирующий CI helper. Пароли, конфигурация
sshd и firewall не меняются. Первый запуск выполняет администратор по SSH;
GitHub не получает root-ключ или root-пароль.

Проверка подключения тем же ключом:

```bash
ssh -T -i /protected/deploy-key smena-deploy@45.88.176.194 status
```

На VPS helper проверяет владельца конфигурации, чистоту checkout, точный origin
и fast-forward истории. Устаревший SHA пропускается с `superseded`: публикуется
только актуальный `origin/main`. Forced command и ручной updater используют одну
блокировку. Job не прерывает начатое переключение другим push.

Сборка и активация выполняются существующим `manage.mjs update --ref SHA`:
тесты на сервере, неизменяемый релиз, проверка Nginx/backend/frontend и откат к
предыдущему коду при ошибке активации. Данные Drive при откате не восстанавливаются.
После активации GitHub отдельно сверяет HTTPS `/api/health` и `/app-version.json`
с SHA. Ошибка внешней проверки отмечает job как failed; сама по себе она не
запускает дополнительный откат уже здорового локального релиза.

Если проверка или сборка упала, откройте failed job в Actions: до успешной
активации работающий релиз сохраняется. Исправьте причину и отправьте новый push
или повторите workflow. При dirty checkout/изменённой истории устраните расхождение
вручную: helper не делает `reset --hard`. Для явного отката используйте штатный
[rollback](README.md); новый успешный CI снова публикует актуальный `main`.
Чтобы временно остановить автопубликацию, отключите workflow CI в GitHub Actions.
Удаление строки ключа из `authorized_keys` отзывает серверный доступ. Ротация:
установить новый публичный ключ и заменить environment secret, затем проверить
workflow. Изменения самих установленных CI helpers требуют отдельного запуска
установщика администратором; обычный push не перезаписывает этот SSH-доступ.

Это односторонняя публикация проверенного кода, а не двусторонняя синхронизация:
изменения на VPS не отправляются в GitHub. Cron и рассылки pipeline не включает.
Не храните рабочие правки прямо в серверном checkout.

## EN

Every push to `main` runs lint, formatting, server tests, build and Playwright
checks in Chromium, Firefox and WebKit, including Russian/English and mobile
layouts. Only successful checks unlock deployment. Pull requests cannot deploy.
Use Actions → CI → Run workflow → `main` to retry a current release manually.

Configure the `aeza-production` environment with the secret and variables in
the table above and a `main` branch deployment policy. Generate a dedicated
Ed25519 key outside Git. Keep the private key in the environment secret; install
only its public part using the administrator command above. The fixed server
layout is intentional: Node 22, `/srv/smena-manager-source` and `smena.team`.

The restricted `smena-deploy` account accepts only `status` or `deploy FULL_SHA`.
It has no interactive SSH shell, PTY or forwarding through this key. Root-owned
helpers validate arguments, source ownership, the exact repository origin,
checkout cleanliness and fast-forward history. A shared deployment lock serializes
manual and automated updates. Superseded commits are skipped rather than replacing
a newer `main`. The installer does not change application secrets or sshd policy.

The existing transactional updater builds and tests an immutable release, checks
Nginx and the frontend/backend versions, and rolls back code if activation fails.
Google Drive data is never restored by a code rollback. GitHub then independently
checks the public HTTPS health and frontend SHA; failure of that external check
fails the job without forcing an additional rollback of a healthy local release.

Inspect failed jobs in Actions. Fix and push or rerun the current workflow. Dirty
or rewritten source history requires administrator review; there is no destructive
reset. Use the existing rollback procedure when needed. Disable the CI workflow
to pause automatic publication, or revoke its authorized key to remove server
access. Rotate both the server public key and the environment private-key secret.
Updating the installed SSH helpers requires an administrator installer run.

Deployment is one-way: GitHub → VPS. It does not commit server edits back to GitHub,
change Google/session credentials, enable cron or send notifications.
