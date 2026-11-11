import { Router } from 'express';
import { getStorageProvider } from './storage/index.js';
import { createKnowledgeInspection } from './knowledge-inspection.js';

export const knowledgeInspectionRouter = Router();
knowledgeInspectionRouter.get('/', async (request, response, next) => {
  try {
    response.json(await createKnowledgeInspection({ storage: getStorageProvider() }).read(request.user));
  } catch (error) {
    next(error);
  }
});
knowledgeInspectionRouter.post('/', async (request, response, next) => {
  try {
    const { operation, id } = request.body || {};
    if (
      !['start', 'step', 'pause', 'resume'].includes(operation) ||
      Object.keys(request.body || {}).some(key => !['operation', 'id'].includes(key)) ||
      (id != null && (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id))) ||
      (operation !== 'start' && !id)
    )
      return response.status(400).json({ code: 'INVALID_INSPECTION_COMMAND', error: 'Invalid inspection command.' });
    const service = createKnowledgeInspection({ storage: getStorageProvider() });
    const result =
      operation === 'start'
        ? await service.start(request.user, id)
        : operation === 'step'
          ? await service.step(request.user, id)
          : await service.control(request.user, id, operation);
    response.json(result);
  } catch (error) {
    next(error);
  }
});
