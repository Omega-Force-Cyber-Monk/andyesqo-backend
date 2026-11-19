import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { buildOpenApiDocument } from './common/swagger/swagger.js';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { ResponseInterceptor } from './common/interceptors/response.interceptor.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  const origins = config.get<string>('CORS_ORIGINS', '*');
  app.enableCors({
    origin: origins === '*' ? true : origins.split(',').map((o) => o.trim()),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new AllExceptionsFilter());

  const trustProxy = config.get<string>('TRUST_PROXY');
  if (trustProxy)
    app.set(
      'trust proxy',
      /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy,
    );

  // Uploaded files are private: they are served only by UploadsController.
  mkdirSync(resolve(config.get<string>('UPLOAD_DIR', 'uploads')), {
    recursive: true,
  });

  SwaggerModule.setup('docs', app, () => buildOpenApiDocument(app), {
    swaggerOptions: { persistAuthorization: true },
  });

  app.enableShutdownHooks();
  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  console.log(
    `API ready on http://localhost:${port}/api/v1  ·  Swagger: http://localhost:${port}/docs`,
  );
}
await bootstrap();
