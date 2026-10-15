import { app } from '../src/server/app.js';

function restoreApiPath(request) {
  const path = request.query?.__smena_path;
  if (!path) return;
  const query = new URLSearchParams(request.query);
  query.delete('__smena_path');
  const suffix = query.toString();
  request.url = `/api/${path}${suffix ? `?${suffix}` : ''}`;
}

export default function handler(request, response) {
  restoreApiPath(request);
  return app(request, response);
}
