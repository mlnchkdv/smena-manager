# Подготовка smena.team к переносу на Aeza

Основной адрес: **https://smena.team**. Этот файл уточняет домен для
[комплекта развёртывания](README.md); он не подтверждает установку на VPS.

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
[VPS runbook](README.md). The ignored local transfer bundle has been prepared
and structurally validated; installation, live Google access, DNS, TLS and
production acceptance remain separate steps. Inspect existing server services
before changing anything. Keep Drive IDs, profiles and persistent secrets;
allow only one backend to write to Drive. Add the exact HTTPS JavaScript origin
to the existing Google Web OAuth client; popup sign-in needs no new callback.
The current Nginx configuration covers the apex domain only. Users must sign in
again and re-enable push on the new origin.
