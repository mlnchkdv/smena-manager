import { inWorkspace } from './workspace-context.js';

// Each workspace gets its own Vercel invocation/time budget. Never forward the
// cron credential to a host supplied by a request or follow HTTP redirects.
export async function dispatchWorkspaceAutomation(id, { env = process.env, fetcher = fetch } = {}) {
  const host = env.VERCEL_ENV === 'production' ? env.VERCEL_PROJECT_PRODUCTION_URL : env.VERCEL_URL;
  if (!/^[a-z\d][a-z\d.-]*\.vercel\.app$/iu.test(host || '')) throw new Error('Workspace automation origin is unavailable.');
  const response = await fetcher(`https://${host}/api/cron/reminders?workspace=${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${env.CRON_SECRET?.trim() || ''}` },
    redirect: 'error',
    signal: AbortSignal.timeout(50000),
  });
  if (!response.ok) throw new Error('Workspace automation request failed.');
  const result = await response.json();
  if (!['ok', 'degraded', 'failed'].includes(result.status)) throw new Error('Workspace automation did not report a result.');
  return result;
}

export async function runWorkspaceAutomationBatch(ids, { run, dispatch, failed = () => {} }) {
  return Promise.all(
    ids.map(async id => {
      try {
        return { ...(await (id !== 'default' && dispatch ? dispatch(id) : inWorkspace(id, run))), id };
      } catch (error) {
        failed(error);
        return { id, status: 'failed' };
      }
    }),
  );
}
