import express from 'express';
import crypto from 'node:crypto';
import { reportProviderError, safeProviderError } from './provider-safety.js';
import { getWorkspaceAccessProfiles as getAccessProfiles, requireAuth, requireRole } from './auth.js';
import { createWorkspace, listUserWorkspaces, setWorkspaceArchived, requireWorkspace, workspaceDirectoryEntries } from './workspace-directory.js';
import { inWorkspace } from './workspace-context.js';
import { dispatchWorkspaceAutomation, runWorkspaceAutomationBatch } from './workspace-automation.js';
import { authRouter } from './auth-routes.js';
import {
  createWorkspaceBackup,
  importPortableWorkspace,
  getWorkspaceDatabase,
  getWorkspaceStatus,
  listWorkspaceBackups,
  mutateWorkspaceDatabase,
  mutateWorkspaceMetadata,
  tryMutateWorkspaceFiles,
  restoreWorkspaceBackup,
  RevisionConflictError,
  queryWorkspaceGraph,
} from './workspace-store.js';
import { fileRouter } from './file-routes.js';
import { WORKSPACE_TRANSPORT_MAX_BYTES } from '../shared/workspace-size.js';
import { HTTP_SECURITY_HEADERS } from '../shared/http-security.js';
import { bindAccessProfiles, memberForProfile } from '../shared/member-identity.js';
import { tryMutateWorkspaceFileRemoval } from './file-removal-patch.js';
import { restoreUnauthorizedChanges } from '../shared/workspace-permissions.js';
import { clearWorkspaceContent } from '../shared/empty-workspace.js';
import { getStorageProvider } from './storage/index.js';
import { requireCronSecret } from './cron-auth.js';
import { runDueReminderSweep } from './due-reminders.js';
import { cleanupPushSubscriptions, publicPushConfig, removePushSubscription, upsertPushSubscription } from './push-subscriptions.js';
import { emailAuthorizationStatus, runDailyEmailDigest } from './email-notifications.js';
import {
  claimNotificationTestCooldown,
  deliverWorkspaceNotifications,
  retryNotificationOutbox,
  notificationDeliveryStatus,
  recordNotificationCronRun,
} from './notification-delivery.js';
import { runNotificationCleanup } from './notification-cleanup.js';
import { notificationRecipient } from '../shared/notification-model.js';
import { DOCUMENT_NAMES, workspaceCoreData } from '../shared/workspace-documents.js';
import { getWorkspaceDocument, replaceWorkspaceDocument } from './workspace-document-store.js';
import { listAuthSessions, revokeAuthSession, revokeOtherAuthSessions } from './auth-session-store.js';
import { runAutomaticWorkspaceBackup } from './automatic-backups.js';
import { evaluateAutomationRun, evaluateOperationalHealth } from './operational-health.js';
import { notifyAdministratorsAboutSystemIssue } from './system-alerts.js';
import { mergeClientWorkspace, permissionError, projectWorkspace } from './workspace-policy.js';
import { applyFileCatalogChanges } from '../shared/file-catalog.js';
import { fileCatalogVersion } from './file-catalog-version.js';
import { completeCatalogCascade } from './file-catalog-query.js';
import { fileExportRouter } from './file-export-routes.js';
import { canEditProject, trashProject, trashProjectId } from '../shared/project-access.js';
import { validateDocumentInput } from '../shared/workspace-schema.js';
import { collectRetainedFiles, retainDetachedFile, sweepAbandonedUploads } from './file-retention.js';
import { setSessionCookie } from './session-cookie.js';
import { applyPersonalSettings } from '../shared/personal-settings.js';
import { writeRecoveryBundle } from './recovery-bundle.js';
import { sendOwnTestNotification } from './test-notification.js';
import { workspaceRevisionEtag } from '../shared/revision-etag.js';
import { indexedKnowledgePage } from './knowledge-index.js';

export const app = express();

app.disable('x-powered-by');
app.use((request, response, next) => {
  request.requestId = crypto.randomUUID();
  request.startedAt = Date.now();
  response.setHeader('X-Request-ID', request.requestId);
  response.setHeader('Cache-Control', 'no-store');
  for (const [name, value] of Object.entries(HTTP_SECURITY_HEADERS)) response.setHeader(name, value);
  next();
});
app.use(express.json({ limit: WORKSPACE_TRANSPORT_MAX_BYTES }));

app.get('/api/health', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'smena-manager',
    runtime: process.env.VERCEL ? 'vercel' : 'node',
    timestamp: new Date().toISOString(),
  });
});

