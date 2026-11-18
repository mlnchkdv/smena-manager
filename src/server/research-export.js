import { createHash } from 'node:crypto';
import { renderKnowledgeMarkdown } from '../shared/knowledge-markdown.js';
import { researchReportMarkdown } from '../shared/research-report.js';
import { researchJson } from '../shared/research.js';

const escape = value => String(value).replace(/[&<>"']/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export function researchExportFiles(record, runs, objects, russian = false) {
  const markdown = researchReportMarkdown(record, runs, russian);
  const files = {
    'article.md': markdown,
    'article.html': `<!doctype html><html lang="${russian ? 'ru' : 'en'}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><title>${escape(record.title)}</title><style>body{font:16px/1.6 system-ui;max-width:840px;margin:24px auto;padding:16px;color:#202020}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#3949b8}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px}</style><body>${renderKnowledgeMarkdown(markdown)}</body></html>`,
    'record.json': researchJson(record),
    'run.json': researchJson(runs),
    'config.json': researchJson(Object.fromEntries(runs.map(run => [run.id, run.data.config || {}]))),
    'metrics.json': researchJson(Object.fromEntries(runs.map(run => [run.id, run.data.metrics || []]))),
    'artifacts.json': researchJson([...new Map([record, ...runs].flatMap(item => item.data.artifacts || []).map(file => [file.fileId, file])).values()]),
    'dataset-manifest.json': researchJson(
      objects
        .filter(item => item.value.kind === 'dataset')
        .map(item => ({ id: item.value.id, revision: item.value.revision, manifest: item.value.data.manifest || {}, sha256: item.sha256 })),
    ),
  };
  for (const object of objects) files['objects/' + object.sha256 + '.json'] = researchJson(object.value);
  const checksums = Object.entries(files).map(([name, text]) => ({
    name,
    bytes: Buffer.byteLength(text),
    sha256: createHash('sha256').update(text).digest('hex'),
  }));
  files['manifest.json'] = researchJson({
    format: 'smena-research-export-v1',
    recordId: record.id,
    projectId: record.projectId,
    workspaceId: record.workspaceId,
    createdAt: new Date().toISOString(),
    assetsIncluded: false,
    notice: 'Canonical file metadata only. Media bytes remain in Files and retain their access permissions.',
    files: checksums,
  });
  return files;
}
