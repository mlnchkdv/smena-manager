import { A, IN, confirmDlg } from '../actions/actions.js';
import { D, S, flushLocalSave } from '../core/store.js';
import { esc, $ } from '../core/utils.js';
import { isRussian, t } from '../core/i18n.js';
import { getActiveWorkspace, workspaceDirectoryRequest, deleteAllWorkspaces } from '../core/api.js';
import { workspaceSyncIsClean } from '../core/workspace-sync.js';
import { personalPreferenceSyncState } from '../core/personal-preferences.js';
import { workspaceSlug } from '../shared/workspace-slug.js';
import { openModal, workspaceModalRenderers } from '../overlays/modals.js';
import { go, render } from '../shell/render.js';
import { mutate, toast } from './toast.js';
import { colorPalette, WORKSPACE_COLORS } from './color-palette.js';

const copy = (en, ru) => (isRussian() ? ru : en);
function canLeave() {
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
  if (!target || target.id === getActiveWorkspace()) {
    S.ui.pop = null;
    return render();
  }
  if (canLeave()) location.assign(`/${encodeURIComponent(target.url)}/home`);
}

export function openWorkspaceCreation() {
  if (S.ui.currentUser?.role !== 'admin' || !canLeave()) return;
  S.ui.mnav = false;
  openModal({ type: 'workspaceCreate', name: '', description: '', color: D().ws.c || '#5A67D8', includeMembers: false, error: '' });
}

workspaceModalRenderers.create = (
  m,
  H,
) => `${H(copy('Create workspace', 'Создать рабочее пространство'), copy('A separate place for projects, files and knowledge.', 'Отдельное место для проектов, файлов и базы знаний.'))}
  <form data-submit="submitWorkspace"><div class="modal-b col" style="gap:16px">
    <label class="field"><span class="label">${t('Workspace name')}</span><input class="input" id="new-ws-name" maxlength="100" required autofocus data-in="workspaceDraft" data-k="name" value="${esc(m.name)}" placeholder="${esc(copy('For example, Product team', 'Например, Команда продукта'))}" ${m.busy ? 'disabled' : ''}></label>
    <label class="field"><span class="label">${t('Description')}</span><textarea class="input" id="new-ws-description" rows="3" maxlength="500" data-in="workspaceDraft" data-k="description" ${m.busy ? 'disabled' : ''}>${esc(m.description)}</textarea></label>
    <div class="field"><span class="label">${t('Color')}</span>${colorPalette({ label: 'Workspace icon', value: m.color, colors: WORKSPACE_COLORS, action: 'workspaceDraftColor', size: 26 })}</div>
    <label class="row" style="align-items:flex-start;gap:10px"><input type="checkbox" data-in="workspaceDraft" data-k="includeMembers" ${m.includeMembers ? 'checked' : ''} ${m.busy ? 'disabled' : ''}><span>${copy('Include current workspace members', 'Добавить участников текущего пространства')}<span class="hint" style="display:block;margin-top:4px">${copy('They join as members. Guests retain read-only access.', 'Они получат роль участника. Гости сохранят доступ только для чтения.')}</span></span></label>
    <p class="hint" style="margin:0">${copy('You become the owner. Content and permissions are managed separately in each workspace.', 'Вы станете владельцем. Данные и права в каждом пространстве настраиваются отдельно.')}</p>
    ${m.error ? `<p role="alert" style="color:var(--red);margin:0">${esc(m.error)}</p>` : ''}
  </div><div class="modal-f"><button type="button" class="btn btn-secondary" data-a="closeModal" ${m.busy ? 'disabled' : ''}>${t('Cancel')}</button><button type="submit" class="btn btn-primary ${m.busy ? 'is-loading' : ''}" ${m.busy ? 'disabled' : ''}>${copy(m.busy ? 'Creating workspace…' : 'Create workspace', m.busy ? 'Создание пространства…' : 'Создать пространство')}</button></div></form>`;