async function runWorkspaceAutomation() {
  try {
    const reminders = await runDueReminderSweep({ enqueueOnly: true });
    const digest = await runDailyEmailDigest({ enqueueOnly: true }).catch(error => {
      reportProviderError('[Email digest]', error);
      return { delivered: 0, error: 'delivery_failed' };
    });
    const cleanup = await runNotificationCleanup();
    const pushCleanup = await cleanupPushSubscriptions();
    const abandonedUploads = await sweepAbandonedUploads({ storage: getStorageProvider(), load: getWorkspaceDatabase, mutate: mutateWorkspaceDatabase }).catch(
      () => ({ error: 'upload_cleanup_failed' }),
    );
    const fileCleanup = await collectRetainedFiles({ storage: getStorageProvider(), load: getWorkspaceDatabase, mutate: mutateWorkspaceDatabase }).catch(
      () => ({ error: 'cleanup_failed' }),
    );
    const backup = await runAutomaticWorkspaceBackup().catch(error => {
      reportProviderError('[Automatic backup]', error);
      return { error: 'backup_failed' };
    });
    const outbox = await retryNotificationOutbox();
    const { status: cronStatus, issues } = evaluateAutomationRun({ digest, backup, fileCleanup, abandonedUploads, outbox });
    await recordNotificationCronRun({ status: cronStatus, reminders, outbox, digest, cleanup, pushCleanup, abandonedUploads, fileCleanup, backup }).catch(
      error => {
        reportProviderError('[Notifications] Cron diagnostics', error);
      },
    );
    if (cronStatus !== 'ok') {
      await notifyAdministratorsAboutSystemIssue(issues).catch(error => reportProviderError('[System alert]', error));
    }
    return { status: cronStatus, reminders, outbox, digest, cleanup, pushCleanup, abandonedUploads, fileCleanup, backup };
  } catch (error) {
    await recordNotificationCronRun({ status: 'failed' }).catch(() => undefined);
    await notifyAdministratorsAboutSystemIssue(['Daily automation failed']).catch(() => undefined);
    throw error;
  }
}

