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
import { cleanupPushSubscriptions, publicPushConfig, removePushSubscription, upsertPushSubscription } from './push-subscriptions.js';
import { emailAuthorizationStatus, runDailyEmailDigest } from './email-notifications.js';
import { deliverWorkspaceNotifications, retryNotificationOutbox, notificationDeliveryStatus, recordNotificationCronRun } from './notification-delivery.js';
import { runNotificationCleanup } from './notification-cleanup.js';
import { notificationRecipient } from '../shared/notification-model.js';
import { DOCUMENT_NAMES, workspaceCoreData } from '../shared/workspace-documents.js';
import { getWorkspaceDocument, replaceWorkspaceDocument } from './workspace-document-store.js';
import { listAuthSessions, revokeAuthSession, revokeOtherAuthSessions } from './auth-session-store.js';
import { runAutomaticWorkspaceBackup } from './automatic-backups.js';
import { evaluateOperationalHealth } from './operational-health.js';
import { notifyAdministratorsAboutSystemIssue } from './system-alerts.js';
import { permissionError, projectWorkspace } from './workspace-policy.js';
import { canEditProject, trashProject, trashProjectId } from '../shared/project-access.js';
import { validateDocumentInput } from '../shared/workspace-schema.js';
import { collectRetainedFiles, retainDetachedFile } from './file-retention.js';
import { setSessionCookie } from './session-cookie.js';
import { applyPersonalSettings } from '../shared/personal-settings.js';

