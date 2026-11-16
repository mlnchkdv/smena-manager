import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { getStorageProvider } from './storage/index.js';
import { readIntegrationRegistry, saveIntegrationRegistry } from './storage/integration-registry.js';
import { INTEGRATION_LIMITS, INTEGRATION_SCOPES } from '../shared/integration-contract.js';

export const integrationError = (code, statusCode = 422, message = code) => Object.assign(new Error(message), { code, statusCode });
const digest = secret => createHash('sha256').update(secret).digest('hex');
const publicRecord = record =>
  Object.fromEntries(Object.entries(record).filter(([key]) => !['secretHash', 'profile', 'rateMinute', 'rateCount'].includes(key)));
export const publicApiPolicy = policy => ({
  enabled: policy?.enabled === true,
  writeEnabled: policy?.writeEnabled === true,
  uploadsEnabled: policy?.uploadsEnabled === true,
});

export class IntegrationRegistry {
  constructor({ provider = () => getStorageProvider('default'), now = () => Date.now() } = {}) {
    this.provider = provider;
    this.now = now;
    this.queue = Promise.resolve();
  }
  mutate(operation) {
    const run = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const baseline = await readIntegrationRegistry(this.provider());
        const next = structuredClone(baseline);
        const result = await operation(next);
        try {
          await saveIntegrationRegistry(this.provider(), next, baseline);
          return result;
        } catch (error) {
          if (![409, 412].includes(Number(error.statusCode || error.response?.status || error.code)) || attempt === 2) throw error;
        }
      }
    };
    const pending = this.queue.then(run, run);
    this.queue = pending.catch(() => {});
    return pending;
  }
  async list(profile, workspaceId) {
    const data = await readIntegrationRegistry(this.provider());
    return {
      policy: publicApiPolicy(data.policies[workspaceId]),
      integrations: data.records.filter(r => r.workspaceId === workspaceId && (r.userId === profile.id || profile.role === 'admin')).map(publicRecord),
    };
  }
  policy(workspaceId, input) {
    if (
      !input ||
      Object.keys(input).some(key => !['enabled', 'writeEnabled', 'uploadsEnabled'].includes(key)) ||
      Object.values(input).some(value => typeof value !== 'boolean')
    )
      throw integrationError('INVALID_API_POLICY');
    return this.mutate(data => (data.policies[workspaceId] = { ...publicApiPolicy(data.policies[workspaceId]), ...input }));
  }
  create(profile, workspaceId, input) {
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    const scopes = input?.scopes;
    const days = input?.expiresInDays ?? INTEGRATION_LIMITS.lifetimeDays;
    if (
      !name ||
      name.length > 80 ||
      !Array.isArray(scopes) ||
      !scopes.length ||
      new Set(scopes).size !== scopes.length ||
      scopes.some(scope => !INTEGRATION_SCOPES.includes(scope)) ||
      !Number.isInteger(days) ||
      days < 1 ||
      days > 90
    )
      throw integrationError('INVALID_INTEGRATION');
    if (profile.role === 'viewer' && scopes.some(scope => scope.endsWith(':write'))) throw integrationError('INTEGRATION_SCOPE_FORBIDDEN', 403);
    return this.mutate(data => {
      const policy = publicApiPolicy(data.policies[workspaceId]);
      if (!policy.enabled) throw integrationError('PUBLIC_API_DISABLED', 503);
      if ((!policy.writeEnabled && scopes.some(s => s.endsWith(':write'))) || (!policy.uploadsEnabled && scopes.some(s => s.startsWith('files:'))))
        throw integrationError('INTEGRATION_SCOPE_DISABLED', 403);
      data.records = data.records.filter(r => Date.parse(r.expiresAt) > this.now());
      if (data.records.length >= 2000 || data.records.filter(r => r.userId === profile.id && !r.revokedAt).length >= INTEGRATION_LIMITS.activePerUser)
        throw integrationError('INTEGRATION_LIMIT', 429);
      const id = randomUUID(),
        secret = randomBytes(32).toString('base64url');
      const record = {
        id,
        name,
        userId: profile.id,
        workspaceId,
        scopes,
        createdAt: new Date(this.now()).toISOString(),
        expiresAt: new Date(this.now() + days * 86400000).toISOString(),
        lastUsedAt: null,
        profile: { id: profile.id, email: profile.email || '', name: profile.name || '', role: profile.role },
        secretHash: digest(secret),
      };
      data.records.push(record);
      return { integration: publicRecord(record), token: `smena_int_${id}.${secret}` };
    });
  }
  revoke(profile, workspaceId, id) {
    return this.mutate(data => {
      const record = data.records.find(r => r.id === id && r.workspaceId === workspaceId && (r.userId === profile.id || profile.role === 'admin'));
      if (!record) throw integrationError('INTEGRATION_NOT_FOUND', 404);
      record.revokedAt ||= new Date(this.now()).toISOString();
      return publicRecord(record);
    });
  }
  async verify(token, { touch = false } = {}) {
    const match = /^smena_int_([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/.exec(token || '');
    if (!match) throw integrationError('INTEGRATION_AUTH_REQUIRED', 401);
    const check = data => {
      const record = data.records.find(r => r.id === match[1]);
      const supplied = Buffer.from(digest(match[2]), 'hex'),
        expected = Buffer.from(record?.secretHash || '0'.repeat(64), 'hex');
      if (
        expected.length !== supplied.length ||
        !timingSafeEqual(expected, supplied) ||
        !record ||
        record.revokedAt ||
        Date.parse(record.expiresAt) <= this.now()
      )
        throw integrationError('INTEGRATION_REVOKED_OR_EXPIRED', 401);
      const policy = publicApiPolicy(data.policies[record.workspaceId]);
      if (!policy.enabled || process.env.SMENA_PUBLIC_API_ENABLED === 'false') throw integrationError('PUBLIC_API_DISABLED', 503);
      if (touch) {
        const minute = Math.floor(this.now() / 60000);
        record.rateCount = record.rateMinute === minute ? Number(record.rateCount || 0) + 1 : 1;
        record.rateMinute = minute;
        if (record.rateCount > 60) throw integrationError('INTEGRATION_RATE_LIMIT', 429);
        record.lastUsedAt = new Date(this.now()).toISOString();
      }
      return { ...record, policy };
    };
    return touch ? this.mutate(check) : check(await readIntegrationRegistry(this.provider()));
  }
}
export const integrationRegistry = new IntegrationRegistry();
