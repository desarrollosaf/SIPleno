import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const basePath = (process.env.BASE_PATH ?? '').trim().replace(/^\/+|\/+$/g, '');
  const apiPrefix = basePath ? `${basePath}/api` : 'api';
  const staticPrefix = basePath ? `/${basePath}` : '/';

  app.setGlobalPrefix(apiPrefix);
  app.enableCors({
    origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const webDist = [
    resolve(process.cwd(), '../web/dist/web/browser'),
    resolve(process.cwd(), 'apps/web/dist/web/browser'),
  ].find((candidate) => existsSync(join(candidate, 'index.html')));

  if (webDist) {
    app.useStaticAssets(webDist, { prefix: staticPrefix });
    app.use((request: Request, response: Response, next: NextFunction) => {
      if (
        request.method === 'GET' &&
        !request.path.startsWith(`/${apiPrefix}`) &&
        request.accepts('html')
      ) {
        response.sendFile(join(webDist, 'index.html'));
        return;
      }
      next();
    });
  }

  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1');
}
await bootstrap();
