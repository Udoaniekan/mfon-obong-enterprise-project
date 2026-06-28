import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import * as cookieParser from 'cookie-parser';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable cookie parser middleware
  app.use(cookieParser());

  // Enable CORS with proper configuration
  app.enableCors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        // Local development
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:4200',
        'http://localhost:5173',
        // Production frontend (Cloudflare Pages)
        'https://mfonobongenterprise.com',
        'https://www.mfonobongenterprise.com',
        // Staging frontend (Cloudflare Pages)
        'https://staging.mfonobongenterprise.com',
      ];

      // Allow Cloudflare Pages preview deployment URLs (*.pages.dev)
      const cloudflarePattern = /^https:\/\/.*\.pages\.dev$/;

      if (!origin || allowedOrigins.includes(origin) || cloudflarePattern.test(origin)) {
        callback(null, true);
      } else {
        Logger.warn(`CORS blocked origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // Allow Set-Cookie so browsers can send/receive cookies for authenticated assets
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Set-Cookie',
    ],
    exposedHeaders: ['Set-Cookie'],
  });

  // Global prefix
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  
  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global filters
  app.useGlobalFilters(new GlobalExceptionFilter());

  const port = process.env.PORT || 3000;
  await app.listen(port);

  Logger.log(`Application is running on: http://localhost:${port}/api`, 'Bootstrap');
}
bootstrap();