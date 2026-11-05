import { Router } from 'express';
import { requireRole } from './auth.js';
import { getWorkspaceDatabase, mutateWorkspaceDatabase } from './workspace-store.js';
import { getStorageProvider } from './storage/index.js';
import { mediaBackupService } from './media-backups.js';
export const mediaBackupRouter = Router();
const service = () => mediaBackupService({ load: getWorkspaceDatabase, mutate: mutateWorkspaceDatabase, storage: getStorageProvider() });
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
