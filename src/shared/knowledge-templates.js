import { validNoteProperties } from './knowledge-types.js';
export function validKnowledgeTemplates(items) {
  return (
    Array.isArray(items) &&
    items.length <= 40 &&
    new Set(items.map(item => item?.id)).size === items.length &&
    items.every(
      item =>
        typeof item?.id === 'string' &&
        /^[\w-]{1,100}$/.test(item.id) &&
        typeof item.name === 'string' &&
        item.name.trim() &&
        item.name.length <= 80 &&
        typeof item.title === 'string' &&
        item.title.length <= 250 &&
        typeof item.body === 'string' &&
        item.body.length <= 32000 &&
        validNoteProperties(item) &&
        (item.tags == null || (Array.isArray(item.tags) && item.tags.length <= 50 && item.tags.every(tag => typeof tag === 'string' && tag.length <= 80))),
    )
  );
}
export function templateNote(template, { id, now, day, author, project = '', folderId = null, memberId }) {
  const fill = value => String(value || '').replace(/\{\{(date|user|project)\}\}/g, (_, key) => ({ date: day, user: author, project })[key]);
  return {
    id,
    title: fill(template.title) || template.name,
    formatted_markdown: fill(template.body),
    typeId: template.typeId || 'note',
    properties: Object.fromEntries(Object.entries(template.properties || {}).map(([key, value]) => [key, typeof value === 'string' ? fill(value) : value])),
    tags: [...(template.tags || [])],
    category: 'General',
    summary: '',
    folderId,
    createdAt: now,
    updatedAt: now,
    createdBy: memberId,
    updatedBy: memberId,
  };
}
