import express from 'express';
import { getAccessProfiles, requireAuth, requireRole } from './auth.js';
import { authRouter } from './auth-routes.js';
import {
  createWorkspaceBackup,
  getWorkspaceDatabase,
  getWorkspaceRevisionStatus,
  getWorkspaceStatus,
  listWorkspaceBackups,
  mutateWorkspaceDatabase,
  replaceWorkspaceDatabase,
  restoreWorkspaceBackup,
  RevisionConflictError,
} from './workspace-store.js';
import { fileRouter } from './file-routes.js';
import { WORKSPACE_TRANSPORT_MAX_BYTES } from '../shared/workspace-size.js';
import { HTTP_SECURITY_HEADERS } from '../shared/http-security.js';
import { bindAccessProfiles, memberForProfile } from '../shared/member-identity.js';
import { restoreUnauthorizedChanges } from '../shared/workspace-permissions.js';
import { emptyWorkspace } from '../shared/empty-workspace.js';
import { getStorageProvider } from './storage/index.js';
import { requireCronSecret } from './cron-auth.js';
import { runDueReminderSweep } from './due-reminders.js';
import { cleanupPushSubscriptions, deliverPushNotifications, publicPushConfig, removePushSubscription, upsertPushSubscription } from './push-subscriptions.js';
import { deliverEmailNotifications, emailAuthorizationStatus, runDailyEmailDigest } from './email-notifications.js';
import { runNotificationCleanup } from './notification-cleanup.js';
import { notificationRecipient } from '../shared/notification-model.js';

export const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: WORKSPACE_TRANSPORT_MAX_BYTES }));
app.use((_request, response, next) => {
  for (const [name, value] of Object.entries(HTTP_SECURITY_HEADERS)) response.setHeader(name, value);
  next();
});

app.get('/api/health', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'smena-manager',
    runtime: process.env.VERCEL ? 'vercel' : 'node',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/cron/reminders', requireCronSecret, async (_request, response, next) => {
  try {
    const reminders = await runDueReminderSweep();
    const digest = await runDailyEmailDigest().catch(error => {
      console.error('[Email digest]', error.providerReason || error.message);
      return { delivered: 0, error: 'delivery_failed' };
    });
    const cleanup = await runNotificationCleanup();
    const pushCleanup = await cleanupPushSubscriptions();
    response.json({ status: 'ok', reminders, digest, cleanup, pushCleanup });
  } catch (error) {
    next(error);
  }
});

app.get('/api/cron/status', requireCronSecret, async (_request, response, next) => {
  try {
    response.json({ status: 'ok', email: await emailAuthorizationStatus(), push: publicPushConfig() });
  } catch (error) {
    next(error);
  }
});

app.use('/api/auth', authRouter);
app.use('/api', requireAuth);
app.use('/api/files', fileRouter);

app.get('/api/auth/me', (request, response) => {
  response.json({ user: request.user });
});

app.get('/api/push/config', (_request, response) => {
  response.json(publicPushConfig());
});

