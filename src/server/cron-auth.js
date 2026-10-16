import crypto from 'node:crypto';

function equalSecrets(actual, expected) {
  const actualBuffer = Buffer.from(actual || '');
  const expectedBuffer = Buffer.from(expected || '');
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function requireCronSecret(request, response, next) {
  const secret = process.env.CRON_SECRET?.trim();
  const authorization = request.get('authorization') || '';
  if (!secret || !equalSecrets(authorization, `Bearer ${secret}`)) {
    response.status(401).json({ error: 'Unauthorized cron request.', code: 'CRON_UNAUTHORIZED' });
    return;
  }
  next();
}
