import { esc } from '../core/utils.js';
import { IMAGE_CROP_SCALE } from '../shared/whiteboard-image.js';

export const rotatedImageSize = ({ width, height }, turns) => (turns % 2 ? { width: height, height: width } : { width, height });

export function whiteboardImageMarkup(url, name, size, image, className) {
  const { width, height } = rotatedImageSize(size, image.turns);
  const crop = image.crop;
  const left = (crop.x * width) / IMAGE_CROP_SCALE;
  const top = (crop.y * height) / IMAGE_CROP_SCALE;
  const cropWidth = (crop.width * width) / IMAGE_CROP_SCALE;
  const cropHeight = (crop.height * height) / IMAGE_CROP_SCALE;
  const viewBox = `${left} ${top} ${cropWidth} ${cropHeight}`;
  const transform = [
    '',
    `translate(${size.height} 0) rotate(90)`,
    `translate(${size.width} ${size.height}) rotate(180)`,
    `translate(0 ${size.width}) rotate(270)`,
  ][image.turns];
  // The inner viewport also clips the excluded pixels in letterboxed previews.
  return `<svg class="${className}" role="img" aria-label="${esc(name)}" viewBox="${viewBox}"><svg x="${left}" y="${top}" width="${cropWidth}" height="${cropHeight}" viewBox="${viewBox}" overflow="hidden"><image href="${esc(url)}" width="${size.width}" height="${size.height}" transform="${transform}"/></svg></svg>`;
}
