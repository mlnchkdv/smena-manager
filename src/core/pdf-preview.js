import { AnnotationMode, GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;
const fonts = import.meta.glob('/node_modules/pdfjs-dist/standard_fonts/*.{pfb,ttf}', { eager: true, query: '?url&no-inline', import: 'default' });
const assetMap = values => new Map(Object.entries(values).map(([path, url]) => [path.split('/').at(-1), url]));
const fontAssets = assetMap(fonts);

export async function renderPdfPage(blob, pageNumber, signal) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
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
  const loading = getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
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
  });
  let rendering;
  let canvas;
  const cancel = () => {
    rendering?.cancel();
    void loading.destroy().catch(() => {});
  };
  signal.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 15000);
  try {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const pdf = await loading.promise;
    const page = Math.max(1, Math.min(pdf.numPages, Math.floor(pageNumber) || 1));
    const source = await pdf.getPage(page);
    const original = source.getViewport({ scale: 1 });
    if (!Number.isFinite(original.width) || !Number.isFinite(original.height) || original.width <= 0 || original.height <= 0)
      throw new Error('Invalid page size.');
    const viewport = source.getViewport({ scale: Math.min(1.5, 1280 / original.width, 1600 / original.height) });
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    rendering = source.render({ canvas, viewport, annotationMode: AnnotationMode.DISABLE, background: '#ffffff' });
    await rendering.promise;
    const image = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!image || signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return { blob: image, page, pages: pdf.numPages };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
    if (canvas) canvas.width = canvas.height = 0;
    await loading.destroy().catch(() => {});
  }
}
