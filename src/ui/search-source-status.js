import { isRussian, t } from '../core/i18n.js';
import { A } from '../actions/actions.js';
import { S } from '../core/store.js';
import { clearWhiteboardSearch } from '../core/search.js';
import { workspaceSyncIsClean } from '../core/workspace-sync.js';
import { render } from '../shell/render.js';
import { esc } from '../core/utils.js';
import { toast } from './toast.js';
const sources = [
  ['files', 'fileStatus', 'Files'],
  ['knowledge', 'knowledgeStatus', 'Knowledge base'],
  ['whiteboards', 'whiteboardStatus', 'Whiteboards'],
];
export const sourceSearchIncomplete = (result, scope = 'all') => sources.some(([key, status]) => result[status] && (scope === 'all' || scope === key));
export function sourceSearchStatus(result, scope = 'all') {
  return sources
    .filter(([key, status]) => result[status] && (scope === 'all' || scope === key))
    .map(([key, status, label]) => {
      const value = result[status],
        ru = isRussian();
      const text =
        key === 'files' && result.fileErrorCode === 'INVALID_SEARCH'
          ? ru
            ? 'Для поиска файлов используйте не более 500 символов.'
            : 'Use up to 500 characters for file search.'
          : value === 'error'
            ? ru
              ? 'Поиск недоступен. Обновите данные и повторите.'
              : 'Search unavailable. Refresh data and retry.'
            : value === 'local'
              ? ru
                ? 'Поиск только в загруженных материалах.'
                : 'Search covers downloaded materials only.'
              : ru
                ? 'Поиск в полном каталоге…'
                : 'Searching the complete catalog…';
      return `<p class="hint search-result-status" role="${value === 'error' ? 'alert' : 'status'}" translate="no"><strong>${esc(t(label))}</strong> · ${text}${value === 'error' ? ` <button class="btn btn-ghost btn-sm" data-a="retryRemoteSearchSources">${ru ? 'Обновить и повторить' : 'Refresh and retry'}</button>` : ''}</p>`;
    })
    .join('');
}
A.retryRemoteSearchSources = async () => {
  try {
    if (workspaceSyncIsClean(S.data)) await (await import('../core/bootstrap.js')).refreshWorkspaceFromServer({ force: true });
  } catch {
    toast(isRussian() ? 'Не удалось обновить данные. Проверьте соединение.' : 'Unable to refresh data. Check your connection.', { kind: 'err' });
  }
  clearWhiteboardSearch();
  render();
};
