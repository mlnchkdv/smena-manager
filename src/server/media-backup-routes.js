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
  route(async req => ({ job: await service().create(req.user, req.body.ids) })),
);
mediaBackupRouter.post(
  '/:id/advance',
  requireRole('admin', 'editor'),
  route(async req => ({ job: await service().advance(req.user, req.params.id) })),
);
mediaBackupRouter.get(
  '/:id/manifest',
  route(req => service().manifest(req.user, req.params.id)),
);
mediaBackupRouter.post(
  '/:id/restore',
  requireRole('admin', 'editor'),
  route(async req => ({ file: await service().restore(req.user, req.params.id, req.body.project, req.body.index) })),
);
