import { physicalFileKey } from './file-registry.js';
import { workspaceCoreData, workspaceDocumentData, DOCUMENT_NAMES } from '../shared/workspace-documents.js';
import { workspaceCapacity, workspaceTransportBytes } from '../shared/workspace-size.js';
import { FILE_CATALOG_MAX_BYTES } from '../shared/file-catalog.js';

export function workspaceCapacities(data, documents) {
  const { files = [], ...core } = workspaceCoreData(data);
  const capacities = {
    core: workspaceCapacity(workspaceTransportBytes(core, data.revision)),
    catalog: workspaceCapacity(workspaceTransportBytes({ files }, data.revision), FILE_CATALOG_MAX_BYTES),
  };
  for (const name of DOCUMENT_NAMES)
    capacities[name] = workspaceCapacity(workspaceTransportBytes(workspaceDocumentData(name, documents[name]), documents[name]?.revision || 0));
  return capacities;
}
export function fileStorageAccounting(data) {
  const active = new Set(),
    retained = new Set();
  let logicalBytes = 0,
    unknownActive = 0,
    aliases = 0;
  for (const file of data.files || []) {
    if (Number.isFinite(file.bytes) && file.bytes >= 0) logicalBytes += file.bytes;
    else unknownActive += 1;
    const key = physicalFileKey(file);
    if (key) {
      if (active.has(key)) aliases += 1;
      active.add(key);
    }
  }
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    const key = physicalFileKey(value);
    if (key && !active.has(key)) retained.add(key);
    for (const child of Object.values(value)) if (child && typeof child === 'object') visit(child);
  };
  visit(data.trash);
  for (const file of data._fileGc || []) {
    const key = physicalFileKey(file);
    if (key && !active.has(key)) retained.add(key);
  }
  const sum = keys => {
    let bytes = 0,
      unknown = 0;
    for (const key of keys) {
      const value = data._fileRegistry?.[key]?.bytes;
      if (Number.isFinite(value) && value >= 0) bytes += value;
      else unknown += 1;
    }
    return { knownBytes: bytes, unknownFiles: unknown, files: keys.size };
  };
  return {
    logical: { knownBytes: logicalBytes, unknownFiles: unknownActive, files: (data.files || []).length },
    activePhysical: sum(active),
    retainedPhysical: sum(retained),
    aliases,
    backupPhysicalBytes: null,
    note: 'Known metadata only; backup-only objects and other Drive content are not included.',
  };
}
