import { isDeepStrictEqual as same } from 'node:util';
import { bindAccessProfiles, memberForProfile } from '../shared/member-identity.js';
import { workspaceCoreData } from '../shared/workspace-documents.js';
import { detachTaskFile } from '../shared/file-identity.js';
import { projectWorkspace, permissionError } from './workspace-policy.js';
import { mutateWorkspaceCatalogCommand } from './workspace-store.js';

export async function tryMutateWorkspaceFileRemoval(incoming, changes, revision, user, profiles) {
  if (
    Object.hasOwn(incoming, 'files') ||
    !Array.isArray(changes?.upsert) ||
    changes.upsert.length ||
    !Array.isArray(changes.remove) ||
    !changes.remove.length ||
    changes.remove.length > 500 ||
    new Set(changes.remove).size !== changes.remove.length ||
    changes.remove.some(id => typeof id !== 'string')
  )
    return null;
  const ids = new Set(changes.remove);
  return mutateWorkspaceCatalogCommand(
    (partial, actor, identities) => {
      const member = memberForProfile(partial, actor)?.id;
      const files = new Map(partial.files.map(file => [file.id, file]));
      const selected = [...ids].map(id => files.get(id));
      if (selected.some(file => !file)) return null;
      if (actor.role !== 'admin' && selected.some(file => file.by && file.by !== member)) throw permissionError('files');
      const known = new Set(partial.trash.map(item => item.id));
      const added = (incoming.trash || []).filter(item => !known.has(item.id));
      if (
        added.length !== ids.size ||
        new Set(added.map(item => item.data?.file?.id)).size !== ids.size ||
        new Set(added.map(item => item.id)).size !== added.length
      )
        return null;
      for (const file of selected) {
        const attachment = detachTaskFile(file.task ? partial.tasks.find(task => task.id === file.task) : null, file);
        const entry = added.find(item => item.data?.file?.id === file.id);
        if (!entry || !/^[\p{L}\p{N}_.:@+-]{1,180}$/u.test(entry.id) || !Number.isFinite(entry.deletedAt)) return null;
        const { id, deletedAt, ...content } = entry;
        void id;
        void deletedAt;
        if (!same(content, { kind: 'file', name: file.name, deletedBy: member, data: { file, attachment: attachment || null } })) return null;
      }
      partial.trash = [...added, ...partial.trash];
      partial.files = partial.files.filter(file => !ids.has(file.id));
      const projected = { ...partial, files: identities.files.filter(file => !ids.has(file.id)) };
      const expected = projectWorkspace(workspaceCoreData(bindAccessProfiles(projected, profiles)), actor);
      expected.me = member;
      for (const [key, value] of Object.entries(incoming)) if (!same(value, expected[key])) return null;
      return partial;
    },
    revision,
    { demand: true, tryOnly: true, ids: [...ids], user, role: user.role },
  );
}
