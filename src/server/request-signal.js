export function requestSignal(request, response) {
  const controller = new AbortController();
  const cleanup = () => {
    request.removeListener('aborted', abort);
    response.removeListener('close', closed);
    response.removeListener('finish', cleanup);
  };
  const abort = () => {
    controller.abort(new DOMException('The client stopped this request.', 'AbortError'));
    cleanup();
  };
  const closed = () => {
    if (!response.writableEnded) abort();
    else cleanup();
  };
  request.once('aborted', abort);
  response.once('close', closed);
  response.once('finish', cleanup);
  if (request.aborted) abort();
  return controller.signal;
}
