import { registerDecorator, type ValidationOptions } from 'class-validator';

/** Path of a stored upload: `/api/v1/uploads/<uuid>` (optionally absolute). */
export const UPLOAD_URL =
  /^(https?:\/\/[^/\s]+)?\/api\/v1\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Accepts only URLs returned by `POST /uploads` (no external or script links). */
export function IsUploadUrl(options?: ValidationOptions) {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'isUploadUrl',
      target: target.constructor,
      propertyName,
      options: {
        message: `${propertyName} must contain URLs returned by POST /uploads`,
        ...options,
      },
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && UPLOAD_URL.test(value),
      },
    });
}

export const uploadIdFromUrl = (url: string) =>
  UPLOAD_URL.test(url) ? url.slice(-36).toLowerCase() : null;
