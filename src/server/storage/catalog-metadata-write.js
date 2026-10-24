import { isDeepStrictEqual as same } from 'node:util';
import { catalogCore } from './file-catalog-shards.js';
import { readCatalogAccounting } from '../file-catalog-accounting.js';
import { FILE_CATALOG_MAX_BYTES } from '../../shared/file-catalog.js';
import { notificationRecipient } from '../../shared/notification-model.js';

const SCOPES = {
  knowledge: ['knowledgeNotes', 'knowledgeFolders', '_documentRevisions'],
  bookmarks: ['links', 'linkFolders', '_documentRevisions'],
  preferences: ['members', '_userPrefs', 'notifPrefs', 'notifs'],
};
const forbidden = () => Object.assign(new Error('This change requires a canonical catalog write.'), { statusCode: 403, code: 'METADATA_WRITE_FORBIDDEN' });
const omit = (value, keys) => Object.fromEntries(Object.entries(value || {}).filter(([key]) => !keys.includes(key)));

export function metadataWriteBase(root) {
  if (root?.schemaVersion !== 3 || root._aggregateVersion !== 1 || root._fileCatalog?.version !== 3) return null;
  const data = catalogCore(root, { identities: false }); // Validate all pointers/identities, retain no file rows.
  return readCatalogAccounting(root) ? data : null;
}

function assertPersonalPatch(current, next, memberId) {
  if (!memberId || !current.members.some(member => member.id === memberId) || next.members.length !== current.members.length) throw forbidden();
  const editable = ['name', 'title', 'c', 'profileEditedAt', 'locale', 'timeZone'];
  current.members.forEach((member, index) => {
    const incoming = next.members[index];
    if (!same(member.id === memberId ? omit(member, editable) : member, member.id === memberId ? omit(incoming, editable) : incoming)) throw forbidden();
  });
  for (const key of ['_userPrefs', 'notifPrefs']) if (!same(omit(current[key], [memberId]), omit(next[key], [memberId]))) throw forbidden();
  if (next.notifs.length !== current.notifs.length) throw forbidden();
  current.notifs.forEach((item, index) => {
    const own = notificationRecipient(item, current) === memberId;
    if (!same(own ? omit(item, ['read']) : item, own ? omit(next.notifs[index], ['read']) : next.notifs[index])) throw forbidden();
  });
}

// The only allowed copy-on-write operations leave every file pointer, task,
// project, relation, registry/retention record and sibling document unchanged.
export function patchCatalogMetadata(root, current, next, scope, memberId) {
  const fields = Object.hasOwn(SCOPES, scope) && SCOPES[scope];
  if (!fields || !same(current, metadataWriteBase(root))) throw forbidden();
  const allowed = [...fields, 'revision', 'updatedAt'];
  if (!same(omit(current, allowed), omit(next, allowed))) throw forbidden();
  if (!Number.isSafeInteger(next.revision) || next.revision !== current.revision + 1 || !Number.isFinite(Date.parse(next.updatedAt))) throw forbidden();
  if (scope === 'preferences') assertPersonalPatch(current, next, memberId);
  else {
    if (!same(omit(current._documentRevisions, [scope]), omit(next._documentRevisions, [scope]))) throw forbidden();
    const before = current._documentRevisions?.[scope] || {};
    const after = next._documentRevisions?.[scope];
    if (after?.revision !== Number(before.revision || 0) + 1 || after.createdAt !== (before.createdAt || current.createdAt)) throw forbidden();
  }
  const accounting = readCatalogAccounting(root);
  // The unchanged {data:{files},revision} envelope changes only by the decimal
  // revision's digit count. Unknown sizes/aliases/physical accounting stay exact.
  const catalogBytes = accounting.catalogBytes + String(next.revision).length - String(current.revision).length;
  if (catalogBytes > FILE_CATALOG_MAX_BYTES)
    throw Object.assign(new Error('File catalog exceeds its synchronization limit.'), {
      statusCode: 413,
      code: 'WORKSPACE_TOO_LARGE',
      maxBytes: FILE_CATALOG_MAX_BYTES,
      actualBytes: catalogBytes,
    });
  const result = { ...root, revision: next.revision, updatedAt: next.updatedAt };
  for (const key of fields) {
    if (Object.hasOwn(next, key)) result[key] = structuredClone(next[key]);
    else delete result[key];
  }
  result._fileCatalog = {
    ...root._fileCatalog,
    accounting: { version: 1, revision: next.revision, catalogBytes, fileStorage: accounting.fileStorage },
  };
  return result;
}
