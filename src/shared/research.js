export const RESEARCH_KINDS = Object.freeze(['observation', 'source', 'dataset', 'experiment', 'run', 'protocol', 'article', 'review', 'handoff']);
export const RESEARCH_PROFILES = Object.freeze([
  'dataset_preparation',
  'scene_optimization',
  'pretrained_inference',
  'finetuning',
  'rendering',
  'geometry_evaluation',
  'conversion',
  'foundation_training',
]);
export const RESEARCH_STATES = Object.freeze(['planned', 'running', 'completed', 'failed', 'cancelled']);
export const RESEARCH_LIMITS = Object.freeze({
  objectBytes: 1024 * 1024,
  indexBytes: 4 * 1024 * 1024,
  records: 5000,
  operations: 10000,
  metrics: 200,
  artifacts: 200,
});
export const researchError = (code = 'RESEARCH_INVALID', statusCode = 400) =>
  Object.assign(new Error('The research record could not be processed.'), { code, statusCode });
export const researchId = id => typeof id === 'string' && /^[a-zA-Z0-9_.-]{1,180}$/u.test(id);
export const researchUuid = id => typeof id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(id);
export const researchRef = ref =>
  ref?.kind === 'smena-research-object-v1' &&
  /^[a-f0-9]{64}$/u.test(ref.sha256 || '') &&
  Number.isSafeInteger(ref.bytes) &&
  ref.bytes > 0 &&
  ref.bytes <= RESEARCH_LIMITS.indexBytes;
export function researchJson(value, depth = 0) {
  if (depth > 20) throw researchError();
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(item => researchJson(item, depth + 1)).join(',') + ']';
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw researchError();
  return (
    '{' +
    Object.keys(value)
      .sort()
      .map(key => {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) throw researchError();
        return JSON.stringify(key) + ':' + researchJson(value[key], depth + 1);
      })
      .join(',') +
    '}'
  );
}
const text = (value, max) => typeof value === 'string' && value.length <= max;
const DATA_FIELDS = new Set([
  'hypothesis',
  'baseline',
  'criterion',
  'factor',
  'ownerId',
  'reviewerId',
  'profile',
  'state',
  'experimentId',
  'datasetId',
  'protocolId',
  'datasetVersion',
  'protocolVersion',
  'split',
  'evaluationResolution',
  'codeRevision',
  'weightsRevision',
  'seed',
  'hardware',
  'config',
  'startedAt',
  'finishedAt',
  'reason',
  'conclusion',
  'decision',
  'nextStep',
  'metrics',
  'artifacts',
  'links',
  'sourceUrl',
  'sourceVersion',
  'readDepth',
  'claimOrigin',
  'checkedAt',
  'license',
  'manifest',
  'periodFrom',
  'periodTo',
  'timeZone',
  'coverage',
  'pending',
  'templateId',
  'templateVersion',
  'baselineRunId',
  'evidence',
  'compatibility',
  'amendment',
]);
export function validateResearchDraft(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['kind', 'title', 'body', 'data', 'tags'].includes(key)))
    throw researchError();
  if (!RESEARCH_KINDS.includes(input.kind) || !text(input.title, 240) || !input.title.trim() || !text(input.body ?? '', 64000)) throw researchError();
  const data = input.data || {};
  if (!data || Array.isArray(data) || typeof data !== 'object' || Object.keys(data).some(key => !DATA_FIELDS.has(key))) throw researchError();
  if (new TextEncoder().encode(researchJson(data)).length > 256 * 1024) throw researchError('RESEARCH_LIMIT', 413);
  const structured = new Set([
    'config',
    'hardware',
    'metrics',
    'artifacts',
    'links',
    'manifest',
    'pending',
    'evidence',
    'compatibility',
    'datasetVersion',
    'protocolVersion',
  ]);
  for (const [key, value] of Object.entries(data))
    if (!structured.has(key) && !(key === 'seed' && Number.isSafeInteger(value)) && !text(value, 8000)) throw researchError();
  if (data.profile != null && !RESEARCH_PROFILES.includes(data.profile)) throw researchError();
  if (data.state != null && !RESEARCH_STATES.includes(data.state)) throw researchError();
  for (const key of ['ownerId', 'reviewerId', 'experimentId', 'datasetId', 'protocolId', 'baselineRunId'])
    if (data[key] && !researchId(data[key])) throw researchError();
  if (data.metrics != null && (!Array.isArray(data.metrics) || data.metrics.length > RESEARCH_LIMITS.metrics || !data.metrics.every(validResearchMetric)))
    throw researchError('RESEARCH_METRIC_INVALID');
  if (data.artifacts != null && (!Array.isArray(data.artifacts) || data.artifacts.length > RESEARCH_LIMITS.artifacts)) throw researchError();
  const tags = input.tags || [];
  if (!Array.isArray(tags) || tags.length > 30 || !tags.every(tag => text(tag, 80))) throw researchError();
  return { kind: input.kind, title: input.title.trim(), body: input.body || '', data: structuredClone(data), tags: [...new Set(tags)] };
}
export function validResearchMetric(metric) {
  return (
    !!metric &&
    typeof metric === 'object' &&
    !Array.isArray(metric) &&
    Object.keys(metric).every(key =>
      ['key', 'value', 'unit', 'status', 'reason', 'scope', 'n', 'aggregation', 'protocolId', 'evidenceId', 'origin'].includes(key),
    ) &&
    text(metric.key, 100) &&
    !!metric.key &&
    text(metric.unit, 40) &&
    ['measured', 'missing', 'not_applicable'].includes(metric.status) &&
    (metric.status === 'measured'
      ? typeof metric.value === 'number' && Number.isFinite(metric.value)
      : metric.value === null && text(metric.reason, 1000) && !!metric.reason.trim()) &&
    (metric.n == null || (Number.isSafeInteger(metric.n) && metric.n > 0)) &&
    (metric.origin == null || ['team', 'author'].includes(metric.origin))
  );
}
export function validateResearchTransition(before, next) {
  if (!before || next.kind !== 'run') return;
  const prior = before.data.state || 'planned',
    state = next.data.state || 'planned';
  const transitions = { planned: ['running', 'failed', 'cancelled'], running: ['completed', 'failed', 'cancelled'], completed: [], failed: [], cancelled: [] };
  if (prior !== state && !transitions[prior].includes(state)) throw researchError('RESEARCH_STATE_TRANSITION', 409);
  if (prior !== 'planned') {
    const fields = [
      'profile',
      'experimentId',
      'datasetId',
      'datasetVersion',
      'protocolId',
      'protocolVersion',
      'split',
      'codeRevision',
      'weightsRevision',
      'seed',
      'hardware',
      'config',
    ];
    if (fields.some(key => researchJson(before.data[key] ?? null) !== researchJson(next.data[key] ?? null))) throw researchError('RESEARCH_PLAN_LOCKED', 409);
    if (['completed', 'failed', 'cancelled'].includes(prior) && !next.data.amendment?.trim()) throw researchError('RESEARCH_AMENDMENT_REQUIRED', 409);
  }
  if (['failed', 'cancelled'].includes(state) && !next.data.reason?.trim()) throw researchError('RESEARCH_REASON_REQUIRED');
}
