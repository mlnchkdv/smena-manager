import { ic } from '../core/icons.js';
import { wbText as T } from '../core/whiteboard-state.js';
import { disclosureAttributes } from './disclosure.js';
export function whiteboardPortableControl(editable) {
  return `<details class="ui-menu diagram-view-menu whiteboard-io" ${disclosureAttributes('whiteboard-io')} translate="no"><summary class="ibtn" aria-label="${T('Import and export whiteboard', 'Импорт и экспорт холста')}" title="${T('Import and export whiteboard', 'Импорт и экспорт холста')}">${ic('download', 16)}</summary><div><button data-a="whiteboardExport">${T('Download Smena JSON', 'Скачать Smena JSON')}</button><button data-a="whiteboardExportCanvas">${T('Download JSON Canvas', 'Скачать JSON Canvas')}</button>${editable ? `<button data-a="whiteboardImport">${T('Import JSON or Canvas…', 'Импорт JSON или Canvas…')}</button>` : ''}<p class="hint">${T('Smena JSON preserves all card fields. JSON Canvas transfers text, frames and connections; linked materials still require access in Smena.', 'Smena JSON сохраняет все поля. JSON Canvas переносит текст, рамки и связи; для связанных материалов нужен доступ в Smena.')}</p></div></details>`;
}