app.get('/api/cron/reminders', requireCronSecret, async (request, response, next) => {
  try {
    const scopes = ['default', ...(await workspaceDirectoryEntries()).map(entry => entry.id)];
    if (request.query.workspace) {
      if (typeof request.query.workspace !== 'string' || !scopes.includes(request.query.workspace))
        return response.status(404).json({ error: 'Workspace not found.' });
      return response.json(await inWorkspace(request.query.workspace, runWorkspaceAutomation));
    }
    const workspaces = await runWorkspaceAutomationBatch(scopes, {
      run: runWorkspaceAutomation,
      dispatch: process.env.VERCEL ? dispatchWorkspaceAutomation : null,
      failed: error => reportProviderError('[Workspace automation]', error),
    });
    const primary = workspaces[0];
    response.json({ ...primary, status: workspaces.every(item => item.status === 'ok') ? 'ok' : 'degraded', workspaces });
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
app.get('/api/workspaces', async (request, response, next) => {
  try {
    response.json({ workspaces: await listUserWorkspaces(request.user, request.configuredProfiles) });
  } catch (error) {
    next(error);
  }
});
app.post('/api/workspaces/:id/archive', async (request, response, next) => {
  try {
    await setWorkspaceArchived(request.user, request.params.id, request.body?.archived !== false);
    response.json({ workspaces: await listUserWorkspaces(request.user, request.configuredProfiles) });
  } catch (error) {
    next(error);
  }
});
app.use('/api', requireWorkspace);
app.post('/api/workspaces', requireRole('admin', 'editor'), async (request, response, next) => {
  try {
    response.status(201).json({ workspace: await createWorkspace(request.user, request.body, request.configuredProfiles) });
  } catch (error) {
    next(error);
  }
});
app.use('/api', (request, response, next) => {
  const send = response.json.bind(response);
  response.json = body => {
    if (body?.data && Array.isArray(body.data.projects) && Array.isArray(body.data.tasks)) {
      body = { ...body, data: projectWorkspace(workspaceCoreData(bindAccessProfiles(body.data, getAccessProfiles())), request.user) };
      const catalogMode = request.get('x-smena-file-catalog');
      if (request.query.fileCatalog === 'pages' || ['pages', 'demand'].includes(catalogMode)) {
        const { files, ...core } = body.data;
        body = {
          ...body,
          data: core,
          fileCatalog: { total: files.length, ...(catalogMode === 'demand' ? { mode: 'demand' } : { token: fileCatalogVersion(files) }) },
        };
      }
    }
    return send(body);
  };
  next();
});
app.use('/api/files/exports', fileExportRouter);
app.use('/api/files', fileRouter);

app.post('/api/graph/query', async (request, response, next) => {
  try {
    response.json(await queryWorkspaceGraph(request.user, request.body));
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/me', (request, response) => {
  response.json({ user: request.user });
});

app.get('/api/readiness', requireRole('admin'), async (request, response, next) => {
  try {
    const [workspace, backups, notifications] = await Promise.all([getWorkspaceStatus(), listWorkspaceBackups(), notificationDeliveryStatus()]);
    const operational = evaluateOperationalHealth({ ...notifications, workspace });
    const lastBackup =
      backups
        .map(item => item.createdAt)
        .filter(Boolean)
        .sort()
        .at(-1) || null;
    if (!lastBackup || Date.now() - Date.parse(lastBackup) > 36 * 3600000) operational.issues.push({ code: 'backup_stale', severity: 'critical' });
    const ready = !operational.issues.some(item => item.severity === 'critical');
    response.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'degraded', requestId: request.requestId, operational, lastBackup, workspace });
  } catch (error) {
    next(error);
  }
});

app.get('/api/preferences', async (request, response, next) => {
  try {
    const data = request.workspaceSnapshot;
    const member = memberForProfile(bindAccessProfiles(data, getAccessProfiles()), request.user);
    response.json({ preferences: data._userPrefs?.[member?.id] || {} });
  } catch (error) {
    next(error);
  }
});

app.put('/api/preferences', async (request, response, next) => {
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await getWorkspaceDatabase({ fields: ['members', 'revision'] });
      const member = memberForProfile(bindAccessProfiles(current, getAccessProfiles()), request.user);
      if (!member) throw permissionError('profile');
      try {
        const mutate = request.get('x-smena-file-catalog') === 'demand' ? mutateWorkspaceMetadata : mutateWorkspaceDatabase;
        const data = await mutate(database => applyPersonalSettings(database, member.id, request.body), current.revision, {
          role: 'admin',
          scope: 'preferences',
          memberId: member.id,
        });
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

app.post('/api/notifications/retry', requireRole('admin'), async (_request, response, next) => {
  try {
    const result = await retryNotificationOutbox();
    response.json({ result, ...(await notificationDeliveryStatus()) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/notifications/test', requireRole('admin'), async (request, response, next) => {
  try {
    const channel = request.body?.channel;
    if (!['email', 'push'].includes(channel)) return response.status(400).json({ error: 'Invalid notification channel.' });
    const key = `${request.user.id}:${channel}`;
    if (!(await claimNotificationTestCooldown(key))) return response.status(429).json({ error: 'Please wait one minute before another test.' });
    const stored = await getWorkspaceDatabase({ catalog: 'metadata' });
    const member = memberForProfile(bindAccessProfiles(stored, getAccessProfiles()), request.user);
    // Recipient is resolved from the authenticated profile, never accepted from the request body.
    if (!member || member.email?.toLowerCase() !== request.user.email?.toLowerCase()) throw permissionError('profile');
    response.json(await sendOwnTestNotification(stored, member, channel));
  } catch (error) {
    next(error);
  }
});

app.post('/api/push/subscriptions', async (request, response, next) => {
  try {
    const stored = await getWorkspaceDatabase({ catalog: 'metadata' });
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
    const stored = await getWorkspaceDatabase({ catalog: 'metadata' });
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

app.get('/api/recovery/export', requireRole('admin'), async (_request, response, next) => {
  try {
    const data = await getWorkspaceDatabase();
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="smena-recovery-${new Date().toISOString().slice(0, 10)}.json"`);
    await writeRecoveryBundle(data, getStorageProvider(), response);
  } catch (error) {
    next(error);
  }
});

app.post('/api/import/portable', requireRole('admin', 'editor'), async (request, response, next) => {
  try {
    response.json(await importPortableWorkspace(request.body?.payload, request.body?.revision, request.body?.conflictPolicy));
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

app.get('/api/workspace', async (request, response, next) => {
  try {
    const database = await getWorkspaceDatabase(request.get('x-smena-file-catalog') === 'demand' ? { catalog: 'metadata' } : {});
    response.json({ data: workspaceCoreData(bindAccessProfiles(database, getAccessProfiles())) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/workspace/revision', async (request, response, next) => {
  try {
    const database = request.workspaceSnapshot || (await getWorkspaceDatabase());
    const documents = Object.fromEntries(
      DOCUMENT_NAMES.map(name => {
        const metadata = database._documentRevisions?.[name];
        return [name, { revision: Number(metadata?.revision || 0), updatedAt: metadata?.updatedAt || database.updatedAt }];
      }),
    );
    const etag = workspaceRevisionEtag(database.revision, database.updatedAt);
    response.setHeader('ETag', etag);
    if (request.get('if-none-match') === etag) return response.status(304).end();
    response.json({ revision: database.revision, updatedAt: database.updatedAt, documents, user: request.user });
  } catch (error) {
    next(error);
  }
});

app.put('/api/workspace', requireRole('admin', 'editor'), async (request, response, next) => {
  try {
    const incoming = workspaceCoreData(request.body?.data);
    const actorMemberId = memberForProfile(bindAccessProfiles(request.workspaceSnapshot, getAccessProfiles()), request.user)?.id || request.user.id;
    if (request.get('x-smena-file-catalog') === 'demand' && request.body?.fileChanges) {
      const patched =
        (await tryMutateWorkspaceFileRemoval(incoming, request.body.fileChanges, request.body?.revision, request.user, getAccessProfiles())) ||
        (await tryMutateWorkspaceFiles(incoming, request.body.fileChanges, request.body?.revision, request.user, getAccessProfiles()));
      if (patched) return response.json({ data: workspaceCoreData(patched) });
    }
    let knownNotifications;
    const data = await mutateWorkspaceDatabase(
      stored => {
        let nextData = incoming;
        if (request.body?.fileChanges) {
          if (Object.hasOwn(nextData, 'files')) throw new TypeError('Do not mix a complete catalog and file changes.');
          // Reconstruct and authorize against the same canonical snapshot that
          // will be written, not a second full read before the write boundary.
          const visible = projectWorkspace(stored, request.user);
          nextData = { ...nextData, files: completeCatalogCascade(visible, nextData, applyFileCatalogChanges(visible.files || [], request.body.fileChanges)) };
        }
        knownNotifications = new Set((stored.notifs || []).map(notification => notification.id));
        if (request.user.role === 'editor') nextData = restoreUnauthorizedChanges(stored, nextData, request.user.role, actorMemberId).data;
        return mergeClientWorkspace(stored, nextData, request.user.role, actorMemberId);
      },
      request.body?.revision,
      { role: request.user.role, actorMemberId },
    );
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

app.get('/api/knowledge/search', async (request, response, next) => {
  try {
    const { q = '', folder = 'all', tag = '', sort = 'updated', offset = '0' } = request.query;
    if (
      [q, folder, tag, sort, offset].some(value => typeof value !== 'string') ||
      q.length > 500 ||
      tag.length > 180 ||
      folder.length > 180 ||
      !/^\d{1,7}$/.test(offset)
    )
      return response.status(400).json({ error: 'Invalid search parameters.', code: 'INVALID_SEARCH' });
    response.json(
      indexedKnowledgePage(await getWorkspaceDatabase({ fields: ['knowledgeNotes', 'knowledgeFolders', 'createdAt', 'revision', '_documentRevisions'] }), {
        query: q,
        folder,
        tag,
        sort: sort === 'title' ? 'title' : 'updated',
        offset: Number(offset),
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.get('/api/workspace-documents/:name', async (request, response, next) => {
  try {
    if (!DOCUMENT_NAMES.includes(request.params.name)) return response.status(404).json({ error: 'Workspace document not found.', code: 'DOCUMENT_NOT_FOUND' });
    const legacy = await getWorkspaceDatabase({ catalog: 'metadata' });
    response.json({ data: await getWorkspaceDocument(request.params.name, legacy) });
  } catch (error) {
    next(error);
  }
});

app.put('/api/workspace-documents/:name', requireRole('admin', 'editor'), async (request, response, next) => {
  try {
    if (!DOCUMENT_NAMES.includes(request.params.name)) return response.status(404).json({ error: 'Workspace document not found.', code: 'DOCUMENT_NOT_FOUND' });
    const data = await replaceWorkspaceDocument(request.params.name, validateDocumentInput(request.params.name, request.body?.data), request.body?.revision);
    response.json({ data });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/workspace', requireRole('admin'), async (request, response, next) => {
  try {
    const data = await mutateWorkspaceDatabase(current => clearWorkspaceContent(current), request.body?.revision, {
      role: request.user.role,
      replaceDocuments: true,
      backupLabel: 'Before clearing workspace content',
    });
    response.json({ data: workspaceCoreData(data) });
  } catch (error) {
    next(error);
  }
});

app.use('/api', (_request, response) => {
  response.status(404).json({ error: 'API route not found.' });
});

app.use((error, request, response, next) => {
  void next;
  console.error('[API]', { requestId: request.requestId, durationMs: Date.now() - request.startedAt, ...safeProviderError(error) });
  if (response.headersSent) return response.destroy();
  const status = error.statusCode || (error instanceof TypeError ? 400 : 503);
  const body = {
    requestId: request.requestId,
    error: status === 503 ? 'Workspace storage is unavailable.' : error.message,
    code: error.code || (status === 400 ? 'INVALID_REQUEST' : status === 413 ? 'PAYLOAD_TOO_LARGE' : 'STORAGE_UNAVAILABLE'),
  };
  if (error instanceof RevisionConflictError || Number.isSafeInteger(error.currentRevision)) body.currentRevision = error.currentRevision;
  if (Number.isSafeInteger(error.maxBytes)) body.maxBytes = error.maxBytes;
  if (Number.isSafeInteger(error.actualBytes)) body.actualBytes = error.actualBytes;
  if (Array.isArray(error.fields)) body.fields = error.fields;
  response.status(status).json(body);
});
