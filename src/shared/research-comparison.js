import { researchJson } from './research.js';

const resource = /(?:fps|time|memory|vram|ram|bytes|size|latency)/iu;
function flatten(value, prefix = '', result = {}) {
  for (const [key, item] of Object.entries(value || {})) {
    const path = prefix ? prefix + '.' + key : key;
    if (item && typeof item === 'object' && !Array.isArray(item)) flatten(item, path, result);
    else result[path] = item;
  }
  return result;
}
export function compareResearchRuns(base, candidate) {
  const reasons = [];
  if (base.kind !== 'run' || candidate.kind !== 'run' || base.projectId !== candidate.projectId || base.workspaceId !== candidate.workspaceId)
    reasons.push('scope');
  if (base.data.state !== 'completed' || candidate.data.state !== 'completed') reasons.push('state');
  for (const field of ['profile', 'experimentId']) if (!base.data[field] || base.data[field] !== candidate.data[field]) reasons.push(field);
  for (const field of ['datasetVersion', 'protocolVersion'])
    if (!base.data[field]?.ref?.sha256 || base.data[field].ref.sha256 !== candidate.data[field]?.ref?.sha256) reasons.push(field);
  const hardwareEqual = researchJson(base.data.hardware ?? null) === researchJson(candidate.data.hardware ?? null);
  const left = flatten(base.data.config),
    right = flatten(candidate.data.config);
  const configDiff = [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter(key => researchJson(left[key] ?? null) !== researchJson(right[key] ?? null))
    .map(key => ({ key, before: left[key] ?? null, after: right[key] ?? null }));
  const identity = metric => [metric.key, metric.unit, metric.scope, metric.aggregation, metric.origin || 'team'].join('\u001f');
  const a = new Map((base.data.metrics || []).map(metric => [identity(metric), metric])),
    b = new Map((candidate.data.metrics || []).map(metric => [identity(metric), metric]));
  const metrics = [...new Set([...a.keys(), ...b.keys()])].map(key => {
    const first = a.get(key),
      second = b.get(key),
      model = first || second;
    const measured = first?.status === 'measured' && second?.status === 'measured';
    const sameSample = first?.n === second?.n;
    const finiteDelta = measured && Number.isFinite(second.value - first.value);
    const comparable =
      !reasons.length && measured && finiteDelta && sameSample && (model.origin || 'team') === 'team' && (!resource.test(model.key) || hardwareEqual);
    return {
      key: model.key,
      unit: model.unit,
      scope: model.scope,
      origin: model.origin || 'team',
      before: first || null,
      after: second || null,
      delta: comparable ? second.value - first.value : null,
      comparable,
      reason: reasons.length
        ? 'conditions'
        : !measured
          ? 'missing'
          : !sameSample
            ? 'sample'
            : model.origin === 'author'
              ? 'author'
              : resource.test(model.key) && !hardwareEqual
                ? 'hardware'
                : null,
    };
  });
  return { baseId: base.id, candidateId: candidate.id, compatible: !reasons.length, reasons, hardwareEqual, configDiff, metrics };
}
