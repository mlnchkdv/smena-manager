// Keep source strings by reference/value; serializing every loaded body would
// itself copy megabytes on each unrelated render. Include all block sources:
// a lazy transclusion completing must invalidate the retained reader.
export function knowledgeReadingInputs(data, note, source, scope, assets) {
  return [
    ...scope,
    data.me,
    source,
    JSON.stringify([note.id, note.sourceFormat, note.assets, note.materialTargets, note.wikilinks, note.wikiRefs, assets]),
    ...(data.knowledgeNotes || []).flatMap(item => [
      item.id,
      item.title,
      item.bodyToken,
      item.formatted_markdown,
      item.sourceFormat,
      JSON.stringify(item.aliases),
    ]),
  ];
}
export const sameKnowledgeReadingInputs = (left, right) =>
  Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]);
