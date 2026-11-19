export const IMAGE_CROP_SCALE = 10000;
const minimum = 100;
const fullCrop = Object.freeze({ x: 0, y: 0, width: IMAGE_CROP_SCALE, height: IMAGE_CROP_SCALE });
export const ORIGINAL_WHITEBOARD_IMAGE = Object.freeze({ turns: 0, crop: fullCrop });

const exact = (value, keys) =>
  value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

export function validWhiteboardImage(image) {
  if (!exact(image, ['turns', 'crop']) || ![0, 1, 2, 3].includes(image.turns) || !exact(image.crop, ['x', 'y', 'width', 'height'])) return false;
  const { x, y, width, height } = image.crop;
  return (
    [x, y, width, height].every(Number.isSafeInteger) &&
    x >= 0 &&
    y >= 0 &&
    width >= minimum &&
    height >= minimum &&
    x + width <= IMAGE_CROP_SCALE &&
    y + height <= IMAGE_CROP_SCALE
  );
}

export function sameWhiteboardImage(a, b) {
  return a.turns === b.turns && a.crop.x === b.crop.x && a.crop.y === b.crop.y && a.crop.width === b.crop.width && a.crop.height === b.crop.height;
}

export function rotateWhiteboardImage(image, direction) {
  const { x, y, width, height } = image.crop;
  return {
    turns: (image.turns + direction + 4) % 4,
    crop: { x: direction > 0 ? IMAGE_CROP_SCALE - y - height : y, y: direction > 0 ? x : IMAGE_CROP_SCALE - x - width, width: height, height: width },
  };
}

const clamp = (value, low, high) => Math.min(high, Math.max(low, Math.round(value)));
export function adjustWhiteboardImageCrop(crop, handle, dx, dy) {
  const { x, y, width, height } = crop;
  if (handle === 'move') return { x: clamp(x + dx, 0, IMAGE_CROP_SCALE - width), y: clamp(y + dy, 0, IMAGE_CROP_SCALE - height), width, height };
  const right = x + width;
  const bottom = y + height;
  const leftEdge = handle.endsWith('w');
  const topEdge = handle.startsWith('n');
  const left = leftEdge ? clamp(x + dx, 0, right - minimum) : x;
  const top = topEdge ? clamp(y + dy, 0, bottom - minimum) : y;
  return {
    x: left,
    y: top,
    width: (leftEdge ? right : clamp(right + dx, x + minimum, IMAGE_CROP_SCALE)) - left,
    height: (topEdge ? bottom : clamp(bottom + dy, y + minimum, IMAGE_CROP_SCALE)) - top,
  };
}
