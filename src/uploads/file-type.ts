/** Content types accepted for uploads, detected from the file's bytes. */
export type DetectedType = { mime: string; ext: string };

const startsWith = (buf: Buffer, bytes: number[], offset = 0) =>
  buf.length >= offset + bytes.length &&
  bytes.every((b, i) => buf[offset + i] === b);

const HEIF_BRANDS = new Set([
  'heic',
  'heix',
  'hevc',
  'hevx',
  'mif1',
  'msf1',
  'heif',
]);

/**
 * Identifies JPEG, PNG, WebP, HEIC/HEIF and PDF by magic bytes. The client's
 * declared MIME type and filename are never trusted, so a script or HTML file
 * cannot be stored as an "image".
 */
export function detectFileType(buf: Buffer): DetectedType | null {
  if (startsWith(buf, [0xff, 0xd8, 0xff]))
    return { mime: 'image/jpeg', ext: 'jpg' };
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return { mime: 'image/png', ext: 'png' };
  if (
    startsWith(buf, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)
  )
    return { mime: 'image/webp', ext: 'webp' };
  if (startsWith(buf, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = buf.subarray(8, 12).toString('latin1');
    if (HEIF_BRANDS.has(brand))
      return brand.startsWith('hei') || brand.startsWith('hev')
        ? { mime: 'image/heic', ext: 'heic' }
        : { mime: 'image/heif', ext: 'heif' };
  }
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d]))
    return { mime: 'application/pdf', ext: 'pdf' };
  return null;
}
