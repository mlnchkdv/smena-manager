import { Router } from 'express';
import { requireRole } from './auth.js';
import { mediaBackupStore } from './media-backup-store.js';
import { getStorageProvider } from './storage/index.js';
import { mediaBackupService } from './media-backups.js';
import { workspaceScope, validWorkspaceScope } from './workspace-context.js';
import { workspaceDirectoryEntries } from './workspace-directory.js';
export const mediaBackupRouter = Router();
const service = () =>
  mediaBackupService({
    ...mediaBackupStore(),
    storage: getStorageProvider(),
    scope: workspaceScope(),
    resolveSource: async id => {
      if (
        !validWorkspaceScope(id) ||
        (id !== workspaceScope() && id !== 'default' && !(await workspaceDirectoryEntries({ includeArchived: true })).some(entry => entry.id === id))
      )
        throw Object.assign(Error('Source workspace is unavailable.'), { code: 'MEDIA_MANIFEST_UNAVAILABLE', statusCode: 403 });
      const storage = getStorageProvider(id);
      const data = storage.loadDatabaseCore ? await storage.loadDatabaseCore({ identities: false }) : await storage.loadDatabase();
      return { storage, data };
    },
  });
const route = fn => async (req, res, next) => {
  try {
    res.json(await fn(req));
  } catch (error) {
    next(error);
  }
};
mediaBackupRouter.get(
  '/',
  route(async req => ({ jobs: await service().list(req.user) })),
);
mediaBackupRouter.post(
  '/',
  requireRole('admin', 'editor'),
  route(async req => ({ job: await service().create(req.user, req.body.ids, req.body) })),
);
mediaBackupRouter.post(
  '/manifest/review',
  requireRole('admin', 'editor'),
  route(req => service().reviewManifest(req.user, req.body.manifest, req.body.sourceScope, req.body.project, req.body.folderId)),
);
mediaBackupRouter.post(
  '/manifest/import',
  requireRole('admin', 'editor'),
  route(async req => ({
    job: await service().importManifest(req.user, req.body.manifest, req.body.sourceScope, req.body.project, req.body.folderId, req.body.reviewKey),
  })),
);
mediaBackupRouter.post(
  '/:id/settings',
  requireRole('admin', 'editor'),
  route(async req => ({ job: await service().settings(req.user, req.params.id, req.body) })),
);
mediaBackupRouter.post(
  '/:id/purge',
  requireRole('admin', 'editor'),
  route(req => service().purge(req.user, req.params.id, req.body.index, req.body.confirmation)),
);
mediaBackupRouter.post(
  '/:id/advance',
  requireRole('admin', 'editor'),
  route(async req => ({ job: await service().advance(req.user, req.params.id) })),
);
mediaBackupRouter.get(
  '/:id/inventory',
  route(req => service().inventory(req.user, req.params.id)),
);
mediaBackupRouter.get(
  '/:id/manifest',
  route(req => service().manifest(req.user, req.params.id)),
);
mediaBackupRouter.post(
  '/:id/restore-plan',
  requireRole('admin', 'editor'),
  route(req => service().restorePlan(req.user, req.params.id, req.body.project, req.body.folderId)),
);
mediaBackupRouter.post(
  '/:id/restore',
  requireRole('admin', 'editor'),
  route(async req => {
    if (typeof req.body.reviewKey !== 'string' || !/^[a-f0-9]{64}$/.test(req.body.reviewKey))
      throw Object.assign(Error('Review the restore plan first.'), { statusCode: 400, code: 'MEDIA_RESTORE_REVIEW_CHANGED' });
    return { file: await service().restore(req.user, req.params.id, req.body.project, req.body.index, req.body) };
  }),
);
