import { getSessionGeneration, getActiveWorkspace } from './api.js';
let scope = '';
export const knowledgeMedia = new Map();
export function mediaScope() {
  const next = JSON.stringify([getSessionGeneration(), getActiveWorkspace()]);
  if (scope !== next) {
    for (const item of knowledgeMedia.values()) URL.revokeObjectURL(item.url);
    knowledgeMedia.clear();
    scope = next;
  }
  return scope;
}
export function knowledgeImageUrl(id) {
  mediaScope();
  return knowledgeMedia.get(id)?.url || '';
}
