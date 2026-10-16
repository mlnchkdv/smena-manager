# Google OAuth: подготовка Smena Manager к подтверждению

## Публичные URL

- Главная страница приложения: `https://smena-manager.vercel.app/about.html`
- Политика конфиденциальности: `https://smena-manager.vercel.app/privacy.html`
- Условия использования: `https://smena-manager.vercel.app/terms.html`
- Authorized JavaScript origin: `https://smena-manager.vercel.app`
- Redirect URI для отдельного Gmail-согласия: `http://127.0.0.1:53682/oauth2/callback`

Все три публичные страницы доступны без входа и находятся на том же домене, что и приложение.

## Настройка Google Cloud

1. Включить **Gmail API** в проекте `kms-brain-storage`.
2. В **Google Auth Platform → Branding** указать название `Smena Manager`, email поддержки `avdeevandry1999@gmail.com` и публичные URL выше.
3. В **Audience** выбрать External. Пока приложение в Testing, добавить `avdeevandry1999@gmail.com` как test user. Для постоянной работы учитывать, что тестовое согласие истекает через семь дней.
4. В **Data Access** добавить только `openid`, `email` и `https://www.googleapis.com/auth/gmail.send`. Широкий scope `https://mail.google.com/` не нужен.
5. В OAuth client типа **Web application** добавить origin и redirect URI из списка выше.
6. Подтвердить владение доменом в Google Search Console под аккаунтом, который является Owner или Editor проекта Google Cloud.
7. Для Production отправить Branding и sensitive scope на проверку Google. В обосновании scope указать: приложение отправляет участникам выбранные ими уведомления о назначениях, комментариях, упоминаниях и сроках; чтение, изменение и удаление почты не выполняется.

## Однократное согласие отправителя

1. Локально предоставить `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` и `EMAIL_FROM=avdeevandry1999@gmail.com`.
2. Выполнить `npm run setup:gmail`.
3. В открывшемся окне выбрать именно `avdeevandry1999@gmail.com` и подтвердить отправку писем.
4. Перенести значение из игнорируемого файла `.data/gmail-oauth.env` в секрет Vercel `GMAIL_OAUTH_REFRESH_TOKEN` для Production, Preview и Development.
5. Выполнить redeploy и проверить `/api/cron/status` с `CRON_SECRET`: `email.configured`, `email.authorized` и `email.credentialMode === "dedicated"`.

Refresh-токен нельзя добавлять в Git, сообщения, документацию или клиентский код.
