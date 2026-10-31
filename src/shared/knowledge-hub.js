import { noteType } from './knowledge-types.js';
import { materialReferences } from './material-links.js';
export function hubNotes(data, kind, id) {
  const relationKey = `${kind}:${id}`;
  const linked = new Set(
    (data.relations || []).filter(r => !r.deletedAt && (r.from === relationKey || r.to === relationKey)).map(r => (r.from === relationKey ? r.to : r.from)),
  );
  return (data.knowledgeNotes || []).filter(note => {
    const fields = noteType(note, data.ws).fields;
    return (
      fields.some(field => field.kind === kind && note.properties?.[field.id] === id) ||
      linked.has(`note:${note.id}`) ||
      (kind === 'project' && materialReferences(note.formatted_markdown).some(ref => ref.key === relationKey))
    );
  });
}
