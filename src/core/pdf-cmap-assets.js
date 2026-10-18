const files = import.meta.glob('/node_modules/pdfjs-dist/cmaps/*.bcmap', { eager: true, query: '?url&no-inline', import: 'default' });
export const pdfCMaps = new Map(Object.entries(files).map(([path, url]) => [path.split('/').at(-1), url]));
