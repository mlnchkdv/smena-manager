import { parseMarkdownNote, parseTextNote } from './markdown-import.js';
import { jsonByteLength, WORKSPACE_TRANSPORT_MAX_BYTES } from './workspace-size.js';

const LIMIT = WORKSPACE_TRANSPORT_MAX_BYTES - 4096;
export const KNOWLEDGE_FILE_ACCEPT = '.txt,.md,.markdown,text/plain,text/markdown';

export function decodeNoteFile(buffer) {
  const bytes = new Uint8Array(buffer);
  let text;
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder('utf-16le', { fatal: true }).decode(bytes);
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) text = new TextDecoder('utf-16be', { fatal: true }).decode(bytes);
    else {
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        // Legacy Russian TXT exports commonly use Windows-1251.
        text = new TextDecoder('windows-1251').decode(bytes);
      }
    }
  } catch {
    throw new TypeError('This file is not a text note.');
  }
  // Reject binary control bytes while preserving tabs and newlines in text.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text)) throw new TypeError('This file is not a text note.');
  return text;
}

export async function reviewKnowledgeImport(files, options = {}) {
  const items = Array.from(files || []);
  if (!items.length) throw new TypeError('Select TXT or Markdown files.');
  if (items.length > 50) throw new TypeError('Import up to 50 note files at a time.');
  if (items.reduce((sum, file) => sum + file.size, 0) > LIMIT) throw new TypeError('The import file must be smaller than 4 MB.');
  const notes = [];
  const entries = [];
  for (const file of items) {
    try {
      if (!/\.(txt|md|markdown)$/i.test(file.name)) throw new TypeError('Only TXT, MD and Markdown files are supported.');
      if (!file.size) throw new TypeError('The note file is empty.');
      let buffer;
      try {
        buffer = await file.arrayBuffer();
      } catch {
        throw new TypeError('The file could not be read.');
      }
      const source = decodeNoteFile(buffer);
      if (!source.trim()) throw new TypeError('The note file is empty.');
      const note = (/\.txt$/i.test(file.name) ? parseTextNote : parseMarkdownNote)(file.name, source, options);
      notes.push(note);
      entries.push({ name: file.name, id: note.id });
    } catch (error) {
      entries.push({ name: file.name, error: error.message });
    }
    options.onProgress?.(entries.length, items.length);
  }
  const payload = { notes };
  if (jsonByteLength({ payload }) > LIMIT) throw new TypeError('The import file must be smaller than 4 MB.');
  return { payload, entries };
}

export async function prepareKnowledgeImport(files, options = {}) {
  const result = await reviewKnowledgeImport(files, options);
  const failed = result.entries.find(entry => entry.error);
  if (failed) throw new TypeError(failed.error);
  return result.payload;
}
