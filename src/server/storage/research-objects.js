import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { RESEARCH_LIMITS, researchError } from '../../shared/research.js';

const digest = text => createHash('sha256').update(text).digest('hex');
const validHash = hash => {
  if (!/^[a-f0-9]{64}$/u.test(hash || '')) throw researchError('RESEARCH_INTEGRITY', 503);
};
function validate(text, hash) {
  validHash(hash);
  if (typeof text !== 'string' || Buffer.byteLength(text) > RESEARCH_LIMITS.indexBytes || digest(text) !== hash) throw researchError('RESEARCH_INTEGRITY', 503);
}
export function localResearchObjects(storage) {
  const target = hash => {
    validHash(hash);
    return path.join(path.dirname(storage.databasePath), 'research-objects', hash + '.json');
  };
  return {
    async readResearchObject(hash) {
      const file = target(hash);
      if ((await fs.stat(file)).size > RESEARCH_LIMITS.indexBytes) throw researchError('RESEARCH_INTEGRITY', 503);
      const text = await fs.readFile(file, 'utf8');
      validate(text, hash);
      return text;
    },
    async writeResearchObject(text, hash) {
      validate(text, hash);
      const file = target(hash),
        temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
      await fs.mkdir(path.dirname(file), { recursive: true });
      try {
        await fs.writeFile(temporary, text, { encoding: 'utf8', flag: 'wx' });
        try {
          await fs.link(temporary, file);
        } catch (error) {
          if (error.code !== 'EEXIST') throw error;
          if ((await fs.readFile(file, 'utf8')) !== text) throw researchError('RESEARCH_INTEGRITY', 503);
        }
      } finally {
        await fs.unlink(temporary).catch(() => {});
      }
    },
  };
}
export function driveResearchObjects(storage) {
  async function find(hash) {
    validHash(hash);
    await storage.init();
    const parent = String(storage.rootFolderId).replace(/\\/gu, '\\\\').replace(/'/gu, "\\'");
    const { data } = await storage.client.files.list({
      q: `name = 'smena-research-${hash}.json' and '${parent}' in parents and trashed = false and appProperties has { key='smenaResearch' and value='1' }`,
      fields: 'files(id,size),nextPageToken',
      pageSize: 2,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    if (data.nextPageToken || data.files?.length > 1) throw researchError('RESEARCH_INTEGRITY', 503);
    return data.files?.[0];
  }
  async function read(hash, file) {
    if (!file || Number(file.size) > RESEARCH_LIMITS.indexBytes) throw researchError('RESEARCH_INTEGRITY', 503);
    const { data } = await storage.client.files.get({ fileId: file.id, alt: 'media', supportsAllDrives: true }, { responseType: 'text' });
    validate(data, hash);
    return data;
  }
  return {
    async readResearchObject(hash) {
      return read(hash, await find(hash));
    },
    async writeResearchObject(text, hash) {
      validate(text, hash);
      const existing = await find(hash);
      if (existing) {
        if ((await read(hash, existing)) !== text) throw researchError('RESEARCH_INTEGRITY', 503);
        return;
      }
      await storage.client.files.create({
        requestBody: {
          name: `smena-research-${hash}.json`,
          parents: [storage.rootFolderId],
          mimeType: 'application/json',
          appProperties: { smenaResearch: '1' },
        },
        media: { mimeType: 'application/json', body: Readable.from([text]) },
        fields: 'id',
        supportsAllDrives: true,
      });
    },
  };
}
