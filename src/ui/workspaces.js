import { A, IN, confirmDlg } from '../actions/actions.js';
import { D, S, flushLocalSave } from '../core/store.js';
import { esc, $ } from '../core/utils.js';
import { isRussian, t } from '../core/i18n.js';
import { getActiveWorkspace, workspaceDirectoryRequest, deleteAllWorkspaces } from '../core/api.js';
import { workspaceSyncIsClean } from '../core/workspace-sync.js';
import { personalPreferenceSyncState } from '../core/personal-preferences.js';
import { mergeWorkspaceSettings } from '../shared/workspace-settings-draft.js';
import { workspaceSlug } from '../shared/workspace-slug.js';
import { openModal, workspaceModalRenderers } from '../overlays/modals.js';
import { go, render } from '../shell/render.js';
import { mutate, toast } from './toast.js';
import { colorPalette, WORKSPACE_COLORS } from './color-palette.js';

const copy = (en, ru) => (isRussian() ? ru : en);
const creationKey = () => `smena.workspace.create:${S.ui.currentUser?.id}:${getActiveWorkspace()}`;
function rememberCreation(m) {
  try {
    sessionStorage.setItem(
      creationKey(),
      JSON.stringify({
        operationId: m.operationId,
        name: m.name,
        description: m.description,
        color: m.color,
        includeMembers: m.includeMembers,
        savedAt: Date.now(),
      }),
    );
  } catch {
    /* In-memory draft still works. */
  }
}
function canLeave() {
  if (S.ui.workspaceSettingsDirty) {
    toast(copy('Save or cancel workspace settings before leaving.', 'Сохраните или отмените настройки пространства перед переходом.'), { kind: 'info' });
    return false;
  }
  flushLocalSave();
  const uploading = (S.ui.uploads || []).some(item => !['done', 'cancelled', 'error'].includes(item.status));
  if (
    !workspaceSyncIsClean(D()) ||
    personalPreferenceSyncState().pending ||
    S.ui.atomicOperation ||
    uploading ||
    S.ui.fileExportRunning ||
    S.ui.knowledgeDirty ||
    S.ui.workspaceSettingsDirty ||
    S.ui.modals.some(modal => ['task', 'project'].includes(modal.type)) ||
    (S.ui.fileDownload && !['ready', 'expired', 'failed'].includes(S.ui.fileDownload.phase)) ||
    ['preparing', 'ready'].includes(S.ui.fileNativeTransfer?.phase)
  ) {
    toast(
      copy(
        'Wait for changes and uploads to finish before switching workspaces.',
        'Дождитесь сохранения изменений и завершения загрузок перед сменой пространства.',
      ),
      { kind: 'info', ms: 6000 },
    );
    return false;
  }
  return true;
}

export function switchWorkspace(el) {
  const target = S.ui.availableWorkspaces?.find(item => item.id === el.dataset.v);
  if (!target || target.archived || target.id === getActiveWorkspace()) {
    S.ui.pop = null;
    return render();
  }
  if (canLeave()) location.assign(`/${encodeURIComponent(target.url)}/home`);
}

export function openWorkspaceCreation() {
  if (S.ui.currentUser?.role !== 'admin' || !canLeave()) return;
  S.ui.mnav = false;
  let draft;
  try {
    draft = JSON.parse(sessionStorage.getItem(creationKey()) || 'null');
  } catch {
    /* Optional cache. */
  }
  openModal({
    type: 'workspaceCreate',
    operationId: crypto.randomUUID(),
    name: '',
    description: '',
    color: D().ws.c || '#5A67D8',
    includeMembers: false,
    error: '',
    ...(draft?.savedAt > Date.now() - 86400000 ? draft : {}),
  });
}

