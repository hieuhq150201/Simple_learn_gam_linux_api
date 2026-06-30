import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  app.use(helmet());
  app.use(cookieParser());

  app.enableCors({
    origin: process.env['FRONTEND_URL'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,       // strip unknown fields
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // HttpExceptionFilter registered via APP_FILTER in AppModule

  // Swagger chỉ bật ở dev
  if (process.env['NODE_ENV'] !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Hacker Path API')
      .setDescription('Auth & Progress sync API')
      .setVersion('1.0')
      .addCookieAuth('access_token')
      .build();
    const doc = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, doc);
  }

  const port = process.env['PORT'] ?? 3001;
  await app.listen(port);
  console.log(`🚀 API running on http://localhost:${port}`);
  if (process.env['NODE_ENV'] !== 'production') {
    console.log(`📖 Swagger: http://localhost:${port}/api`);
  }
}

bootstrap();
