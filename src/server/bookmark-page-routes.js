import { Router } from 'express';
import { requireRole } from './auth.js';
import { fetchPublicPage, pageMetadata, pageError } from './web-page-fetch.js';

export const bookmarkPageRouter = Router();
const requests = new Map();
bookmarkPageRouter.use((request, response, next) => {
  const key = request.user.id;
  const now = Date.now();
  const row = requests.get(key);
  const current = row && now - row.at < 60000 ? row : { at: now, count: 0 };
  requests.set(key, current);
  if (requests.size > 2000) requests.delete(requests.keys().next().value);
  if (++current.count > 30) return response.status(429).set('Retry-After', '60').json({ code: 'PAGE_RATE_LIMIT' });
  next();
});
bookmarkPageRouter.post('/metadata', requireRole('admin', 'editor'), async (request, response, next) => {
  try {
    if (typeof request.body?.url !== 'string' || request.body.url.length > 4096) throw pageError('PAGE_INVALID_URL');
    const page = await fetchPublicPage(request.body.url);
    response.json(pageMetadata(page.html, page.url));
  } catch (error) {
    next(error.statusCode ? error : pageError());
  }
});