IN.workspaceDraft = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type === 'workspaceCreate' && !m.busy) m[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value;
};
A.workspaceDraftColor = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'workspaceCreate' || m.busy) return;
  m.color = el.dataset.v;
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
  m.busy = true;
  S.ui.atomicOperation = true;
  render();
  try {
    const { workspace } = await workspaceDirectoryRequest({
      method: 'POST',
      body: JSON.stringify({ name: m.name, description: m.description, color: m.color, includeMembers: m.includeMembers, locale: isRussian() ? 'ru' : 'en' }),
    });
    location.assign(`/${encodeURIComponent(workspace.url)}/settings/workspace`);
  } catch (error) {
    m.error = copy(
      'Could not create the workspace. Check your connection and try again.',
      'Не удалось создать пространство. Проверьте подключение и повторите попытку.',
    );
    if (error.code === 'WORKSPACE_LIMIT') m.error = copy('The workspace limit has been reached (50).', 'Достигнут лимит рабочих пространств (50).');
    m.busy = false;
    render();
  } finally {
    S.ui.atomicOperation = false;
  }
};

export function saveWorkspaceSettings() {
  if (S.ui.currentUser?.role !== 'admin') return;
  const name = $('#ws-name').value.trim();
  const url = workspaceSlug($('#ws-url').value);
  const description = $('#ws-description').value.trim();
  const previousUrl = D().ws.url;
  if (!name || name.length > 100) return toast(copy('Enter a name up to 100 characters.', 'Укажите название длиной до 100 символов.'), { kind: 'err' });
  if (getActiveWorkspace() === 'default' && S.ui.availableWorkspaces?.some(item => item.id !== 'default' && item.url === url))
    return toast(copy('This workspace address is already in use.', 'Этот адрес пространства уже занят.'), { kind: 'err' });
  if (
    mutate(() => {
      Object.assign(D().ws, {
        name,
        description,
        c: S.ui.workspaceSettingsDraft?.c || D().ws.c,
        url: getActiveWorkspace() === 'default' ? url || D().ws.url : D().ws.url,
      });
      const item = D().workspaces?.find(item => item.id === D().ws.id);
      if (item) Object.assign(item, { name, c: D().ws.c });
    })
  ) {
    S.ui.workspaceSettingsDraft = null;
    S.ui.workspaceSettingsDirty = false;
    if (previousUrl !== D().ws.url) go('settings', { sec: 'workspace' });
    toast('Workspace settings saved');
  }
}

export function deleteWorkspace() {
  confirmDlg({
    title: `${copy('Delete', 'Удалить')} ${D().ws.name}?`,
    body: copy(
      'All content in this workspace will be deleted. Other workspaces remain available.',
      'Все данные этого пространства будут удалены. Другие пространства останутся доступны.',
    ),
    ok: t('Delete workspace'),
    danger: true,
    typeName: D().ws.name,
    run: async () => {
      if (!canLeave()) return;
      try {
        await deleteAllWorkspaces(S.ui.workspaceRevision);
        const next = S.ui.availableWorkspaces?.find(item => item.id !== getActiveWorkspace() && item.initialized);
        location.assign(next ? `/${encodeURIComponent(next.url)}/home` : '/');
      } catch {
        toast(copy('The workspace could not be deleted.', 'Не удалось удалить пространство.'), { kind: 'err' });
      }
    },
  });
}

IN.workspaceSettings = el => {
  const draft = (S.ui.workspaceSettingsDraft ||= { ...D().ws });
  draft[el.dataset.k] = el.value;
  S.ui.workspaceSettingsDirty = ['name', 'description', 'url', 'c'].some(k => (draft[k] || '') !== (D().ws[k] || ''));
};
A.wsColor = el => {
  IN.workspaceSettings({ dataset: { k: 'c' }, value: el.dataset.v });
  render();
};
A.cancelWorkspaceSettings = () => {
  S.ui.workspaceSettingsDraft = null;
  S.ui.workspaceSettingsDirty = false;
  render();
};

window.addEventListener('beforeunload', event => {
  if (S.ui.workspaceSettingsDirty) {
    event.preventDefault();
    event.returnValue = '';
  }
});

S.ui.beforeWorkspaceSettingsLeave = (route, params) => {
  if (S.ui.workspaceSettingsDirty && (route !== 'settings' || params.sec !== 'workspace')) {
    if (!window.confirm(isRussian() ? 'Отменить несохранённые настройки пространства?' : 'Discard unsaved workspace settings?')) return false;
    S.ui.workspaceSettingsDraft = null;
    S.ui.workspaceSettingsDirty = false;
  }

  return true;
};
