export function safeProviderError(error) {
  const code = String(error?.code || error?.name || 'PROVIDER_ERROR');
  return {
    code: /^[\w-]{1,60}$/u.test(code) ? code : 'PROVIDER_ERROR',
    status: Number(error?.statusCode || error?.response?.status || error?.status) || null,
  };
}

export function reportProviderError(context, error) {
  console.error(context, safeProviderError(error));
}

export function configureProviderTimeout(client) {
  if (client?.transporter?.defaults) Object.assign(client.transporter.defaults, { timeout: 15000, retry: false });
  return client;
}
