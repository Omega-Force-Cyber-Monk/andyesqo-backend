import { applyDecorators, INestApplication, Type } from '@nestjs/common';
import {
  ApiExtension,
  ApiExtraModels,
  ApiProduces,
  ApiResponse,
  DocumentBuilder,
  getSchemaPath,
  OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';
import { ErrorResponse, PageMeta } from './common.dto.js';

type PathItem = OpenAPIObject['paths'][string];
type OperationObject = NonNullable<PathItem['get']>;
type ParameterObject = Extract<
  NonNullable<OperationObject['parameters']>[number],
  { in: string }
>;
type SchemaObject = Exclude<
  NonNullable<ParameterObject['schema']>,
  { $ref: string }
>;
type ReferenceObject = { $ref: string };

type Model = Type<unknown> | [Type<unknown>] | SchemaObject;

const classesOf = (model: Model): Type<unknown>[] =>
  typeof model === 'function'
    ? [model]
    : Array.isArray(model)
      ? [model[0]]
      : [];

function dataSchema(model: Model): SchemaObject | ReferenceObject {
  if (typeof model === 'function') return { $ref: getSchemaPath(model) };
  if (Array.isArray(model))
    return { type: 'array', items: { $ref: getSchemaPath(model[0]) } };
  return model;
}

/** Success response wrapped in the `{ success, data }` envelope. */
export const ApiData = (
  model: Model,
  options: { status?: 200 | 201; description?: string } = {},
) =>
  applyDecorators(
    ApiExtraModels(...classesOf(model)),
    ApiResponse({
      status: options.status ?? 200,
      description: options.description ?? 'Success',
      schema: {
        type: 'object',
        required: ['success', 'data'],
        properties: {
          success: { type: 'boolean', example: true },
          data: dataSchema(model),
        },
      },
    }),
  );

/** Paginated list: `{ success, data: [...], meta: { page, limit, total, totalPages } }`. */
export const ApiPage = (
  model: Type<unknown>,
  description = 'One page of results',
) =>
  applyDecorators(
    ApiExtraModels(model, PageMeta),
    ApiResponse({
      status: 200,
      description,
      schema: {
        type: 'object',
        required: ['success', 'data', 'meta'],
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'array', items: { $ref: getSchemaPath(model) } },
          meta: { $ref: getSchemaPath(PageMeta) },
        },
      },
    }),
  );

/** CSV export (not wrapped in the envelope). */
export const ApiCsv = (description = 'CSV file') =>
  applyDecorators(
    ApiProduces('text/csv'),
    ApiResponse({
      status: 200,
      description,
      content: {
        'text/csv': { schema: { type: 'string', example: 'name,email\n' } },
      },
    }),
  );

const FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
];

/** Binary file download (not wrapped in the envelope). */
export const ApiFile = (description = 'File contents') =>
  applyDecorators(
    ApiProduces(...FILE_TYPES),
    ApiResponse({
      status: 200,
      description,
      content: Object.fromEntries(
        FILE_TYPES.map((t) => [
          t,
          { schema: { type: 'string', format: 'binary' } },
        ]),
      ),
    }),
  );

/** Marks a route as callable without a bearer token in the OpenAPI document. */
export const ApiPublic = () => ApiExtension('x-public', true);

const DESCRIPTION = `
REST API for the Andyesqo fleet, roster and delivery operations platform: driver and assistant apps, roster, fleet, supervisor and business admin dashboards, and the platform admin.

All paths start with \`/api/v1\`.

## Authentication
1. \`POST /auth/login\` with an email or Employee ID and password.
2. Without two-factor authentication the response contains \`accessToken\` (JWT, 15 minutes) and \`refreshToken\` (7 days, or 30 with \`rememberMe\`).
3. Send \`Authorization: Bearer <accessToken>\` on every request (use **Authorize** above).
4. Refresh with \`POST /auth/refresh\`; refresh tokens rotate on use.

## Two-factor authentication (authenticator app, TOTP)
When the business requires 2FA, or the user has enrolled an authenticator, login returns \`{ mfaRequired: true, enrollmentRequired, challenge }\` and no tokens. The challenge is valid for five minutes.
- **First enrollment:** \`POST /auth/mfa/enroll\` with the challenge returns a \`secret\` and \`otpauth\` URI (show it as a QR code). Then \`POST /auth/mfa/verify\` with \`{ challenge, code }\`.
- **Later logins:** \`POST /auth/mfa/verify\` with the challenge and a current \`code\`, or a one-time \`recoveryCode\`.
- **Voluntary enrollment:** \`POST /auth/mfa/setup\` with the password, then verify.
- Signed-in 2FA sessions can create recovery codes and replace the authenticator. Administrators can reset a lost authenticator with \`POST /users/{id}/mfa/reset\`.
Password-only tokens are rejected while 2FA applies.

## Responses
Success: \`{ "success": true, "data": ..., "meta"?: { page, limit, total, totalPages } }\`. CSV and file downloads are returned raw.
Errors: \`{ "success": false, "statusCode", "error", "message", "path", "timestamp" }\`.

## Access control
Each route is limited to roles and governed by the business's View/Edit permission matrix, time-limited user overrides and depot scope. Super admins pass \`businessId\` to act on a tenant. Authentication endpoints are rate limited per client IP (HTTP 429).
`.trim();

const err = (description: string) => ({
  description,
  content: {
    'application/json': { schema: { $ref: getSchemaPath(ErrorResponse) } },
  },
});

/**
 * Builds the OpenAPI document and applies cross-cutting documentation:
 * bearer security (except public routes), standard error responses and the
 * optional super-admin `businessId` query parameter.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Andyesqo API')
    .setDescription(DESCRIPTION)
    .setVersion('1.0.0')
    .addServer('/', 'This server')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .build();
  const doc = SwaggerModule.createDocument(app, config, {
    extraModels: [ErrorResponse, PageMeta],
    operationIdFactory: (controller, method) =>
      `${controller.replace(/Controller$/, '')}_${method}`,
  });
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      const op = item[method] as
        (OperationObject & { 'x-public'?: boolean }) | undefined;
      if (!op) continue;
      const isPublic = op['x-public'] === true;
      delete op['x-public'];
      op.security = isPublic ? [] : [{ bearer: [] }];
      op.responses ??= {};
      const params = (op.parameters ?? []) as ParameterObject[];
      for (const p of params) {
        if (p.in === 'query' && p.name === 'businessId') {
          p.required = false;
          p.schema = { type: 'string', format: 'uuid' };
          p.description ??=
            'Super admin only: the business to act on. Ignored for business users.';
        }
      }
      const r = op.responses;
      r['400'] ??= err(
        'Validation failed or the request is not allowed in the current state',
      );
      if (
        !isPublic ||
        [
          '/api/v1/auth/login',
          '/api/v1/auth/mfa/enroll',
          '/api/v1/auth/mfa/verify',
          '/api/v1/auth/refresh',
        ].includes(path)
      ) {
        r['401'] ??= err(
          'Missing, expired or invalid access token, or 2FA required',
        );
        r['403'] ??= err(
          'Role, permission matrix or depot scope does not allow this',
        );
      }
      if (path.includes('{'))
        r['404'] ??= err('Not found or outside your tenant/depot scope');
      if (path.startsWith('/api/v1/auth/'))
        r['429'] ??= err('Too many requests from this client');
      if (
        path === '/health' ||
        path === '/api/v1/locations/deliveries/{deliveryId}/route'
      )
        r['503'] ??= err('Database or routing provider is unavailable');
    }
  }
  return doc;
}
