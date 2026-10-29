import { S } from '../core/store.js';
import { esc } from '../core/utils.js';
import { isRussian } from '../core/i18n.js';
import { A } from '../actions/actions.js';

A.retryWorkspaceConnection = () => location.reload();
export function workspaceRecovery(error) {
  const copy = (en, ru) => (isRussian() ? ru : en);
  const unavailable = ['WORKSPACE_UNAVAILABLE', 'WORKSPACE_FORBIDDEN', 'NO_WORKSPACES'].includes(error.code) || error.status === 403;
  const spaces = S.ui.availableWorkspaces || [];
  return `<div class="auth-card"><h1>${copy(unavailable ? 'Workspace unavailable' : 'Connection interrupted', unavailable ? 'Пространство недоступно' : 'Не удалось подключиться')}</h1>
    <p class="sub">${copy(unavailable ? 'Your account is signed in. Choose an available workspace or contact its administrator.' : 'Your session is retained. Check your connection and try again.', unavailable ? 'Вход в аккаунт выполнен. Выберите доступное пространство или обратитесь к его администратору.' : 'Сессия сохранена. Проверьте подключение и повторите попытку.')}</p>
    <div class="col" style="gap:8px">${spaces.map(item => `<a class="btn btn-secondary" href="/${encodeURIComponent(item.url)}/home" translate="no">${esc(item.name || item.url)}</a>`).join('')}
    <button class="btn btn-primary" data-a="retryWorkspaceConnection">${copy('Retry connection', 'Повторить подключение')}</button>
    <a class="btn btn-ghost" href="/">${copy('Open main website', 'На главную сайта')}</a></div></div>`;
}

export function applyRecovery(error) {
  S.ui.auth = error.status === 401 ? 'login' : 'workspace-recovery';
  S.ui.workspaceRecoveryHtml = S.ui.auth === 'workspace-recovery' ? workspaceRecovery(error) : '';
  S.ui.authIssue = '';
}
