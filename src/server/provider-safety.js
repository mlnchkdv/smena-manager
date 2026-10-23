export function safeProviderError(error) {
  const code = String(error?.code || error?.name || 'PROVIDER_ERROR');
  return {
    code: /^[\w-]{1,60}$/u.test(code) ? code : 'PROVIDER_ERROR',
    status: Number(error?.statusCode || error?.response?.status || error?.status) || null,
  };
}

const counters = { since: new Date().toISOString(), failures: 0, timeouts: 0, quota: 0 };
export const providerFailureCounters = () => ({ ...counters, scope: 'this-worker', coverage: 'reported-provider-errors' });
export function recordProviderFailure(error) {
  const safe = safeProviderError(error);
  counters.failures += 1;
  if (['ETIMEDOUT', 'ECONNABORTED', 'TimeoutError', 'AbortError'].includes(safe.code) || safe.status === 504) counters.timeouts += 1;
  const reasons = error?.response?.data?.error?.errors?.map(item => item.reason) || [];
  if (
    safe.status === 429 ||
    reasons.some(reason => ['rateLimitExceeded', 'userRateLimitExceeded', 'storageQuotaExceeded', 'dailyLimitExceeded'].includes(reason))
  )
    counters.quota += 1;
}
export function reportProviderError(context, error) {
  recordProviderFailure(error);
  console.error(context, safeProviderError(error));
}

export function configureProviderTimeout(client) {
  if (client?.transporter?.defaults) Object.assign(client.transporter.defaults, { timeout: 15000, retry: false });
  return client;
}
