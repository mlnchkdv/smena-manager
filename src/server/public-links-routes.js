import express from 'express';
import { marked } from 'marked';
import sanitizeHtml from '../../.generated/sanitizer.mjs';
import { publicLinksRegistry, PUBLIC_LINK_KINDS, publicLinkError } from './public-links-registry.js';
import { workspaceScope, inWorkspace } from './workspace-context.js';
import { workspaceDirectoryEntries, readWorkspaceCore } from './workspace-directory.js';
import { getWorkspaceDatabase, getWorkspaceFileSnapshot, getWorkspaceFilesSnapshot, queryWorkspaceFileCatalog } from './workspace-store.js';
import { knowledgeActor } from './knowledge-access.js';
import { workspaceMemberRole } from '../shared/workspace-access.js';
import { isActiveMember } from '../shared/workspace-membership.js';
import { canEditProject } from '../shared/project-access.js';
import { streamFileContent } from './file-routes.js';
import { getFileResponsePolicy } from './file-policy.js';
import { readKnowledgeNote } from './knowledge-note-store.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const coreFields = ['members', 'projects', 'knowledgeFolders', 'revision'];
function targetInput(input) {
  if (
    !PUBLIC_LINK_KINDS.includes(input?.kind) ||
    typeof input.targetId !== 'string' ||
    !input.targetId ||
    input.targetId.length > 180 ||
    (input.projectId != null && (typeof input.projectId !== 'string' || input.projectId.length > 180))
  )
    throw publicLinkError('INVALID_PUBLIC_LINK', 422);
  return { kind: input.kind, targetId: input.targetId, projectId: input.projectId || null };
}
export function inSharedFolder(folders, folderId, rootId) {
  const byId = new Map(folders.filter(folder => !folder.archived).map(folder => [folder.id, folder]));
  const seen = new Set();
  for (let id = folderId; id && !seen.has(id); id = byId.get(id)?.parentId) {
    if (!byId.has(id)) return false;
    if (id === rootId) return true;
    seen.add(id);
  }
  return false;
}
async function targetFor(target, user, profiles = []) {
  const data = await getWorkspaceDatabase({ fields: coreFields });
  const actor = knowledgeActor(data, user, profiles, { write: true });
  const role = workspaceMemberRole(actor);
  if (target.kind.startsWith('file')) {
    const project = data.projects.find(row => row.id === target.projectId && !row.archived);
    if (!project || !canEditProject(project, actor.id, role)) throw publicLinkError();
    if (target.kind === 'file-folder') {
      const folder = project.fileFolders?.find(row => row.id === target.targetId && !row.archived);
      if (!folder) throw publicLinkError();
      return { data, actor, role, object: folder };
    }
    const snapshot = await getWorkspaceFileSnapshot({ ...user, role }, target.targetId);
    const file = snapshot.files.find(row => row.id === target.targetId && row.project === project.id && !row.archived);
    if (!file?.storageName) throw publicLinkError();
    return { data, actor, role, object: file };
  }
  if (target.kind === 'note-folder') {
    const folder = data.knowledgeFolders?.find(row => row.id === target.targetId && !row.archived);
    if (!folder) throw publicLinkError();
    return { data, actor, role, object: folder };
  }
  const notes = await getWorkspaceDatabase({ fields: ['knowledgeNotes'], knowledgeIds: [target.targetId] });
  const note = notes.knowledgeNotes?.find(row => row.id === target.targetId && !row.archived);
  if (!note) throw publicLinkError();
  return { data, actor, role, object: note };
}