workspaceModalRenderers.create = (
  m,
  H,
) => `${H(copy('Create workspace', 'Создать рабочее пространство'), copy('A separate place for projects, files and knowledge.', 'Отдельное место для проектов, файлов и базы знаний.'))}
  <form data-submit="submitWorkspace"><div class="modal-b col" style="gap:16px">
    <label class="field"><span class="label">${t('Workspace name')}</span><input class="input" id="new-ws-name" maxlength="100" required autofocus data-in="workspaceDraft" data-k="name" value="${esc(m.name)}" placeholder="${esc(copy('For example, Product team', 'Например, Команда продукта'))}" ${m.busy ? 'disabled' : ''}></label>
    <label class="field"><span class="label">${t('Description')}</span><textarea class="textarea workspace-description" id="new-ws-description" aria-describedby="new-ws-description-hint" rows="3" maxlength="500" data-in="workspaceDraft" data-k="description" ${m.busy ? 'disabled' : ''}>${esc(m.description)}</textarea><small class="hint" id="new-ws-description-hint" data-description-count>${m.description.length} / 500</small></label>
    <div class="field"><span class="label">${t('Color')}</span>${colorPalette({ label: 'Workspace icon', value: m.color, colors: WORKSPACE_COLORS, action: 'workspaceDraftColor', size: 26 })}</div>
    <label class="row" style="align-items:flex-start;gap:10px"><input type="checkbox" data-in="workspaceDraft" data-k="includeMembers" ${m.includeMembers ? 'checked' : ''} ${m.busy ? 'disabled' : ''}><span>${copy('Include current workspace members', 'Добавить участников текущего пространства')}<span class="hint" style="display:block;margin-top:4px">${copy('They join as members. Guests retain read-only access.', 'Они получат роль участника. Гости сохранят доступ только для чтения.')}</span></span></label>
    <p class="hint" style="margin:0">${copy('You become the owner. Content and permissions are managed separately in each workspace.', 'Вы станете владельцем. Данные и права в каждом пространстве настраиваются отдельно.')}</p>
    ${m.error ? `<p role="alert" style="color:var(--red);margin:0">${esc(m.error)}</p>` : ''}
  </div><div class="modal-f"><button type="button" class="btn btn-secondary" data-a="closeModal" ${m.busy ? 'disabled' : ''}>${t('Cancel')}</button><button type="submit" class="btn btn-primary ${m.busy ? 'is-loading' : ''}" ${m.busy ? 'disabled' : ''}>${copy(m.busy ? 'Creating workspace…' : 'Create workspace', m.busy ? 'Создание пространства…' : 'Создать пространство')}</button></div></form>`;

IN.workspaceDraft = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type === 'workspaceCreate' && !m.busy) {
    m[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value;
    rememberCreation(m);
    if (el.dataset.k === 'description') el.closest('.field')?.querySelector('[data-description-count]')?.replaceChildren(`${el.value.length} / 500`);
  }
};
A.workspaceDraftColor = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'workspaceCreate' || m.busy) return;
  m.color = el.dataset.v;
  rememberCreation(m);
  render();
};
A.submitWorkspace = async () => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'workspaceCreate' || m.busy || !canLeave()) return;
  m.name = $('#new-ws-name').value.trim();
  m.description = $('#new-ws-description').value.trim();
  if (!m.name) {
    m.error = copy('Enter a workspace name.', 'Укажите название пространства.');
    return render();
  }
  rememberCreation(m);
  m.busy = true;
  S.ui.atomicOperation = true;
  render();
  try {
    const { workspace } = await workspaceDirectoryRequest({
      method: 'POST',
      body: JSON.stringify({
        operationId: m.operationId,
        name: m.name,
        description: m.description,
        color: m.color,
        includeMembers: m.includeMembers,
        locale: isRussian() ? 'ru' : 'en',
      }),
    });
    try {
      sessionStorage.removeItem(creationKey());
    } catch {
      /* Optional cache. */
    }
    S.ui.atomicOperation = false;
    location.assign(`/${encodeURIComponent(workspace.url)}/settings/workspace`);
  } catch (error) {
    m.error = copy(
      'Could not create the workspace. Check your connection and try again.',
      'Не удалось создать пространство. Проверьте подключение и повторите попытку.',
    );
    if (error.code === 'WORKSPACE_CREATING')
      m.error = copy(
        'Creation is still running. Wait a moment, then check again with the same form.',
        'Создание ещё выполняется. Подождите и проверьте результат повторно в этой форме.',
      );
    if (error.code === 'WORKSPACE_INPUT_CHANGED') {
      m.operationId = crypto.randomUUID();
      m.error = copy(
        'The previous operation used other settings. Check the workspace list before creating another.',
        'Предыдущая операция использовала другие настройки. Проверьте список пространств перед новым созданием.',
      );
    }
    if (error.code === 'WORKSPACE_INPUT_INVALID')
      m.error = copy('Check the workspace name, description and color.', 'Проверьте название, описание и цвет пространства.');
    if (error.status === 403) m.error = copy('Only an administrator can create workspaces.', 'Создавать пространства может только администратор.');
    if (error.code === 'WORKSPACE_LIMIT') m.error = copy('The workspace limit has been reached (50).', 'Достигнут лимит рабочих пространств (50).');
    m.busy = false;
    render();
  } finally {
    S.ui.atomicOperation = false;
  }
};

