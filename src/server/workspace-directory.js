import { randomUUID, createHash } from 'node:crypto';
import { inWorkspace, workspaceScope } from './workspace-context.js';
import {
  createEmptyDatabase,
  getWorkspaceDatabase,
  initWorkspaceStore,
  reloadWorkspaceStore,
  mutateWorkspaceMetadata,
  replaceWorkspaceDatabase,
} from './workspace-store.js';
import { getStorageProvider } from './storage/index.js';
import { bindAccessProfiles, bindInitialAdministrator, memberForProfile } from '../shared/member-identity.js';
import { isActiveMember } from '../shared/workspace-membership.js';
import { mergeAccessProfiles, workspaceMemberRole, workspaceAccessProfiles } from '../shared/workspace-access.js';
import { workspaceSlug } from '../shared/workspace-slug.js';

const coreFields = ['ws', 'members', 'revision', 'updatedAt', '_documentRevisions', '_userPrefs'];
const forbidden = () => Object.assign(new Error('You do not have access to this workspace.'), { statusCode: 403, code: 'WORKSPACE_FORBIDDEN' });
export async function workspaceDirectoryEntries() {
  const root = await inWorkspace('default', () => getWorkspaceDatabase({ fields: ['_workspaceDirectory'] }));
  return (root._workspaceDirectory || []).filter(entry => entry?.id && entry?.url);
}

export async function readWorkspaceCore(id) {
  return inWorkspace(id, () => getWorkspaceDatabase({ fields: coreFields }));
}

export function workspaceUser(data, identity, { legacy = false, configured = [] } = {}) {
  const member = memberForProfile(data, identity);
  if (member && isActiveMember(member))
    return { ...identity, name: member.name, title: member.title || '', team: member.team || '', role: workspaceMemberRole(member) };
  // Configured accounts can initialize/access the original deployment only.
  if (!member && legacy && configured.some(profile => profile.active && profile.id === identity.id)) return identity;
  throw forbidden();
}

export async function listUserWorkspaces(identity, configured = []) {
  const entries = [{ id: 'default' }, ...(await workspaceDirectoryEntries())];
  const visible = await Promise.all(
    entries.map(async entry => {
      const data = await readWorkspaceCore(entry.id);
      let user;
      try {
        user = workspaceUser(data, identity, { legacy: entry.id === 'default', configured });
      } catch {
        return null;
      }
      return {
        id: entry.id,
        name: data.ws?.name || '',
        url: data.ws?.url || '',
        c: data.ws?.c || '#5A67D8',
        role: user.role,
        initialized: Boolean(data.ws?.name),
      };
    }),
  );
  return visible.filter(Boolean);
}

export async function directoryLoginProfiles(configured) {
  const root = await readWorkspaceCore('default');
  const profiles = mergeAccessProfiles(configured, root);
  const emails = new Set(profiles.map(profile => profile.email));
  for (const entry of await workspaceDirectoryEntries()) {
    const data = await readWorkspaceCore(entry.id);
    for (const profile of workspaceAccessProfiles(data)) {
      if (emails.has(profile.email)) continue;
      // Stable account identity across membership in several workspaces.
      profiles.push({ ...profile, id: `workspace:account-${createHash('sha256').update(profile.email).digest('hex').slice(0, 24)}` });
      emails.add(profile.email);
    }
  }
  return profiles;
}

