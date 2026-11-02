import { esc } from '../core/utils.js';
import { folderTrail } from '../shared/knowledge-tools.js';
import { KNOWLEDGE_CATEGORIES, knowledgeCategoryLabel } from './knowledge-category.js';
import { noteAliases } from './knowledge-tags.js';
export function noteMetadataFields(note, folders, readOnly) {
  const disabled = readOnly ? 'disabled' : '';
  const categories = [...new Set([...KNOWLEDGE_CATEGORIES, note.category].filter(Boolean))];
  const folderIndex = new Map(folders.map(folder => [folder.id, folder]));
  return `<div class="knowledge-fields">
      <div class="field"><label class="label" for="knowledge-category">Category</label><select class="select" id="knowledge-category" data-in="knowledgeField" data-id="${note.id}" data-field="category" ${disabled}>${categories.map(value => `<option value="${esc(value)}" ${note.category === value ? 'selected' : ''} translate="no">${esc(knowledgeCategoryLabel(value))}</option>`).join('')}</select></div>
      <div class="field"><label class="label" for="knowledge-folder">Folder</label><select class="select" id="knowledge-folder" data-in="knowledgeField" data-id="${note.id}" data-field="folderId" ${disabled}><option value="">No folder</option>${folders
        .map(
          folder =>
            `<option value="${folder.id}" ${note.folderId === folder.id ? 'selected' : ''} translate="no">${esc(
              folderTrail(folder.id, folderIndex)
                .map(item => item.name)
                .join(' / '),
            )}</option>`,
        )
        .join('')}</select></div>
    </div>
    ${noteAliases(note, disabled)}<div class="knowledge-fields knowledge-fields-secondary"><div class="field"><label class="label" for="knowledge-summary">Summary</label><input class="input" id="knowledge-summary" value="${esc(note.summary || '')}" data-in="knowledgeField" data-blur="knowledgeField" data-id="${note.id}" data-field="summary" placeholder="A short description of the note" ${disabled}></div>
    <div class="field"><label class="label" for="knowledge-tags">Tags</label><input class="input" id="knowledge-tags" value="${esc((note.tags || []).join(', '))}" data-in="knowledgeField" data-blur="knowledgeField" data-id="${note.id}" data-field="tags" placeholder="process, onboarding, team" ${disabled}><span class="hint">Separate tags with commas.</span></div></div>
`;
}
