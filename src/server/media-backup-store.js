import { getWorkspaceDatabase, getWorkspaceFilesSnapshot, mutateWorkspaceMetadata, mutateWorkspaceCatalogCommand } from './workspace-store.js';

// Keep the latest core/ACL at every step; selected records never become a full
// catalog cache and cannot authorize a write against a different revision.
export function mediaBackupStore({
  core = getWorkspaceDatabase,
  files = getWorkspaceFilesSnapshot,
  metadata = mutateWorkspaceMetadata,
  catalog = mutateWorkspaceCatalogCommand,
} = {}) {
  return {
    load: options => (options?.ids?.length ? files(options.user, options.ids) : core({ catalog: 'none' })),
    mutate: async (change, revision, options = {}) => {
      if (options.mediaRestore) return catalog(change, revision, { ...options, demand: true });
      const selected = options.readIds?.length ? await files(options.user, options.readIds) : null;
      if (selected && selected.revision !== revision) throw Object.assign(Error('Workspace changed.'), { code: 'REVISION_CONFLICT', statusCode: 409 });
      return metadata(
        data => {
          if (!selected) return change(data);
          const original = data.files;
          const result = change({ ...data, files: selected.files });
          result.files = original;
          return result;
        },
        revision,
        { ...options, scope: 'mediaCopies' },
      );
    },
  };
}