export async function createWorkspace(identity, input, configured = []) {
  if (identity.role !== 'admin') throw forbidden();
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  const description = typeof input?.description === 'string' ? input.description.trim() : '';
  const color = input?.color || '#5A67D8';
  if (!name || name.length > 100 || description.length > 500 || !/^#[\da-f]{6}$/iu.test(color))
    throw Object.assign(new Error('Enter a name (up to 100 characters), description (up to 500) and a valid color.'), {
      statusCode: 400,
      code: 'WORKSPACE_INPUT_INVALID',
    });
  const sourceScope = workspaceScope();
  const source = await readWorkspaceCore(sourceScope);
  workspaceUser(source, identity, { legacy: sourceScope === 'default', configured });
  const entries = await workspaceDirectoryEntries();
  if (entries.length >= 50) throw Object.assign(new Error('The workspace limit has been reached.'), { statusCode: 409, code: 'WORKSPACE_LIMIT' });
  const id = randomUUID();
  const slug = workspaceSlug(name).slice(0, 48) || 'workspace';
  const url = `${slug}-${id.slice(0, 8)}`;
  const data = bindInitialAdministrator(createEmptyDatabase(), { ...identity, role: 'admin' });
  data.ws = { id, name, description, url, c: color, permissions: { createProjects: true } };
  data.workspaces = [{ id, name, c: color, plan: 'Free' }];
  const team = { id: `team-${id.slice(0, 8)}`, name: input?.locale === 'ru' ? 'Команда' : 'Team', c: color, icon: 'users' };
  data.teams = [team];
  const creator = data.members[0];
  Object.assign(creator, { role: 'Owner', status: 'active', team: team.id });
  team.members = [creator.id];
  if (input?.includeMembers === true) {
    for (const member of (sourceScope === 'default' ? bindAccessProfiles(source, configured).members : source.members) || []) {
      if (!isActiveMember(member) || memberForProfile({ members: [member] }, identity)) continue;
      const copy = { ...structuredClone(member), id: randomUUID(), role: workspaceMemberRole(member) === 'viewer' ? 'Guest' : 'Member', team: team.id };
      data.members.push(copy);
      team.members.push(copy.id);
    }
  }
  const storage = getStorageProvider(id);
  if (storage.name === 'google-drive') {
    const parent = getStorageProvider('default');
    await parent.init();
    storage.parentFolderId = parent.rootFolderId;
  }
  // A UUID namespace has one creator. Only this provisioning path may bootstrap
  // its metadata on Vercel; ordinary requests retain the strict missing-file guard.
  storage.allowBootstrap = true;
  try {
    await inWorkspace(id, async () => {
      await initWorkspaceStore();
      // Drive create responses need not contain an ETag. Read the new root's
      // validator before the first conditional write instead of weakening CAS.
      await reloadWorkspaceStore();
      await replaceWorkspaceDatabase(data, 0, { role: 'admin' });
      await storage.ensureUploadsFolder?.();
      await storage.ensureBackupsFolder?.();
      await storage.savePushSubscriptions?.([]);
      await storage.saveNotificationDeliveryStatus?.({ version: 1 });
    });
  } finally {
    storage.allowBootstrap = false;
  }
  // Publish only after complete provisioning. CAS retries serialize creators.
  await inWorkspace('default', async () => {
    for (let attempt = 0; ; attempt++) {
      const root = await getWorkspaceDatabase({ fields: ['revision', '_workspaceDirectory'] });
      try {
        await mutateWorkspaceMetadata(
          current => {
            const list = current._workspaceDirectory || [];
            if (list.length >= 50) throw Object.assign(new Error('The workspace limit has been reached.'), { statusCode: 409 });
            current._workspaceDirectory = [...list, { id, url, createdAt: new Date().toISOString() }];
            return current;
          },
          root.revision,
          { scope: 'directory', workspaceDirectory: true },
        );
        break;
      } catch (error) {
        if (error.code !== 'REVISION_CONFLICT' || attempt >= 2) throw error;
      }
    }
  });
  return { id, url, name, c: color, role: 'admin', initialized: true };
}

export async function requireWorkspace(request, response, next) {
  if (request.path === '/auth/me' && !request.get('X-Smena-Workspace') && !request.query.workspace) return next();
  const id = request.get('X-Smena-Workspace') || request.query.workspace || 'default';
  try {
    if (request.get('X-Smena-Workspace') && request.query.workspace && request.get('X-Smena-Workspace') !== request.query.workspace) throw forbidden();
    if (id !== 'default' && !(request.workspaceSnapshot?._workspaceDirectory || []).some(entry => entry.id === id)) throw forbidden();
    const data = id === 'default' && request.workspaceSnapshot ? request.workspaceSnapshot : await readWorkspaceCore(id);
    request.user = workspaceUser(data, request.user, { legacy: id === 'default', configured: request.configuredProfiles || [] });
    request.workspaceSnapshot = data;
    inWorkspace(id, next);
  } catch (error) {
    next(error);
  }
}
