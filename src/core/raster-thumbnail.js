import { imageSize } from 'image-size';

// The CDN may ignore resize parameters outside China. Bound embedded raster
// images here as well. Oversized decoded images must not exhaust Worker memory.
export function createRasterThumbnail({ PhotonImage, resize, SamplingFilter }) {
  return (bytes, mime) => {
    if (bytes.length < 32768 || mime === 'image/svg+xml') return { bytes, mime };
    let input, output;
    try {
      const { width, height, type } = imageSize(bytes);
      if (!['jpg', 'png', 'webp'].includes(type) || !width || !height
          || width * height > 8_000_000) return { bytes, mime };
      input = PhotonImage.new_from_byteslice(bytes);
      const scale = Math.min(1, 160 / Math.max(width, height));
      output = resize(input, Math.max(1, Math.round(width * scale)),
        Math.max(1, Math.round(height * scale)), SamplingFilter.Triangle);
      const thumbnail = output.get_bytes_webp();
      return thumbnail.length < bytes.length ? { bytes: thumbnail, mime: 'image/webp' } : { bytes, mime };
    } catch {
      return { bytes, mime };
    } finally {
      output?.free();
      input?.free();
    }
  };
}
