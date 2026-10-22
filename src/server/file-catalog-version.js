import { createHash } from 'node:crypto';
// Fingerprint only the ACL-filtered metadata. Unrelated task/comment writes
// must not invalidate every page of a large catalog or force a re-download.
export const fileCatalogVersion = files => createHash('sha256').update(JSON.stringify(files)).digest('hex');
