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
        // Development origins
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:4200',
        'http://localhost:5173',
        // Current frontend deployments
        'https://mfon-obong-enterprises.pipeops.net',
        'https://frontend-tawny-pi-78.vercel.app',
        'https://frontend-mfon.vercel.app',
        // Production domains
        'https://mfonobongenterprise.com',
        'https://www.mfonobongenterprise.com',
        // Render deployment (frontend) - allow this origin as well
        'https://mfon-obong-enterprise.onrender.com',
        'https://mfon-obong-enterprises.onrender.com',
      ];

      // Allow all Vercel preview and production deployments
      const vercelPattern = /^https:\/\/.*\.vercel\.app$/;

      if (!origin || allowedOrigins.includes(origin) || vercelPattern.test(origin)) {
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