export function saveWorkspaceSettings() {
  if (S.ui.currentUser?.role !== 'admin' || !S.ui.workspaceSettingsDirty) return;
  const reject = message => {
    S.ui.workspaceSettingsError = message;
    updateWorkspaceSettingsFeedback();
    return toast(message, { kind: 'err', ms: 8000 });
  };
  const name = $('#ws-name').value.trim();
  const url = workspaceSlug($('#ws-url').value);
  const description = $('#ws-description').value.trim();
  const previousUrl = D().ws.url;
  const merged = mergeWorkspaceSettings(
    S.ui.workspaceSettingsBase || D().ws,
    { ...S.ui.workspaceSettingsDraft, name, description, url: url || D().ws.url },
    D().ws,
  );
  if (merged.conflicts.length)
    return reject(
      copy(
        'These settings changed in another session. Cancel to load the latest values before saving again.',
        'Эти настройки изменены в другой сессии. Нажмите «Отмена», чтобы загрузить актуальные значения перед сохранением.',
      ),
    );
  const next = { ...merged.value, url: getActiveWorkspace() === 'default' ? workspaceSlug(merged.value.url) || D().ws.url : D().ws.url };
  if (!next.name || next.name.length > 100) return reject(copy('Enter a name up to 100 characters.', 'Укажите название длиной до 100 символов.'));
  if ((next.description || '').length > 500) return reject(copy('Enter a description up to 500 characters.', 'Укажите описание длиной до 500 символов.'));
  if (getActiveWorkspace() === 'default' && S.ui.availableWorkspaces?.some(item => item.id !== 'default' && item.url === next.url))
    return reject(copy('This workspace address is already in use.', 'Этот адрес пространства уже занят.'));
  if (
    mutate(() => {
      Object.assign(D().ws, {
        name: next.name,
        description: next.description,
        c: next.c,
        url: next.url,
      });
      const item = D().workspaces?.find(item => item.id === D().ws.id);
      if (item) Object.assign(item, { name: D().ws.name, c: D().ws.c });
    })
  ) {
    S.ui.workspaceSettingsDraft = null;
    S.ui.workspaceSettingsDirty = false;
    S.ui.workspaceSettingsError = '';
    S.ui.workspaceSettingsSubmitted = { ...D().ws };
    S.ui.workspaceSettingsSaveState = 'syncing';
    if (previousUrl !== D().ws.url) go('settings', { sec: 'workspace' });
    render();
  }
}

export function deleteWorkspace() {
  confirmDlg({
    title: `${copy('Clear content', 'Очистить содержимое')}: ${D().ws.name}?`,
    body: copy(
      'Content will be cleared. The workspace identity and access remain. A safety backup is retained. Other workspaces are not affected.',
      'Содержимое будет очищено. Пространство и доступ участников сохранятся. Перед операцией останется резервная копия. Другие пространства не затрагиваются.',
    ),
    ok: copy('Clear content', 'Очистить содержимое'),
    danger: true,
    typeName: D().ws.name,
    awaitRun: true,
    beforeRun: canLeave,
    busyLabel: copy('Clearing content…', 'Очистка содержимого…'),
    failureMessage: copy(
      'The content could not be cleared. Check the connection and try again.',
      'Не удалось очистить содержимое. Проверьте подключение и повторите попытку.',
    ),
    run: async () => {
      await deleteAllWorkspaces(S.ui.workspaceRevision);
      const next = S.ui.availableWorkspaces?.find(item => item.id !== getActiveWorkspace() && item.initialized && !item.archived);
      return next ? `/${encodeURIComponent(next.url)}/home` : '/';
    },
    onSuccess: url => location.assign(url),
  });
}

IN.workspaceSettings = el => {
  const draft = (S.ui.workspaceSettingsDraft ||= { ...D().ws });
  draft[el.dataset.k] = el.value;
  if (el.dataset.k === 'description') el.closest('.field')?.querySelector('[data-description-count]')?.replaceChildren(`${el.value.length} / 500`);
  S.ui.workspaceSettingsDirty = ['name', 'description', 'url', 'c'].some(k => (draft[k] || '') !== (D().ws[k] || ''));
  S.ui.workspaceSettingsError = '';
  updateWorkspaceSettingsFeedback();
};
A.wsColor = el => {
  IN.workspaceSettings({ dataset: { k: 'c' }, value: el.dataset.v });
  render();
};
A.cancelWorkspaceSettings = () => {
  S.ui.workspaceSettingsDraft = null;
  S.ui.workspaceSettingsDirty = false;
  S.ui.workspaceSettingsError = '';
  render();
};

