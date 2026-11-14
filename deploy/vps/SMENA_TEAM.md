# Подготовка smena.team к переносу на Aeza

Основной адрес: **https://smena.team**. Production установлен и запущен
14.11.2026. DNS, HTTPS, чтение Google Drive и публичные проверки работают.
Добавление нового Google OAuth origin и проверка настоящего входа ещё требуют
завершения в Google Console. См. [отчёт о публикации](../../docs/AEZA_PUBLICATION_2026-11-14.md).
Ниже сохранён порядок установки для [комплекта развёртывания](README.md).

## Что подготовлено локально

В защищённом, игнорируемом Git каталоге `.data/aeza-transfer-2026-11-11/`
находятся `smena.env` и `access-ids.json`. В ENV задано
`APP_ORIGIN=https://smena.team`. Остальные настройки сохранены, включая Google
Drive, Gmail, push и постоянные секреты. Проверка формата и конфигурации
пройдена с шестью профилями. Это локальная проверка, без запросов к Google.

`deployment-readiness.json` в том же каталоге содержит найденные параметры VPS
и незавершённые шаги. Он не содержит пароля, ключей или токенов. Сам секретный
комплект нельзя добавлять в Git, web-root, отчёты или чат.

## Порядок запуска

При чтении конфигурации VPS 14.11.2026 обнаружен работающий
`smena-manager-local-preview.service`: Nginx слушает `127.0.0.1:3000`, backend —
`127.0.0.1:3001`. Предпросмотр подключён к тому же Google Drive, что и
подготовленный комплект. Его настройки для localhost не подходят для публичного
запуска. Проверка не останавливала службу и не меняла конфигурацию сервера.

В момент согласованного переключения нужно остановить и отключить автозапуск
этого предпросмотра перед запуском production. `update.sh` управляет основной
службой `smena-manager.service` и не заменяет этот отдельный шаг. Иначе порт
3001 останется занят, а два backend смогут записывать в одно хранилище.

1. Получить проверенный SSH-доступ. Сначала прочитать конфигурацию сервера:
   работающие сайты, службы, занятые порты, свободные память и диск. Название
   VPS само по себе не доказывает, что он пуст. Не переустанавливать ОС и не
   заменять конфигурацию других приложений.
2. Проверить делегирование домена и содержимое действующей DNS-зоны.
   Для корня `smena.team` нужна A-запись с IPv4 выбранного VPS. При смене NS
   сначала сохранить необходимые MX, TXT и другие существующие записи.
   Кешированный ответ старого DNS ещё не подтверждает настройку новой зоны.
3. Установить комплект по README, используя `--domain smena.team`:

   ```bash
   cd /srv/smena-manager-source
   sudo bash deploy/vps/bootstrap.sh --install-packages-and-node
   sudo bash deploy/vps/install.sh --domain smena.team --source /srv/smena-manager-source
   ```

   На проверенном VPS checkout `/srv/smena-manager-source` уже есть. Перед этими
   командами проверить `git status`, получить актуальный код и обновить чистый
   checkout через `git pull --ff-only origin main`. Не клонировать поверх него
   и не удалять локальные изменения. Node уже установлен отдельно в
   `/opt/smena-node/`; отсутствие `node` в интерактивном PATH не означает,
   что runtime отсутствует.

4. Передать секретный комплект по SFTP в домашний каталог SSH-пользователя,
   затем установить файлы с владельцем `root:smena` и правами `0640` в
   `/etc/smena-manager/`. Использовать существующие Drive ID и профили.
   Не запускать `setup:storage` для создания нового пустого хранилища.
5. В существующем Google OAuth **Web client** добавить
   `https://smena.team` в **Authorized JavaScript origins**. Сохранить прежние
   origins и redirect URI. Для текущего popup-входа новый
   `/api/auth/callback` не нужен. Проверить доступность Google с самого VPS.
6. После распространения DNS получить сертификат для `smena.team` по README.
   `www.smena.team` не входит в текущий Nginx vhost: для него нужны отдельная
   настройка перенаправления и покрывающий его сертификат. Одна DNS-запись
   не создаёт HTTPS-перенаправление.
7. Перед запуском сохранить изменения команды и сделать свежую штатную
   резервную копию. Остановить старые записи и cron. После этого выполнить:

   ```bash
   sudo bash deploy/vps/update.sh --ref HEAD --acknowledge-single-writer
   ```

   С одним Google Drive должен работать только один записывающий backend.

8. Пройти публичный smoke и авторизованную приёмку из README. Проверить
   Google-вход, сохранение после обновления и перезапуска, права и изоляцию,
   файлы, заметки, холсты и граф на RU/EN и мобильных размерах. Плановую
   доставку включать отдельно после приёмки.

Новый домен требует нового входа пользователей. Cookies, офлайн-черновики,
очереди загрузки и push-подписки старого origin автоматически не переносятся.
Перед переездом завершить или сохранить незавершённую работу на старом адресе.

## English handoff

Use **https://smena.team** as the canonical origin and follow the full
[VPS runbook](README.md). Production was installed on 14 November 2026; DNS, TLS,
Drive reads and public checks passed. The Google origin and an actual sign-in
still need confirmation. The ignored transfer bundle was preserved. Inspect server services
before changing anything. Keep Drive IDs, profiles and persistent secrets;
allow only one backend to write to Drive. Add the exact HTTPS JavaScript origin
to the existing Google Web OAuth client; popup sign-in needs no new callback.
The current Nginx configuration covers the apex domain only. Users must sign in
again and re-enable push on the new origin.

The read-only VPS audit found an existing localhost preview using the same Drive
and backend port 3001. Stop it and disable its automatic startup during the
approved cutover before starting production; the production updater does not
manage that separate preview service. Reuse and update the existing clean source
checkout instead of cloning over it. No server configuration was changed by the
audit.