export const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: WORKSPACE_TRANSPORT_MAX_BYTES }));
app.use((_request, response, next) => {
  response.setHeader('Cache-Control', 'no-store');
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
    const outbox = await retryNotificationOutbox();
    const digest = await runDailyEmailDigest().catch(error => {
      console.error('[Email digest]', error.providerReason || error.message);
      return { delivered: 0, error: 'delivery_failed' };
    });
    const cleanup = await runNotificationCleanup();
    const pushCleanup = await cleanupPushSubscriptions();
    const fileCleanup = await collectRetainedFiles({ storage: getStorageProvider(), load: getWorkspaceDatabase, mutate: mutateWorkspaceDatabase }).catch(
      () => ({ error: 'cleanup_failed' }),
    );
    const backup = await runAutomaticWorkspaceBackup().catch(error => {
      console.error('[Automatic backup]', error.message);
      return { error: 'backup_failed' };
    });
    const cronStatus = digest.error || backup.error ? 'degraded' : 'ok';
    await recordNotificationCronRun({ status: cronStatus, reminders, digest, cleanup, pushCleanup, backup }).catch(error => {
      console.error('[Notifications] Cron diagnostics could not be saved:', error?.message || error);
    });
    if (cronStatus !== 'ok') {
      const issues = [digest.error && 'Email digest delivery failed', backup.error && 'Automatic backup failed'].filter(Boolean);
      await notifyAdministratorsAboutSystemIssue(issues).catch(error => console.error('[System alert]', error.message));
    }
    response.json({ status: cronStatus, reminders, outbox, digest, cleanup, pushCleanup, fileCleanup, backup });
  } catch (error) {
    await recordNotificationCronRun({ status: 'failed' }).catch(() => undefined);
    await notifyAdministratorsAboutSystemIssue(['Daily automation failed']).catch(() => undefined);
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
app.use('/api', (request, response, next) => {
  const send = response.json.bind(response);
  response.json = body => {
    if (body?.data && Array.isArray(body.data.projects) && Array.isArray(body.data.tasks)) {
      body = { ...body, data: projectWorkspace(workspaceCoreData(bindAccessProfiles(body.data, getAccessProfiles())), request.user) };
    }
    return send(body);
  };
  next();
});
app.use('/api/files', fileRouter);

app.get('/api/auth/me', (request, response) => {
  response.json({ user: request.user });
});

app.get('/api/preferences', async (request, response, next) => {
  try {
    const data = await getWorkspaceDatabase();
    const member = memberForProfile(bindAccessProfiles(data, getAccessProfiles()), request.user);
    response.json({ preferences: data._userPrefs?.[member?.id] || {} });
  } catch (error) {
    next(error);
  }
});

app.put('/api/preferences', async (request, response, next) => {
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await getWorkspaceDatabase();
      const member = memberForProfile(bindAccessProfiles(current, getAccessProfiles()), request.user);
      if (!member) throw permissionError('profile');
      try {
        const data = await mutateWorkspaceDatabase(database => applyPersonalSettings(database, member.id, request.body), current.revision, { role: 'admin' });
        return response.json({ data, preferences: data._userPrefs?.[member.id] || {} });
      } catch (error) {
        if (error.code !== 'REVISION_CONFLICT' || attempt === 2) throw error;
      }
    }
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/sessions', async (request, response, next) => {
  try {
    response.json({ sessions: await listAuthSessions(request.user.id, request.sessionId) });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/auth/sessions/others', async (request, response, next) => {
  try {
    const revoked = await revokeOtherAuthSessions(request.user.id, request.sessionId);
    response.json({ revoked, sessions: await listAuthSessions(request.user.id, request.sessionId) });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/auth/sessions/:sessionId', async (request, response, next) => {
  try {
    const revoked = await revokeAuthSession(request.user.id, request.params.sessionId);
    if (!revoked) {
      response.status(404).json({ error: 'Session not found.', code: 'SESSION_NOT_FOUND' });
      return;
    }
    response.json({ revoked: 1, current: request.params.sessionId === request.sessionId });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/auth/session', async (request, response, next) => {
  try {
    await revokeAuthSession(request.user.id, request.sessionId);
    setSessionCookie(response, '');
    response.json({ revoked: 1 });
  } catch (error) {
    next(error);
  }
});

app.get('/api/push/config', (_request, response) => {
  response.json(publicPushConfig());
});

app.get('/api/notifications/delivery-status', requireRole('admin'), async (_request, response, next) => {
  try {
    const [notifications, workspace] = await Promise.all([notificationDeliveryStatus(), getWorkspaceStatus()]);
    response.json({ ...notifications, workspace, operational: evaluateOperationalHealth({ ...notifications, workspace }) });
  } catch (error) {
    next(error);
  }
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
        const memberId = memberForProfile(database, request.user)?.id || request.user.id;
        const project = trashProject(removed) || database.projects?.find(item => item.id === trashProjectId(removed));
        if (request.user.role !== 'admin' && (project ? !canEditProject(project, memberId, request.user.role) : removed.deletedBy !== memberId))
          throw permissionError('trash');
        if (request.user.role !== 'admin' && [removed.data?.file, ...(removed.data?.files || [])].some(file => file?.by && file.by !== memberId))
          throw permissionError('files');
        database.trash = database.trash.filter(item => item.id !== removed.id);
        for (const file of [removed.data?.file, ...(removed.data?.files || [])].filter(Boolean)) retainDetachedFile(database, file);
        return database;
      },
      revision,
      { role: request.user.role },
    );
    response.json({ data, cleanupPending: false, contentRetainedForBackups: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/workspace', async (_request, response, next) => {
  try {
    const database = await getWorkspaceDatabase();
    response.json({ data: workspaceCoreData(bindAccessProfiles(database, getAccessProfiles())) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/workspace/revision', async (_request, response, next) => {
  try {
    const database = await getWorkspaceDatabase();
    const documents = Object.fromEntries(
      await Promise.all(
        DOCUMENT_NAMES.map(async name => {
          const document = await getWorkspaceDocument(name, database);
          return [name, { revision: document.revision, updatedAt: document.updatedAt }];
        }),
      ),
    );
    response.json({ ...(await getWorkspaceRevisionStatus()), documents });
  } catch (error) {
    next(error);
  }
});

app.put('/api/workspace', requireRole('admin', 'editor'), async (request, response, next) => {
  try {
    let nextData = workspaceCoreData(request.body?.data);
    const stored = await getWorkspaceDatabase();
    const knownNotifications = new Set((stored.notifs || []).map(notification => notification.id));
    const actorMemberId = memberForProfile(bindAccessProfiles(stored, getAccessProfiles()), request.user)?.id || request.user.id;
    if (request.user.role === 'editor') {
      nextData = restoreUnauthorizedChanges(stored, nextData, request.user.role, actorMemberId).data;
    }
    const data = await replaceWorkspaceDatabase(nextData, request.body?.revision, { role: request.user.role, actorMemberId, client: true });
    const createdNotifications = (data.notifs || []).filter(notification => !knownNotifications.has(notification.id));
    // The events were persisted with the task. A provider outage must not turn
    // a successful task write into an HTTP failure or lose delivery work.
    if (createdNotifications.length) {
      await deliverWorkspaceNotifications(data, createdNotifications, { source: 'workspace' }).catch(error =>
        console.error('[Outbox] Deferred retry:', error.code || error.name),
      );
    }
    response.json({ data: workspaceCoreData(data) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/workspace-documents/:name', async (request, response, next) => {
  try {
    if (!DOCUMENT_NAMES.includes(request.params.name)) return response.status(404).json({ error: 'Workspace document not found.', code: 'DOCUMENT_NOT_FOUND' });
    const legacy = await getWorkspaceDatabase();
    response.json({ data: await getWorkspaceDocument(request.params.name, legacy) });
  } catch (error) {
    next(error);
  }
});

app.put('/api/workspace-documents/:name', requireRole('admin', 'editor'), async (request, response, next) => {
  try {
    if (!DOCUMENT_NAMES.includes(request.params.name)) return response.status(404).json({ error: 'Workspace document not found.', code: 'DOCUMENT_NOT_FOUND' });
    const legacy = await getWorkspaceDatabase();
    const data = await replaceWorkspaceDocument(request.params.name, validateDocumentInput(request.params.name, request.body?.data), request.body?.revision, {
      legacyData: legacy,
    });
    response.json({ data });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/workspace', requireRole('admin'), async (request, response, next) => {
  try {
    const current = await getWorkspaceDatabase();
    if (current.revision !== request.body?.revision) throw new RevisionConflictError(current.revision);
    await createWorkspaceBackup('Before workspace deletion');
    const data = await replaceWorkspaceDatabase(emptyWorkspace(bindAccessProfiles(current, getAccessProfiles())), request.body?.revision, {
      role: request.user.role,
      replaceDocuments: true,
    });
    response.json({ data: workspaceCoreData(data) });
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
  if (error instanceof RevisionConflictError || Number.isSafeInteger(error.currentRevision)) body.currentRevision = error.currentRevision;
  if (Number.isSafeInteger(error.maxBytes)) body.maxBytes = error.maxBytes;
  if (Number.isSafeInteger(error.actualBytes)) body.actualBytes = error.actualBytes;
  if (Array.isArray(error.fields)) body.fields = error.fields;
  response.status(status).json(body);
});
