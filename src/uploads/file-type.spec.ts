import { describe, expect, it } from 'vitest';
import { detectFileType } from './file-type.js';
import { UPLOAD_URL, uploadIdFromUrl } from './upload-url.validator.js';

const hex = (s: string) => Buffer.from(s.replace(/\s/g, ''), 'hex');

describe('upload content detection', () => {
  it('recognises allowed formats by their bytes', () => {
    expect(detectFileType(hex('ffd8ffe0 00104a46'))?.mime).toBe('image/jpeg');
    expect(detectFileType(hex('89504e47 0d0a1a0a 0000'))?.mime).toBe(
      'image/png',
    );
    expect(
      detectFileType(
        Buffer.concat([
          Buffer.from('RIFF'),
          hex('00000000'),
          Buffer.from('WEBPVP8 '),
        ]),
      )?.mime,
    ).toBe('image/webp');
    expect(
      detectFileType(
        Buffer.concat([
          hex('00000018'),
          Buffer.from('ftypheic'),
          hex('00000000'),
        ]),
      )?.mime,
    ).toBe('image/heic');
    expect(detectFileType(Buffer.from('%PDF-1.7\n'))?.mime).toBe(
      'application/pdf',
    );
  });

  it('rejects scripts and markup whatever they claim to be', () => {
    expect(
      detectFileType(Buffer.from('<html><script>alert(1)</script>')),
    ).toBeNull();
    expect(detectFileType(Buffer.from('<svg onload="x()"/>'))).toBeNull();
    expect(detectFileType(Buffer.alloc(0))).toBeNull();
  });

  it('accepts only stored-upload URLs in photo and document fields', () => {
    const id = '0b6f3c1e-8a3e-4d4c-9a51-0f4f8f0b8c2d';
    expect(UPLOAD_URL.test(`/api/v1/uploads/${id}`)).toBe(true);
    expect(
      UPLOAD_URL.test(`https://api.example.com/api/v1/uploads/${id}`),
    ).toBe(true);
    expect(UPLOAD_URL.test('javascript:alert(1)')).toBe(false);
    expect(UPLOAD_URL.test(`https://evil.example/x.png`)).toBe(false);
    expect(UPLOAD_URL.test(`/uploads/${id}.png`)).toBe(false);
    expect(uploadIdFromUrl(`/api/v1/uploads/${id.toUpperCase()}`)).toBe(id);
  });
});
