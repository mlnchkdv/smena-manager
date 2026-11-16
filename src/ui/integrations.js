import { integrationRequest, getActiveWorkspace, getSessionGeneration } from '../core/api.js';
import { isRussian, registerRussianLabels } from '../core/i18n.js';
import { esc, fmtTimestamp } from '../core/utils.js';
import { render } from '../shell/render.js';
import { ic } from '../core/icons.js';

registerRussianLabels({ Integrations: 'Интеграции' });
const copy = (en, ru) => (isRussian() ? ru : en);
let state;
let secretTimer;
const scope = () => getActiveWorkspace() + ':' + getSessionGeneration();
function current() {
  if (!state || state.scope !== scope()) state = { scope: scope(), loading: false, data: null, error: '', secret: '' };
  return state;
}
function errorText(error) {
  const messages = {
    PUBLIC_API_DISABLED: ['Integrations are disabled for this workspace.', 'Интеграции в этом пространстве отключены.'],
    INVALID_INTEGRATION: ['Enter a name and select valid access rights.', 'Укажите название и выберите права доступа.'],
    INTEGRATION_SCOPE_DISABLED: ['Enable the requested access in workspace settings first.', 'Сначала включите выбранный доступ в настройках пространства.'],
    INTEGRATION_SCOPE_FORBIDDEN: ['Your role does not allow this access.', 'Ваша роль не разрешает такой доступ.'],
    INTEGRATION_LIMIT: ['Disconnect unused integrations before adding another.', 'Отключите неиспользуемые интеграции перед созданием новой.'],
    INTEGRATION_REVOKED_OR_EXPIRED: ['This token is expired or disconnected.', 'Токен истёк или отключён.'],
  };
  return messages[error.code] ? copy(...messages[error.code]) : copy('The request failed. Try again.', 'Не удалось выполнить запрос. Попробуйте ещё раз.');
}
async function load(target) {
  target.loading = true;
  try {
    const data = await integrationRequest();
    if (target.scope === scope()) target.data = data;
  } catch (error) {
    target.error = error;
  } finally {
    target.loading = false;
    if (target.scope === scope()) render();
  }
}
export function integrationsPanel() {
  const s = current();
  if (!s.data && !s.loading && !s.error) void load(s);
  const button = (action, label, extra = '') =>
    `<button class="btn btn-secondary" data-a="integrationAction" data-op="${action}" ${s.loading ? 'disabled' : ''} ${extra}>${label}</button>`;
  const rights = scopes =>
    scopes
      .map(
        value =>
          ({
            'knowledge:read': copy('Read notes', 'Чтение заметок'),
            'knowledge:write': copy('Edit notes', 'Изменение заметок'),
            'files:read': copy('Read files', 'Чтение файлов'),
            'files:write': copy('Upload files', 'Загрузка файлов'),
          })[value] || value,
      )
      .join(' · ');
  const data = s.data;
  return `<section class="integration-settings" translate="no"><div class="row between wrap"><h1>${copy('Integrations', 'Интеграции')}</h1>${button('refresh', copy('Refresh', 'Обновить'))}</div>
    <p class="lead">${copy('Connect Codex or another MCP client to notes in this workspace. Each app receives its own access token.', 'Подключите Codex или другой MCP-клиент к заметкам этого пространства. Каждое приложение получает отдельный токен.')}</p>
    ${s.error ? `<p class="alert warn" role="alert">${esc(errorText(s.error))}</p>` : ''}${s.message ? `<p role="status" class="alert">${esc(s.message)}</p>` : ''}
    ${
      data?.canManage
        ? `<div class="sblock"><h2>${copy('Workspace access', 'Доступ пространства')}</h2>${[
            ['enabled', 'Enable integrations', 'Включить интеграции'],
            ['writeEnabled', 'Allow note changes', 'Разрешить изменение заметок'],
            ['uploadsEnabled', 'Allow file access', 'Разрешить доступ к файлам'],
          ]
            .map(
              ([key, en, ru]) =>
                `<div class="srow"><span>${copy(en, ru)}</span>${button('policy', data.policy[key] ? copy('Enabled', 'Включено') : copy('Disabled', 'Отключено'), `data-key="${key}" aria-label="${copy(en, ru)}" aria-pressed="${data.policy[key] ? 'true' : 'false'}"`)}</div>`,
            )
            .join('')}</div>`
        : ''
    }
    ${s.secret ? `<div class="sblock integration-secret"><h2>${copy('Save your token', 'Сохраните токен')}</h2><p>${copy('Copy it now. It cannot be shown again. Keep it out of chats and Git.', 'Скопируйте его сейчас. Повторно показать его нельзя. Не отправляйте токен в чат и Git.')}</p><label for="integration-secret">${copy('Access token', 'Токен доступа')}</label><input id="integration-secret" class="input" type="password" readonly spellcheck="false" autocomplete="off" value="${esc(s.secret)}"><div class="row wrap">${button('copy', copy('Copy token', 'Скопировать токен'))}${button('test', copy('Test connection', 'Проверить подключение'))}${button('hide', copy('Hide token', 'Скрыть токен'))}</div></div>` : ''}
    ${data?.policy.enabled ? `<div class="sblock"><h2>${copy('Connect an app', 'Подключить приложение')}</h2><p>${copy('Access applies to all notes in this workspace. Folder filters do not restrict access.', 'Доступ распространяется на все заметки этого пространства. Фильтр папки не ограничивает права.')}</p><div class="integration-form"><label for="integration-name">${copy('App name', 'Название приложения')}</label><input id="integration-name" class="input" maxlength="80" placeholder="Codex" autocomplete="off"><fieldset><legend>${copy('Access rights', 'Права доступа')}</legend><label><input id="integration-read" type="checkbox" checked disabled> ${copy('Read notes', 'Чтение заметок')}</label>${data.canWrite && data.policy.writeEnabled ? `<label><input id="integration-write" type="checkbox"> ${copy('Create and edit notes', 'Создание и изменение заметок')}</label>` : ''}${data.policy.uploadsEnabled ? `<label><input id="integration-files-read" type="checkbox"> ${copy('Read files', 'Чтение файлов')}</label>${data.canWrite && data.policy.writeEnabled ? `<label><input id="integration-files-write" type="checkbox"> ${copy('Upload files', 'Загрузка файлов')}</label>` : ''}` : ''}</fieldset><label for="integration-days">${copy('Expires in', 'Срок действия')}</label><select id="integration-days" class="select"><option value="30">${copy('30 days', '30 дней')}</option><option value="90">${copy('90 days', '90 дней')}</option><option value="1">${copy('1 day', '1 день')}</option></select>${button('create', copy('Create token', 'Создать токен'))}</div></div>` : data ? `<p class="hint">${copy('A workspace administrator can enable integrations here.', 'Администратор пространства может включить интеграции в этом разделе.')}</p>` : `<p role="status">${copy('Loading integrations…', 'Загрузка интеграций…')}</p>`}
    <div class="sblock"><h2>${copy('Connected apps', 'Подключённые приложения')}</h2>${data?.integrations.length ? data.integrations.map(record => `<div class="integration-row"><div class="grow"><b>${esc(record.name)}</b><div class="muted">${esc(rights(record.scopes))}</div><small>${copy('Expires', 'Действует до')}: ${esc(fmtTimestamp(record.expiresAt))}${record.lastUsedAt ? ` · ${copy('Last used', 'Последнее использование')}: ${esc(fmtTimestamp(record.lastUsedAt))}` : ''}</small>${data.canManage ? `<small>${copy('Owner', 'Владелец')}: ${esc(record.ownerName || record.userId)}</small>` : ''}</div>${record.revokedAt ? `<span class="badge">${copy('Disconnected', 'Отключено')}</span>` : button('revoke', copy('Disconnect', 'Отключить'), `data-id="${esc(record.id)}"`)}</div>`).join('') : `<p class="muted">${copy('No connected apps yet.', 'Подключённых приложений пока нет.')}</p>`}</div>
    <p class="hint">${ic('shield-check', 15)} ${copy('Google sign-in and Google Drive credentials stay on the server. Disconnecting an app does not delete its notes.', 'Данные входа Google и Google Drive остаются на сервере. Отключение приложения не удаляет созданные им заметки.')}</p></section>`;
}
export async function integrationAction(el) {
  const s = current(),
    operation = el.dataset.op;
  if (s.loading) return;
  const payload =
    operation === 'create'
      ? {
          name: document.getElementById('integration-name')?.value || '',
          expiresInDays: Number(document.getElementById('integration-days')?.value || 30),
          scopes: [
            'knowledge:read',
            ...[
              ['integration-write', 'knowledge:write'],
              ['integration-files-read', 'files:read'],
              ['integration-files-write', 'files:write'],
            ]
              .filter(([id]) => document.getElementById(id)?.checked)
              .map(([, right]) => right),
          ],
        }
      : null;
  s.loading = true;
  s.error = '';
  s.message = '';
  render();
  try {
    if (operation === 'policy')
      await integrationRequest('/policy', { method: 'PATCH', body: JSON.stringify({ [el.dataset.key]: !s.data.policy[el.dataset.key] }) });
    else if (operation === 'create') {
      const result = await integrationRequest('', { method: 'POST', body: JSON.stringify(payload) });
      if (s.scope !== scope()) return;
      s.secret = result.token;
      clearTimeout(secretTimer);
      secretTimer = setTimeout(() => {
        s.secret = '';
        if (s.scope === scope()) render();
      }, 5 * 60000);
    } else if (operation === 'revoke') {
      await integrationRequest('/' + encodeURIComponent(el.dataset.id), { method: 'DELETE' });
      s.secret = '';
    } else if (operation === 'copy') {
      await navigator.clipboard.writeText(s.secret);
      s.message = copy('Token copied.', 'Токен скопирован.');
    } else if (operation === 'hide') s.secret = '';
    else if (operation === 'test') {
      const response = await fetch('/api/v1/me', { credentials: 'omit', headers: { Authorization: 'Bearer ' + s.secret, Accept: 'application/json' } });
      if (!response.ok) throw await response.json();
      s.message = copy('Connection successful. No notes were read or changed.', 'Подключение работает. Заметки не читались и не изменялись.');
    }
    if (['policy', 'create', 'revoke', 'refresh'].includes(operation)) s.data = await integrationRequest();
  } catch (error) {
    s.error = error;
  } finally {
    s.loading = false;
    if (s.scope === scope()) render();
  }
}
