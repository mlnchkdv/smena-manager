import { S } from './store.js';
import { setActiveWorkspace, workspaceDirectoryRequest } from './api.js';
import { parseAppLocation } from '../shared/app-location.js';

export async function selectInitialWorkspace(user) {
  const { workspaces } = await workspaceDirectoryRequest();
  S.ui.availableWorkspaces = workspaces || [];
  if (!workspaces?.length) throw Object.assign(new Error('No available workspaces'), { code: 'NO_WORKSPACES' });
  const slug = parseAppLocation(location.pathname).slug;
  let remembered = '';
  try {
    remembered = sessionStorage.getItem(`smena.workspace:${user.id}`) || '';
  } catch {
    /* URL selection still works without storage. */
  }
  const selected =
    workspaces.find(item => item.url === slug && slug) ||
    (!slug && (workspaces.find(item => item.id === remembered && item.initialized) || workspaces.find(item => item.initialized) || workspaces[0]));
  if (!selected) throw Object.assign(new Error('Workspace unavailable'), { code: 'WORKSPACE_UNAVAILABLE' });
  setActiveWorkspace(selected.id);
  S.ui.availableWorkspaces = workspaces;
  S.ui.activeWorkspace = selected.id;
  try {
    sessionStorage.setItem(`smena.workspace:${user.id}`, selected.id);
  } catch {
    /* Per-tab URL is authoritative. */
  }
}
