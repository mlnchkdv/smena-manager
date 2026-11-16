import '../ui/workspaces.js';
import { S } from '../core/store.js';
import { esc } from '../core/utils.js';
import { isRussian } from '../core/i18n.js';
import { A } from '../actions/actions.js';
import { bootstrapCopy } from '../shared/bootstrap-read.js';

A.retryWorkspaceConnection = () => location.reload();
export function workspaceRecovery(error) {
  const copy = (en, ru) => (isRussian() ? ru : en);
  const unavailable = ['WORKSPACE_UNAVAILABLE', 'WORKSPACE_FORBIDDEN', 'NO_WORKSPACES'].includes(error.code) || error.status === 403;
  const spaces = S.ui.availableWorkspaces || [];
  const confirmed = ['directory', 'workspace', 'drafts'].includes(error.bootstrapStage);
  return `<div class="auth-card"><h1>${copy(unavailable ? 'Workspace unavailable' : confirmed ? 'Could not open the workspace' : 'Could not check your sign-in', unavailable ? 'Пространство недоступно' : confirmed ? 'Не удалось открыть пространство' : 'Не удалось проверить вход')}</h1>
    <p class="sub">${copy(unavailable ? 'Your account is signed in. Choose an available workspace or contact its administrator.' : confirmed ? 'Your session is retained. Check your connection and retry loading. Saved drafts remain on this device.' : 'The server did not confirm your sign-in. Check your connection and retry. This does not sign you out.', unavailable ? 'Вход в аккаунт выполнен. Выберите доступное пространство или обратитесь к его администратору.' : confirmed ? 'Сессия сохранена. Проверьте подключение и повторите загрузку. Сохранённые черновики остаются на устройстве.' : 'Сервер не подтвердил вход. Проверьте подключение и повторите проверку. Выход из аккаунта не выполняется.')}</p>
    ${error.bootstrapStage ? `<p class="hint">${copy('Last step', 'Последний этап')}: ${esc(bootstrapCopy(error.bootstrapStage, isRussian() ? 'ru' : 'en'))}</p>` : ''}
    <div class="col" style="gap:8px">${spaces
      .filter(item => !item.archived)
      .map(item => `<a class="btn btn-secondary" href="/${encodeURIComponent(item.url)}/home" translate="no">${esc(item.name || item.url)}</a>`)
      .join('')}
    ${spaces
      .filter(item => item.archived)
      .map(
        item =>
          `<button class="btn btn-secondary" data-a="restoreArchivedWorkspace" data-id="${esc(item.id)}">${copy('Restore', 'Восстановить')}: ${esc(item.name)}</button>`,
      )
      .join('')}
    <button class="btn btn-primary" data-a="retryWorkspaceConnection">${confirmed ? copy('Retry loading', 'Повторить загрузку') : copy('Retry connection', 'Повторить подключение')}</button>
    <a class="btn btn-ghost" href="/">${copy('Open main website', 'На главную сайта')}</a></div></div>`;
}

export function applyRecovery(error) {
  S.ui.auth = error.status === 401 ? 'login' : 'workspace-recovery';
  S.ui.workspaceRecoveryHtml = S.ui.auth === 'workspace-recovery' ? workspaceRecovery(error) : '';
  S.ui.authIssue = '';
}