app.post('/api/push/subscriptions', async (request, response, next) => {
  try {
    const stored = await getWorkspaceDatabase();
    const member = memberForProfile(bindAccessProfiles(stored, getAccessProfiles()), request.user);
    if (!member) throw Object.assign(new Error('Your profile is not linked to a workspace member.'), { statusCode: 403, code: 'MEMBER_REQUIRED' });
    const result = await upsertPushSubscription(member.id, request.user.id, request.body?.subscription, {
      locale: request.body?.locale,
      userAgent: request.get('user-agent'),
    });
    response.status(201).json({ subscription: result });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/push/subscriptions', async (request, response, next) => {
  try {
    const stored = await getWorkspaceDatabase();
    const member = memberForProfile(bindAccessProfiles(stored, getAccessProfiles()), request.user);
    if (!member) throw Object.assign(new Error('Your profile is not linked to a workspace member.'), { statusCode: 403, code: 'MEMBER_REQUIRED' });
    response.json({ removed: await removePushSubscription(member.id, request.body?.endpoint) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/storage/status', async (_request, response, next) => {
  try {
    response.json(await getWorkspaceStatus());
  } catch (error) {
    next(error);
  }
});

app.delete('/api/notifications/read', async (request, response, next) => {
  try {
    const revision = Number(request.body?.revision);
    if (!Number.isInteger(revision) || revision < 0) throw new TypeError('A valid workspace revision is required.');
    const stored = await getWorkspaceDatabase();
    const member = memberForProfile(bindAccessProfiles(stored, getAccessProfiles()), request.user);
    if (!member) throw Object.assign(new Error('Your profile is not linked to a workspace member.'), { statusCode: 403, code: 'MEMBER_REQUIRED' });
    let removed = 0;
    const data = await mutateWorkspaceDatabase(
      database => {
        database.notifs = (database.notifs || []).filter(notification => {
          const shouldRemove = notification.read && notificationRecipient(notification, database) === member.id;
          if (shouldRemove) removed += 1;
          return !shouldRemove;
        });
        return database;
      },
      revision,
      { role: 'admin' },
    );
    response.json({ data, removed });
  } catch (error) {
    next(error);
  }
});

app.get('/api/backups', requireRole('admin'), async (_request, response, next) => {
  try {
    response.json({ backups: await listWorkspaceBackups() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/backups', requireRole('admin'), async (request, response, next) => {
  try {
    response.status(201).json({ backup: await createWorkspaceBackup(request.body?.label) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/backups/:id/restore', requireRole('admin'), async (request, response, next) => {
  try {
    response.json({ data: await restoreWorkspaceBackup(request.params.id, request.body?.revision) });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/trash/:id', requireRole('admin', 'editor'), async (request, response, next) => {
  try {
    const revision = Number(request.body?.revision);
    if (!Number.isInteger(revision) || revision < 0) throw new TypeError('A valid workspace revision is required.');
    let removed;
    const data = await mutateWorkspaceDatabase(
      database => {
        removed = (database.trash || []).find(item => item.id === request.params.id);
        if (!removed) throw Object.assign(new Error('Trash item not found.'), { statusCode: 404, code: 'TRASH_NOT_FOUND' });
        database.trash = database.trash.filter(item => item.id !== removed.id);
        return database;
      },
      revision,
      { role: request.user.role },
    );
    const storedFiles = [removed.data?.file, ...(removed.data?.files || [])].filter(file => file?.storageName);
    let cleanupPending = false;
    await Promise.all(
      storedFiles.map(file =>
        getStorageProvider()
          .deleteFile(file.storageName, file.storageFileId)
          .catch(error => {
            cleanupPending = true;
            console.error('[Trash] Stored file cleanup failed:', error);
          }),
      ),
    );
    response.json({ data, cleanupPending });
  } catch (error) {
    next(error);
  }
});

app.get('/api/workspace', async (_request, response, next) => {
  try {
    const database = await getWorkspaceDatabase();
    response.json({ data: bindAccessProfiles(database, getAccessProfiles()) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/workspace/revision', async (_request, response, next) => {
  try {
    response.json(await getWorkspaceRevisionStatus());
  } catch (error) {
    next(error);
  }
});

app.put('/api/workspace', requireRole('admin', 'editor'), async (request, response, next) => {
  try {
    let nextData = request.body?.data;
    const stored = await getWorkspaceDatabase();
    const knownNotifications = new Set((stored.notifs || []).map(notification => notification.id));
    const actorMemberId = memberForProfile(bindAccessProfiles(stored, getAccessProfiles()), request.user)?.id || request.user.id;
    if (request.user.role === 'editor') {
      nextData = restoreUnauthorizedChanges(stored, nextData, request.user.role, actorMemberId).data;
    }
    const data = await replaceWorkspaceDatabase(nextData, request.body?.revision, { role: request.user.role, actorMemberId });
    const createdNotifications = (data.notifs || []).filter(notification => !knownNotifications.has(notification.id));
    await Promise.allSettled([deliverPushNotifications(data, createdNotifications), deliverEmailNotifications(data, createdNotifications)]);
    response.json({ data });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/workspace', requireRole('admin'), async (request, response, next) => {
  try {
    await createWorkspaceBackup('Перед удалением рабочего пространства');
    const data = await replaceWorkspaceDatabase(emptyWorkspace(bindAccessProfiles(await getWorkspaceDatabase(), getAccessProfiles())), request.body?.revision, {
      role: request.user.role,
    });
    response.json({ data });
  } catch (error) {
    next(error);
  }
});

app.use('/api', (_request, response) => {
  response.status(404).json({ error: 'API route not found.' });
});

app.use((error, _request, response, next) => {
  void next;
  console.error('[API]', error);
  const status = error.statusCode || (error instanceof TypeError ? 400 : 503);
  const body = {
    error: status === 503 ? 'Workspace storage is unavailable.' : error.message,
    code: error.code || (status === 400 ? 'INVALID_REQUEST' : status === 413 ? 'PAYLOAD_TOO_LARGE' : 'STORAGE_UNAVAILABLE'),
  };
  if (error instanceof RevisionConflictError) body.currentRevision = error.currentRevision;
  if (Number.isSafeInteger(error.maxBytes)) body.maxBytes = error.maxBytes;
  if (Number.isSafeInteger(error.actualBytes)) body.actualBytes = error.actualBytes;
  if (Array.isArray(error.fields)) body.fields = error.fields;
  response.status(status).json(body);
});