export const publicLinksManagementRouter = express.Router();
publicLinksManagementRouter.get('/', async (request, response, next) => {
  try {
    const target = targetInput(request.query);
    const { actor, role } = await targetFor(target, request.user, request.configuredProfiles);
    response.json({ links: await publicLinksRegistry.list(workspaceScope(), target, { id: actor.id, admin: role === 'admin' }) });
  } catch (error) {
    next(error);
  }
});
publicLinksManagementRouter.post('/', async (request, response, next) => {
  try {
    const target = targetInput(request.body);
    const { actor } = await targetFor(target, request.user, request.configuredProfiles);
    response.status(201).json(await publicLinksRegistry.create(workspaceScope(), target, request.user, actor, request.body));
  } catch (error) {
    next(error);
  }
});
publicLinksManagementRouter.delete('/:id', async (request, response, next) => {
  try {
    const data = await getWorkspaceDatabase({ fields: ['members'] });
    const actor = knowledgeActor(data, request.user, request.configuredProfiles);
    response.json(await publicLinksRegistry.revoke(workspaceScope(), request.params.id, { id: actor.id, admin: workspaceMemberRole(actor) === 'admin' }));
  } catch (error) {
    next(error);
  }
});

const rate = new Map();
export const anonymousPublicLinksRouter = express.Router();
anonymousPublicLinksRouter.use((request, response, next) => {
  response.set({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range',
    'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
    'Content-Security-Policy': "default-src 'none'; style-src 'self'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  });
  if (request.method === 'OPTIONS') return response.sendStatus(204);
  const key = request.ip || request.socket.remoteAddress;
  const minute = Math.floor(Date.now() / 60000);
  const previous = rate.get(key);
  const current = previous?.minute === minute ? previous : { minute, count: 0 };
  rate.set(key, current);
  if (rate.size > 2000) rate.delete(rate.keys().next().value);
  if (++current.count > 240) return response.status(429).set('Retry-After', '60').json({ code: 'PUBLIC_LINK_RATE_LIMIT' });
  next();
});
const words = locale =>
  locale === 'ru'
    ? {
        shared: 'Публичный доступ',
        unavailable: 'Ссылка недоступна',
        explanation: 'Срок действия истёк, доступ отозван или материал перемещён.',
        raw: 'Исходный Markdown',
        json: 'Данные JSON',
        next: 'Далее',
        back: 'Назад к папке',
        empty: 'Папка пуста.',
        clipped: 'Показано начало большой заметки. Полный текст доступен в Markdown.',
      }
    : {
        shared: 'Public access',
        unavailable: 'Link unavailable',
        explanation: 'The link expired, access was revoked or the material moved.',
        raw: 'Raw Markdown',
        json: 'JSON data',
        next: 'Next',
        back: 'Back to folder',
        empty: 'This folder is empty.',
        clipped: 'Showing the beginning of a large note. The full text is available as Markdown.',
      };
const page = (locale, title, body) =>
  `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escape(title)} · Smena</title><link rel="stylesheet" href="/public-share.css"></head><body><main><header><b>СМΞНА</b><span>${words(locale).shared}</span></header><h1>${escape(title)}</h1>${body}</main></body></html>`;
async function capability(request) {
  const record = await publicLinksRegistry.verify(request.params.token);
  if (record.workspaceId !== 'default' && !(await workspaceDirectoryEntries()).some(row => row.id === record.workspaceId)) throw publicLinkError();
  const data = await readWorkspaceCore(record.workspaceId);
  const member = data.members?.find(row => row.id === record.memberId && isActiveMember(row));
  if (!member || workspaceMemberRole(member) === 'viewer') throw publicLinkError();
  return { record, user: { id: member.id, role: workspaceMemberRole(member), email: member.email || '' } };
}
async function folderPage(record, root, user, data, request, base, locale) {
  const fileFolder = record.kind === 'file-folder';
  const folders = (fileFolder ? data.projects.find(row => row.id === record.projectId).fileFolders : data.knowledgeFolders) || [];
  const selected = typeof request.query.folder === 'string' ? request.query.folder : root.id;
  if (!inSharedFolder(folders, selected, root.id)) throw publicLinkError();
  const offset = request.query.offset === undefined ? 0 : Number(request.query.offset);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) throw publicLinkError('INVALID_PUBLIC_LINK_PAGE', 422);
  const folder = folders.find(row => row.id === selected);
  const children = folders.filter(row => !row.archived && row.parentId === selected).sort((a, b) => a.name.localeCompare(b.name));
  const items = children
    .slice(offset, offset + 50)
    .map(row => ({ id: row.id, kind: 'folder', name: row.name, url: `${base}?lang=${locale}&folder=${encodeURIComponent(row.id)}` }));
  let total = children.length;
  if (fileFolder) {
    const fileOffset = Math.max(0, offset - children.length);
    const found = await queryWorkspaceFileCatalog(user, {
      revision: data.revision,
      project: record.projectId,
      folder: selected,
      offset: fileOffset,
      limit: 50,
      sort: 'name',
    });
    total += found.total;
    if (items.length < 50 && fileOffset < found.total) {
      const ids = found.files.slice(fileOffset % 50, (fileOffset % 50) + 50 - items.length).map(row => row.id);
      const snapshot = await getWorkspaceFilesSnapshot(user, ids);
      for (const id of ids) {
        const row = snapshot.files.find(file => file.id === id && file.project === record.projectId && file.folderId === selected);
        if (row)
          items.push({ id: row.id, kind: 'file', name: row.name, size: row.bytes || 0, url: `${base}/file/${encodeURIComponent(row.id)}?lang=${locale}` });
      }
    }
  } else {
    const notes = await getWorkspaceDatabase({ fields: ['knowledgeNotes'] });
    const found = notes.knowledgeNotes.filter(row => !row.archived && row.folderId === selected).sort((a, b) => a.title.localeCompare(b.title));
    total += found.length;
    items.push(
      ...found.slice(Math.max(0, offset - children.length), Math.max(0, offset - children.length) + 50 - items.length).map(row => ({
        id: row.id,
        kind: 'note',
        name: row.title,
        url: `${base}/note/${encodeURIComponent(row.id)}?lang=${locale}`,
      })),
    );
  }
  const nextOffset = offset + items.length < total ? offset + items.length : null;
  if (request.query.format === 'json') return { json: { name: folder.name, items, nextOffset } };
  const w = words(locale);
  return {
    title: folder.name,
    body: `${selected !== root.id ? `<a href="${base}?lang=${locale}&folder=${encodeURIComponent(folder.parentId || root.id)}">${w.back}</a>` : ''}<ul class="shared-items">${items.map(row => `<li><a href="${escape(row.url)}"><span class="kind">${row.kind === 'folder' ? '▸' : '↗'}</span>${escape(row.name)}</a></li>`).join('')}</ul>${!items.length ? `<p>${w.empty}</p>` : ''}${nextOffset !== null ? `<a class="button" href="${base}?lang=${locale}&folder=${encodeURIComponent(selected)}&offset=${nextOffset}">${w.next}</a>` : ''}`,
  };
}
async function serve(request, response, next) {
  const locale = request.query.lang === 'ru' ? 'ru' : 'en';
  try {
    const { record, user } = await capability(request);
    await inWorkspace(record.workspaceId, async () => {
      const { object: root, data } = await targetFor(record, user);
      const base = '/api/public/' + request.params.token;
      const childKind = request.params.kind;
      let object = root;
      let kind = record.kind;
      if (childKind) {
        if (
          (record.kind === 'file-folder' && childKind !== 'file') ||
          (record.kind === 'note-folder' && childKind !== 'note') ||
          !record.kind.endsWith('-folder')
        )
          throw publicLinkError();
        const resolved = await targetFor({ kind: childKind, targetId: request.params.id, projectId: record.projectId }, user);
        const folders = childKind === 'file' ? data.projects.find(row => row.id === record.projectId).fileFolders || [] : data.knowledgeFolders;
        if (!inSharedFolder(folders, resolved.object.folderId, root.id)) throw publicLinkError();
        object = resolved.object;
        kind = childKind;
      }
      if (kind === 'file') {
        if (request.method === 'HEAD') {
          const policy = getFileResponsePolicy(object.name, object.mimeType, request.query.download === '1');
          response.set({ 'Content-Type': policy.contentType, 'Content-Length': String(object.bytes || 0), 'Accept-Ranges': 'bytes' }).end();
          return;
        }
        // The existing streaming path keeps multi-GB files bounded and supports Range.
        const adapted = Object.create(request);
        adapted.user = user;
        adapted.publicFileGuard = (snapshot, file) => {
          const actor = knowledgeActor(snapshot, user, [], { write: true });
          const project = snapshot.projects.find(row => row.id === record.projectId && !row.archived);
          if (
            !file ||
            file.archived ||
            file.project !== record.projectId ||
            !canEditProject(project, actor.id, workspaceMemberRole(actor)) ||
            (record.kind === 'file-folder' && !inSharedFolder(project.fileFolders || [], file.folderId, root.id))
          )
            throw publicLinkError();
        };
        adapted.params = { id: object.id };
        adapted.query = { download: request.query.download === '1' ? '1' : '0' };
        await streamFileContent(adapted, response, next);
        return;
      }
      if (kind === 'note') {
        const { note } = await readKnowledgeNote(object.id, user);
        const text = note.formatted_markdown || '';
        if (request.query.format === 'markdown') {
          response.type('text/plain; charset=utf-8').send(text);
          return;
        }
        if (request.query.format === 'json') {
          response.json({ id: note.id, title: note.title, content_markdown: text });
          return;
        }
        const clipped = text.length > 256 * 1024;
        const html = sanitizeHtml(marked.parse(text.slice(0, 256 * 1024), { async: false }), {
          allowedTags: sanitizeHtml.defaults.allowedTags.filter(tag => !['img', 'iframe', 'style'].includes(tag)),
          allowedAttributes: { a: ['href', 'title', 'rel'], th: ['colspan'], td: ['colspan'] },
          allowedSchemes: ['https', 'http', 'mailto'],
          allowProtocolRelative: false,
          transformTags: { a: (tagName, attrs) => ({ tagName, attribs: { ...attrs, rel: 'noreferrer noopener nofollow' } }) },
        });
        const path = childKind ? `${base}/note/${encodeURIComponent(object.id)}` : base;
        response
          .type('html')
          .send(
            page(
              locale,
              note.title,
              `<nav><a href="${path}?lang=${locale}&format=markdown">${words(locale).raw}</a><a href="${path}?lang=${locale}&format=json">${words(locale).json}</a>${childKind ? `<a href="${base}?lang=${locale}&folder=${encodeURIComponent(note.folderId)}">${words(locale).back}</a>` : ''}</nav>${clipped ? `<p class="notice">${words(locale).clipped}</p>` : ''}<article>${html}</article>`,
            ),
          );
        return;
      }
      const result = await folderPage(record, root, user, data, request, base, locale);
      if (result.json) response.json(result.json);
      else response.type('html').send(page(locale, result.title, result.body));
    });
  } catch (error) {
    if (response.headersSent) return next(error);
    const status = error.statusCode === 422 ? 422 : error.statusCode === 503 ? 503 : 404;
    if (request.query.format === 'json') response.status(status).json({ code: status === 503 ? 'PUBLIC_LINKS_UNAVAILABLE' : 'PUBLIC_LINK_NOT_FOUND' });
    else
      response
        .status(status)
        .type('html')
        .send(page(locale, words(locale).unavailable, `<p>${words(locale).explanation}</p>`));
  }
}
anonymousPublicLinksRouter.get('/:token', serve);
anonymousPublicLinksRouter.get('/:token/:kind(file|note)/:id', serve);
anonymousPublicLinksRouter.use((_request, response) => response.sendStatus(404));
