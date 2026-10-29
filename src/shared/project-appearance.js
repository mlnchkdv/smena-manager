export function normalizeProjectColor(value) {
  if (typeof value !== 'string') return null;
  const hex = value.trim();
  if (/^#[\da-f]{6}$/i.test(hex)) return hex.toUpperCase();
  if (/^#[\da-f]{3}$/i.test(hex))
    return (
      '#' +
      [...hex.slice(1)]
        .map(char => char + char)
        .join('')
        .toUpperCase()
    );
  return null;
}

export const PROJECT_IMAGE_LIMIT = 32768;
export function projectImageData(value) {
  if (typeof value !== 'string' || value.length > PROJECT_IMAGE_LIMIT) return '';
  const image = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!image || image[2].length % 4) return '';
  try {
    const bytes = atob(image[2].slice(0, 32));
    const valid =
      image[1] === 'png'
        ? bytes.startsWith('\x89PNG\r\n\x1a\n')
        : image[1] === 'jpeg'
          ? bytes.startsWith('\xff\xd8\xff')
          : bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
    return valid ? value : '';
  } catch {
    return '';
  }
}
