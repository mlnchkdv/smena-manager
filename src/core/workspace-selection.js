import { S } from './store.js';
import { setActiveWorkspace, workspaceDirectoryRequest } from './api.js';
import { parseAppLocation } from '../shared/app-location.js';

export async function selectInitialWorkspace(user) {
  const { workspaces } = await workspaceDirectoryRequest();
  if (!workspaces?.length) throw new Error('Your account has no available workspaces. Contact an administrator.');
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
  if (!selected) throw new Error('This workspace is unavailable. Open the main website to choose an available workspace.');
  setActiveWorkspace(selected.id);
  S.ui.availableWorkspaces = workspaces;
  S.ui.activeWorkspace = selected.id;
  try {
    sessionStorage.setItem(`smena.workspace:${user.id}`, selected.id);
  } catch {
    /* Per-tab URL is authoritative. */
  }
}
