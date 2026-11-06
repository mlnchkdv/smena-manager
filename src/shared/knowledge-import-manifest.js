import { decodeNoteFile } from './knowledge-import.js';
import { WORKSPACE_TRANSPORT_MAX_BYTES, jsonByteLength } from './workspace-size.js';
const hash = async value =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(n => n.toString(16).padStart(2, '0')).join('');
export async function readImportSource(file) {
  if (file.name.length > 512 || /[\\/]/.test(file.name) || [...file.name].some(char => char.charCodeAt(0) < 32)) throw new TypeError('Invalid note filename.');
  if (!/\.(txt|md|markdown)$/i.test(file.name)) throw new TypeError('Only TXT, MD and Markdown files are supported.');
  if (!file.size) throw new TypeError('The note file is empty.');
  if (file.size > 2 * 1024 * 1024) throw new TypeError('Each note file must be smaller than 2 MiB.');
  const source = decodeNoteFile(await file.arrayBuffer());
  if (!source.trim()) throw new TypeError('The note file is empty.');
  if (jsonByteLength({ key: '0'.repeat(64), source }) > WORKSPACE_TRANSPORT_MAX_BYTES - 4096)
    throw new TypeError('The decoded note exceeds the request limit.');
  return source;
}
// Two passes, one source in memory at a time. No payload texts in the review or
// browser journal; resuming requires the user to reselect matching originals.
export async function prepareKnowledgeImportManifest(files, { onProgress, signal } = {}) {
  const list = Array.from(files || []),
    entries = [],
    errors = [],
    handles = new Map();
  if (!list.length || list.length > 1000) throw new TypeError('Select up to 1,000 note files.');
  if (list.reduce((sum, f) => sum + f.size, 0) > 256 * 1024 * 1024) throw new TypeError('Select no more than 256 MiB of note files.');
  for (const [i, file] of list.entries()) {
    signal?.throwIfAborted();
    try {
      const source = await readImportSource(file),
        sourceHash = await hash(source),
        key = await hash(JSON.stringify([file.name, file.size, sourceHash]));
      if (!handles.has(key)) {
        entries.push({ key, name: file.name, size: file.size, sourceHash });
        handles.set(key, file);
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      errors.push({ name: file.name, error: error.message });
    }
    onProgress?.(i + 1, list.length);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return { entries, errors, handles };
}
