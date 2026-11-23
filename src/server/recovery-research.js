import { createHash } from 'node:crypto';
import { researchRef } from '../shared/research.js';

import { workspaceScope } from './workspace-context.js';

const MAX_BYTES = 24 * 1024 * 1024;
const MAX_OBJECTS = 12000;
function roots(data, scope) {
  return Object.entries(data._researchProjects || {}).map(([project, ref]) => ({ project, ref, scope }));
}

function inspect(project, ref, text, scope) {
  if (!researchRef(ref) || typeof text !== 'string' || Buffer.byteLength(text) !== ref.bytes || createHash('sha256').update(text).digest('hex') !== ref.sha256)
    throw new Error('Research recovery object failed integrity verification.');
  const value = JSON.parse(text);
  if (value.projectId !== project || typeof value.workspaceId !== 'string' || (scope && value.workspaceId !== scope))
    throw new Error('Research recovery scope mismatch.');
  const children =
    value.kind === 'smena-research-index-v1'
      ? [...value.records.map(row => row.ref), ...Object.values(value.operations).map(row => row.ref)]
      : [value.previous, ...Object.values(value.plan || {}).map(row => row?.ref)];
  return children.filter(Boolean).map(child => ({ project, ref: child, scope: value.workspaceId }));
}

function* traverse(data, scope) {
  const queue = roots(data, scope);
  const seen = new Map();
  let bytes = 0;
  while (queue.length) {
    const { project, ref, scope } = queue.pop();
    if (!researchRef(ref)) throw new Error('Invalid research recovery reference.');
    if (seen.has(ref.sha256)) {
      if (seen.get(ref.sha256) !== project) throw new Error('Research recovery scope mismatch.');
      continue;
    }
    seen.set(ref.sha256, project);
    bytes += ref.bytes;
    if (bytes > MAX_BYTES || seen.size > MAX_OBJECTS) throw new Error('Research recovery budget exceeded.');
    const text = yield ref.sha256;
    for (const child of inspect(project, ref, text, scope)) queue.push(child);
  }
}
export async function exportRecoveryResearch(data, storage) {
  const objects = {};
  const walk = traverse(data, workspaceScope());
  for (let step = walk.next(); !step.done; step = walk.next(objects[step.value])) objects[step.value] = await storage.readResearchObject(step.value);
  return objects;
}
export function verifyRecoveryResearch(data, objects) {
  if (!objects || typeof objects !== 'object' || Array.isArray(objects)) throw new Error('Invalid research recovery objects.');
  const walk = traverse(data);
  let found = 0;
  for (let step = walk.next(); !step.done; step = walk.next(objects[step.value])) found++;
  if (Object.keys(objects).length !== found) throw new Error('Unexpected research recovery objects.');
}
