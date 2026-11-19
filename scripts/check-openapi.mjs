/**
 * Builds the OpenAPI document from the compiled app (dist/, where the Swagger
 * CLI plugin has added DTO metadata) and fails if any operation is not fully
 * documented. Writes dist/openapi.json. Usage: npm run build && npm run openapi:check
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { ModulesContainer, NestFactory } from '@nestjs/core';
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants.js';

const { AppModule } = await import('../dist/app.module.js');
const { buildOpenApiDocument } =
  await import('../dist/common/swagger/swagger.js');

const app = await NestFactory.create(AppModule, { logger: ['error'] });
app.setGlobalPrefix('api/v1', { exclude: ['health'] });
const doc = buildOpenApiDocument(app);
writeFileSync('dist/openapi.json', JSON.stringify(doc, null, 2));

const problems = [];
const schemas = doc.components?.schemas ?? {};
const resolve = (ref) => schemas[ref.replace('#/components/schemas/', '')];

// Every $ref must point at a defined schema.
const refs =
  JSON.stringify(doc).match(/"#\/components\/schemas\/[^"]+"/g) ?? [];
for (const r of new Set(refs)) {
  if (!resolve(JSON.parse(r))) problems.push(`missing schema ${r}`);
}
// Check nested schemas too: an array item can be empty even when its parent is typed.
function checkSchemas(value, location) {
  if (!value || typeof value !== 'object') return;
  if (
    value.type === 'object' &&
    !value.properties &&
    !value.additionalProperties &&
    !value.allOf &&
    !value.oneOf &&
    !value.anyOf
  )
    problems.push(`${location}: object has no properties`);
  if (value.type === 'array' && !value.items)
    problems.push(`${location}: array has no item schema`);
  for (const [key, child] of Object.entries(value))
    checkSchemas(child, `${location}/${key}`);
}
checkSchemas(schemas, 'schemas');

let operations = 0;
const documented = new Map();
for (const [path, item] of Object.entries(doc.paths)) {
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const op = item[method];
    if (!op) continue;
    operations++;
    documented.set(op.operationId, op);
    const id = `${method.toUpperCase()} ${path}`;
    if (!op.summary?.trim()) problems.push(`${id}: missing summary`);
    if (!op.tags?.length) problems.push(`${id}: missing tag`);
    if (!Array.isArray(op.security))
      problems.push(`${id}: security not declared`);
    const ok = Object.entries(op.responses ?? {}).filter(([c]) => /^2/.test(c));
    if (!ok.length) problems.push(`${id}: no success response`);
    for (const [code, res] of ok) {
      const content = res.content ?? {};
      if (code !== '204' && !Object.values(content).some((c) => c.schema))
        problems.push(`${id}: ${code} response has no schema`);
    }
    for (const p of (path.match(/\{(\w+)\}/g) ?? []).map((x) => x.slice(1, -1)))
      if (!(op.parameters ?? []).some((x) => x.in === 'path' && x.name === p))
        problems.push(`${id}: path parameter ${p} undocumented`);
    if (['post', 'put', 'patch'].includes(method) && op.requestBody) {
      const schema = Object.values(op.requestBody.content ?? {})[0]?.schema;
      const target = schema?.$ref ? resolve(schema.$ref) : schema;
      if (
        !target ||
        (!target.properties && target.type !== 'array' && !target.allOf)
      )
        problems.push(`${id}: request body has no properties`);
    }
  }
}
// Compare documentation to the actual Nest route metadata, including status
// overrides and body decorators, so a plausible but incorrect spec fails CI.
for (const module of app.get(ModulesContainer).values()) {
  for (const { instance, metatype } of module.controllers.values()) {
    if (!instance || !metatype) continue;
    for (const name of Object.getOwnPropertyNames(metatype.prototype)) {
      const handler = instance[name];
      if (typeof handler !== 'function') continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler);
      if (method === undefined) continue;
      const id = `${metatype.name.replace(/Controller$/, '')}_${name}`;
      const op = documented.get(id);
      if (!op) {
        problems.push(`${id}: route missing from OpenAPI`);
        continue;
      }
      const status =
        Reflect.getMetadata(HTTP_CODE_METADATA, handler) ??
        (method === 1 ? 201 : 200);
      if (!op.responses?.[status])
        problems.push(`${id}: actual success status ${status} undocumented`);
      const args =
        Reflect.getMetadata(ROUTE_ARGS_METADATA, metatype, name) ?? {};
      if (
        Object.keys(args).some((key) => key.startsWith('3:')) &&
        !op.requestBody
      )
        problems.push(`${id}: decorated request body undocumented`);
      for (const [key, argument] of Object.entries(args)) {
        if (
          key.startsWith('4:') &&
          argument.data &&
          !(op.parameters ?? []).some(
            (p) => p.in === 'query' && p.name === argument.data,
          )
        )
          problems.push(`${id}: query parameter ${argument.data} undocumented`);
      }
    }
  }
}
await app.close();
if (problems.length) {
  console.error(
    `OpenAPI check failed (${problems.length} problems in ${operations} operations):`,
  );
  for (const p of problems) console.error(' - ' + p);
  process.exit(1);
}
console.log(
  `OpenAPI check passed: ${operations} operations, ${Object.keys(schemas).length} schemas. Wrote dist/openapi.json`,
);
process.exit(0);