export function workspaceSettingsFeedback() {
  if (S.ui.workspaceSettingsError) return { state: 'error', text: S.ui.workspaceSettingsError };
  if (S.ui.workspaceSettingsDirty) return { state: 'dirty', text: copy('Unsaved changes', 'Есть несохранённые изменения') };
  const state = S.ui.workspaceSettingsSaveState || 'idle';
  const messages = {
    idle: ['No changes', 'Нет изменений'],
    syncing: ['Saved locally. Waiting for server confirmation…', 'Сохранено локально. Ожидаем подтверждение сервера…'],
    saved: ['Settings synchronized', 'Настройки синхронизированы'],
    offline: ['Saved locally. Will sync when connected.', 'Сохранено локально. Синхронизируем после подключения.'],
    error: [
      'Could not synchronize settings. Your changes are retained; check system status.',
      'Не удалось синхронизировать настройки. Изменения сохранены локально; проверьте статус системы.',
    ],
  };
  return { state, text: copy(...(messages[state] || messages.error)) };
}
function updateWorkspaceSettingsFeedback() {
  const status = $('#workspace-settings-status');
  const feedback = workspaceSettingsFeedback();
  if (status) {
    status.textContent = feedback.text;
    status.dataset.state = feedback.state;
  }
  const button = $('#ws-save');
  if (button) button.disabled = !S.ui.workspaceSettingsDirty || !!S.ui.atomicOperation;
}
window.addEventListener('smena:sync-status', ({ detail }) => {
  if (!S.ui.workspaceSettingsSubmitted || (detail.scope && detail.scope !== 'workspace')) return;
  if (detail.status === 'saved') {
    const expected = S.ui.workspaceSettingsSubmitted;
    if (!['name', 'description', 'url', 'c'].every(key => (detail.sentData?.ws?.[key] || '') === (expected[key] || ''))) return;
    S.ui.workspaceSettingsSaveState = 'saved';
  } else if (detail.status === 'syncing') S.ui.workspaceSettingsSaveState = 'syncing';
  else if (detail.status === 'offline') S.ui.workspaceSettingsSaveState = 'offline';
  else if (['unavailable', 'invalid', 'too_large', 'conflict', 'forbidden'].includes(detail.status)) S.ui.workspaceSettingsSaveState = 'error';
  updateWorkspaceSettingsFeedback();
});

window.addEventListener('beforeunload', event => {
  if (S.ui.workspaceSettingsDirty || S.ui.atomicOperation) {
    event.preventDefault();
    event.returnValue = '';
  }
});

S.ui.beforeWorkspaceSettingsLeave = (route, params) => {
  if (S.ui.atomicOperation) return false;
  if (S.ui.workspaceSettingsDirty && (route !== 'settings' || params.sec !== 'workspace')) {
    if (!window.confirm(isRussian() ? 'Отменить несохранённые настройки пространства?' : 'Discard unsaved workspace settings?')) return false;
    S.ui.workspaceSettingsDraft = null;
    S.ui.workspaceSettingsDirty = false;
    S.ui.workspaceSettingsError = '';
  }

  return true;
};

A.archiveWorkspace = () =>
  confirmDlg({
    title: copy('Archive this workspace?', 'Архивировать пространство?'),
    body: copy(
      'Content is retained. Administrators can restore access from workspace settings.',
      'Содержимое сохраняется. Администратор сможет вернуть пространство в настройках.',
    ),
    ok: t('Archive'),
    awaitRun: true,
    beforeRun: canLeave,
    busyLabel: copy('Archiving workspace…', 'Архивирование пространства…'),
    failureMessage: copy(
      'Could not archive workspace. Check the connection and try again.',
      'Не удалось архивировать пространство. Проверьте подключение и повторите попытку.',
    ),
    run: async () => {
      await workspaceDirectoryRequest({ method: 'POST', path: `/api/workspaces/${getActiveWorkspace()}/archive`, body: JSON.stringify({ archived: true }) });
    },
    onSuccess: () => location.assign('/'),
  });
A.restoreArchivedWorkspace = async el => {
  try {
    const result = await workspaceDirectoryRequest({
      method: 'POST',
      path: `/api/workspaces/${el.dataset.id}/archive`,
      body: JSON.stringify({ archived: false }),
    });
    S.ui.availableWorkspaces = result.workspaces;
    if (S.ui.auth) return location.assign('/');
    render();
  } catch {
    toast(copy('Could not restore workspace.', 'Не удалось вернуть пространство.'), { kind: 'err' });
  }
};

export async function refreshWorkspaces(force = true) {
  if (S.ui.workspaceDirectoryLoading || (!force && Date.now() - (S.ui.workspaceDirectoryCheckedAt || 0) < 30000)) return;
  S.ui.workspaceDirectoryLoading = true;
  S.ui.workspaceDirectoryError = '';
  try {
    const { workspaces } = await workspaceDirectoryRequest();
    S.ui.availableWorkspaces = workspaces;
    S.ui.workspaceDirectoryCheckedAt = Date.now();
  } catch {
    S.ui.workspaceDirectoryError = copy('Could not refresh workspaces. Try again.', 'Не удалось обновить список пространств. Повторите попытку.');
  } finally {
    S.ui.workspaceDirectoryLoading = false;
    S.ui.workspaceDirectoryCheckedAt = Date.now();
    if (S.ui.pop?.type === 'ws' || S.ui.palette?.mode === 'ws' || S.ui.route === 'settings') render();
  }
}
A.refreshWorkspaces = () => refreshWorkspaces();
