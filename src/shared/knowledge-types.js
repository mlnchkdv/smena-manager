export const NOTE_TYPES = [
  { id: 'note', name: 'Note', ru: 'Заметка', fields: [] },
  {
    id: 'meeting',
    name: 'Meeting',
    ru: 'Встреча',
    fields: [
      { id: 'date', name: 'Date', ru: 'Дата', kind: 'date' },
      { id: 'project', name: 'Project', ru: 'Проект', kind: 'project' },
    ],
  },
  { id: 'decision', name: 'Decision', ru: 'Решение', fields: [{ id: 'reason', name: 'Reason', ru: 'Обоснование', kind: 'text' }] },
  {
    id: 'instruction',
    name: 'Instruction',
    ru: 'Инструкция',
    fields: [
      { id: 'owner', name: 'Owner', ru: 'Ответственный', kind: 'member' },
      { id: 'review', name: 'Review date', ru: 'Дата проверки', kind: 'date' },
    ],
  },
  { id: 'research', name: 'Research', ru: 'Исследование', fields: [{ id: 'source', name: 'Source URL', ru: 'Адрес источника', kind: 'text' }] },
];
export const PROPERTY_KINDS = ['text', 'number', 'date', 'checkbox', 'member', 'project'];
const key = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
export const noteTypes = (ws = {}) => [...NOTE_TYPES, ...(ws.knowledgeTypes || [])];
export const noteType = (note, ws) => noteTypes(ws).find(type => type?.id === note.typeId) || NOTE_TYPES[0];
export function validNoteTypes(types) {
  return (
    Array.isArray(types) &&
    types.length <= 40 &&
    new Set(types.map(type => type?.id)).size === types.length &&
    types.every(
      type =>
        key(type?.id) &&
        !NOTE_TYPES.some(builtin => builtin.id === type.id) &&
        typeof type.name === 'string' &&
        type.name.trim().length > 0 &&
        type.name.length <= 80 &&
        Array.isArray(type.fields) &&
        type.fields.length <= 20 &&
        new Set(type.fields.map(field => field?.id)).size === type.fields.length &&
        type.fields.every(
          field =>
            key(field?.id) && typeof field.name === 'string' && field.name.trim().length > 0 && field.name.length <= 80 && PROPERTY_KINDS.includes(field.kind),
        ),
    )
  );
}
export function validNoteProperties(note) {
  if (note.typeId != null && !key(note.typeId)) return false;
  if (note.properties == null) return true;
  return (
    typeof note.properties === 'object' &&
    !Array.isArray(note.properties) &&
    Object.keys(note.properties).length <= 100 &&
    Object.entries(note.properties).every(
      ([id, value]) =>
        key(id) && (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && value.length <= 2000)),
    )
  );
}
