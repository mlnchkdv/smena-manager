import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getStorageProvider } from './storage/index.js';
import { readPublicLinkRegistry, savePublicLinkRegistry } from './storage/public-link-registry.js';

export const publicLinkError = (code = 'PUBLIC_LINK_NOT_FOUND', statusCode = 404) => Object.assign(new Error(code), { code, statusCode });
export const PUBLIC_LINK_KINDS = ['file', 'note', 'file-folder', 'note-folder'];
const secret = () => {
  const value = process.env.PUBLIC_LINK_SECRET || process.env.SESSION_SECRET || '';
  if (value.length < 32 || process.env.SMENA_PUBLIC_LINKS_ENABLED === 'false') throw publicLinkError('PUBLIC_LINKS_DISABLED', 503);
  return value;
};
const signature = record => createHmac('sha256', secret()).update(`smena-public-link-v1|${record.workspaceId}|${record.id}`).digest('base64url');
const dto = record => ({
  id: record.id,
  kind: record.kind,
  targetId: record.targetId,
  projectId: record.projectId,
  createdAt: record.createdAt,
  expiresAt: record.expiresAt,
  revokedAt: record.revokedAt || null,
  path: `/api/public/${record.id}.${signature(record)}?lang=${record.locale}`,
});

function recordEvent(data, record, actorId, event, at) {
  const { workspaceId, kind, targetId, projectId } = record;
  data.events = [...(data.events || []).slice(-999), { workspaceId, kind, targetId, projectId, actorId, event, at }];
}

// Deliberately separate from workspace documents and their backup/restore cycle.
export class PublicLinksRegistry {
  constructor({ provider = () => getStorageProvider('default'), now = () => Date.now() } = {}) {
    this.provider = provider;
    this.now = now;
    this.queue = Promise.resolve();
  }
  mutate(operation) {
    const run = async () => {
      for (let n = 0; n < 3; n++) {
        const baseline = await readPublicLinkRegistry(this.provider());
        const next = structuredClone(baseline);
        const result = operation(next);
        try {
          await savePublicLinkRegistry(this.provider(), next, baseline);
          return result;
        } catch (error) {
          if (![409, 412].includes(Number(error.statusCode || error.response?.status || error.code)) || n === 2) throw error;
        }
      }
    };
    const pending = this.queue.then(run, run);
    this.queue = pending.catch(() => {});
    return pending;
  }
  async events(workspaceId) {
    const data = await readPublicLinkRegistry(this.provider());
    return (data.events || [])
      .filter(row => row.workspaceId === workspaceId)
      .slice(-100)
      .reverse();
  }
  async list(workspaceId, target, actor) {
    secret();
    const data = await readPublicLinkRegistry(this.provider());
    return data.records
      .filter(
        record =>
          record.workspaceId === workspaceId &&
          record.kind === target.kind &&
          record.targetId === target.targetId &&
          (record.projectId || '') === (target.projectId || '') &&
          (record.memberId === actor.id || actor.admin),
      )
      .map(dto);
  }
  create(workspaceId, target, profile, member, input) {
    secret();
    const days = input?.expiresInDays ?? 7;
    if (![0, 1, 7, 30, 90].includes(days) || !['en', 'ru'].includes(input?.locale || 'en')) throw publicLinkError('INVALID_PUBLIC_LINK', 422);
    return this.mutate(data => {
      data.records = data.records.filter(record => !record.revokedAt && (!record.expiresAt || Date.parse(record.expiresAt) > this.now()));
      if (data.records.length >= 2000 || data.records.filter(record => record.workspaceId === workspaceId && record.memberId === member.id).length >= 100)
        throw publicLinkError('PUBLIC_LINK_LIMIT', 429);
      const record = {
        id: randomBytes(24).toString('base64url'),
        workspaceId,
        ...target,
        memberId: member.id,
        profile: { id: profile.id, email: profile.email || '' },
        locale: input?.locale || 'en',
        createdAt: new Date(this.now()).toISOString(),
        expiresAt: days ? new Date(this.now() + days * 86400000).toISOString() : null,
      };
      data.records.push(record);
      recordEvent(data, record, member.id, 'issued', record.createdAt);
      return dto(record);
    });
  }
  revoke(workspaceId, id, actor) {
    return this.mutate(data => {
      const record = data.records.find(row => row.id === id && row.workspaceId === workspaceId && (row.memberId === actor.id || actor.admin));
      if (!record) throw publicLinkError();
      if (!record.revokedAt) {
        record.revokedAt = new Date(this.now()).toISOString();
        recordEvent(data, record, actor.id, 'revoked', record.revokedAt);
      }
      return { id: record.id, revokedAt: record.revokedAt };
    });
  }
  async verify(token) {
    const parts = /^([\w-]{32})\.([\w-]{43})$/.exec(token || '');
    if (!parts) throw publicLinkError();
    const data = await readPublicLinkRegistry(this.provider());
    const record = data.records.find(row => row.id === parts[1]);
    if (!record || record.revokedAt || (record.expiresAt && Date.parse(record.expiresAt) <= this.now())) throw publicLinkError();
    const expected = Buffer.from(signature(record));
    if (!timingSafeEqual(expected, Buffer.from(parts[2]))) throw publicLinkError();
    return structuredClone(record);
  }
}
export const publicLinksRegistry = new PublicLinksRegistry();
