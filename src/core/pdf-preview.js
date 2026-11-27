import { AnnotationMode, GlobalWorkerOptions, PDFWorker, getDocument } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;
const fonts = import.meta.glob('/node_modules/pdfjs-dist/standard_fonts/*.{pfb,ttf}', { eager: true, query: '?url&no-inline', import: 'default' });
const assetMap = values => new Map(Object.entries(values).map(([path, url]) => [path.split('/').at(-1), url]));
const fontAssets = assetMap(fonts);

export function startPdfWorker(signal) {
  signal.throwIfAborted();
  const worker = new PDFWorker();
  // getDocument observes this same promise under the page-render timeout.
  // Initialization may already have failed before the download finishes.
  void worker.promise.catch(() => {});
  return worker;
}

async function openPdf(blob, signal, worker) {
  signal.throwIfAborted();
  // Only bundled font/CMap resources can be fetched. Document URLs, links,
  // JavaScript actions, XFA and interactive annotations are never mounted.
  class LocalBinaryDataFactory {
    async fetch({ kind, filename }) {
      const resources = kind === 'standardFontDataUrl' ? fontAssets : kind === 'cMapUrl' ? (await import('./pdf-cmap-assets.js')).pdfCMaps : null;
      const url = resources?.get(filename);
      if (!url) throw new Error('Unsupported PDF resource.');
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error('PDF resource is unavailable.');
      return new Uint8Array(await response.arrayBuffer());
    }
  }
  const data = new Uint8Array(await blob.arrayBuffer());
  signal.throwIfAborted();
  return {
    loading: getDocument({
      data,
      worker,
      BinaryDataFactory: LocalBinaryDataFactory,
      useWorkerFetch: false,
      useWasm: false,
      disableFontFace: true,
      useSystemFonts: true,
      enableXfa: false,
      stopAtErrors: true,
      maxImageSize: 8_000_000,
      canvasMaxAreaInBytes: 16_000_000,
      isOffscreenCanvasSupported: false,
      isImageDecoderSupported: false,
    }),
  };
}

export async function readPdfPageCount(blob, signal) {
  const { loading } = await openPdf(blob, signal);
  const cancel = () => void loading.destroy().catch(() => {});
  signal.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 15000);
  try {
    signal.throwIfAborted();
    return (await loading.promise).numPages;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
    await loading.destroy().catch(() => {});
  }
}

export async function renderPdfPage(blob, pageNumber, signal, { thumbnail = false, worker, onPage, onText } = {}) {
  if (onPage) performance.mark('smena:pdf:document-start');
  const { loading } = await openPdf(blob, signal, worker);
  let rendering;
  let canvas;
  let pageShown = false;
  const cancel = () => {
    rendering?.cancel();
    void loading.destroy().catch(() => {});
  };
  signal.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 15000);
  try {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const pdf = await loading.promise;
    if (onPage) performance.mark('smena:pdf:document-ready');
    const page = Math.max(1, Math.min(pdf.numPages, Math.floor(pageNumber) || 1));
    const source = await pdf.getPage(page);
    const original = source.getViewport({ scale: 1 });
    if (!Number.isFinite(original.width) || !Number.isFinite(original.height) || original.width <= 0 || original.height <= 0)
      throw new Error('Invalid page size.');
    const viewport = source.getViewport({ scale: Math.min(1.5, (thumbnail ? 640 : 1280) / original.width, (thumbnail ? 800 : 1600) / original.height) });
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    rendering = source.render({ canvas, viewport, annotationMode: AnnotationMode.DISABLE, background: '#ffffff' });
    await rendering.promise;
    signal.throwIfAborted();
    if (onPage) {
      performance.mark('smena:pdf:canvas-ready');
      pageShown = onPage({ canvas, page, pages: pdf.numPages });
      if (pageShown) {
        // Text extraction should never delay or replace a visible page.
        try {
          const content = await source.getTextContent();
          if (!signal.aborted)
            onText(
              content.items
                .map(item => item.str || '')
                .join(' ')
                .slice(0, 60000),
            );
        } catch {
          /* The rendered page remains readable when text extraction fails. */
        }
      }
      return;
    }
    const image = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!image || signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const content = thumbnail ? { items: [] } : await source.getTextContent();
    const text = content.items
      .map(item => item.str || '')
      .join(' ')
      .slice(0, 60000);
    return { blob: image, page, pages: pdf.numPages, text };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
    if (canvas && !pageShown) canvas.width = canvas.height = 0;
    await loading.destroy().catch(() => {});
  }
}
