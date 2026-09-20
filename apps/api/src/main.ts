import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { Request, Response, NextFunction } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import * as Sentry from '@sentry/node';
import helmet from 'helmet';

async function bootstrap() {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: 1.0,
    });
  }

  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.setGlobalPrefix('api');
  app.use((request: Request, response: Response, next: NextFunction) => {
    const requestId = request.header('x-request-id') || randomUUID();
    response.setHeader('x-request-id', requestId);
    next();
  });
  const rawOrigin = config.get<string>('WEB_ORIGIN', 'http://localhost:3000');
  const allowedOrigins = rawOrigin.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.some((allowed) => origin === allowed || allowed === '*')) {
        return callback(null, true);
      }
      if (/\.vercel\.app$/.test(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  const swaggerConfig = new DocumentBuilder()
    .setTitle('WMS API')
    .setDescription('API operacional para gestión de bodegas e inventario')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);
  await app.listen(process.env.PORT ?? 3001);
}

void bootstrap();
