import { isDeepStrictEqual as same } from 'node:util';
import { bindAccessProfiles, memberForProfile } from '../shared/member-identity.js';
import { canEditProject } from '../shared/project-access.js';
import { assertFileFolder } from '../shared/file-organization.js';
import { workspaceCoreData } from '../shared/workspace-documents.js';
import { currentCatalogUser } from './file-catalog-query.js';
import { permissionError, projectWorkspace } from './workspace-policy.js';
import { filePatchTasks } from './storage/catalog-file-write.js';

export function planFileMetadataPatch(core, incoming, changes, user, profiles) {
  if (Object.hasOwn(incoming, 'files')) return null;
  // Use the stored member role, never the role from a stale request snapshot.
  user = currentCatalogUser(core, user);
  const member = memberForProfile(core, user);
  if (!member) return null; // Initial member binding requires the canonical path.
  if (!['admin', 'editor'].includes(user.role)) throw permissionError('files');
  const identities = new Map(core.files.map(file => [file.id, file]));
  for (const file of changes.upsert) {
    const before = identities.get(file.id);
    if (!before) return null; // Creation/duplication requires full validation.
    const project = core.projects.find(project => project.id === before.project);
    if (!canEditProject(project, member.id, user.role)) throw permissionError('files');
    if (file.project !== before.project) return null;
    assertFileFolder(project, file.folderId);
  }
  const expected = projectWorkspace(workspaceCoreData(bindAccessProfiles(structuredClone(core), profiles)), user);
  expected.me = member.id;
  expected.tasks = filePatchTasks(expected, changes.upsert);
  // Any other difference (including an unrecognized field) needs a complete
  // canonical merge. Omitted client fields imply no mutation, never deletion.
  for (const [key, value] of Object.entries(incoming)) if (!same(value, expected[key])) return null;
  return { tasks: filePatchTasks(core, changes.upsert) };
}
