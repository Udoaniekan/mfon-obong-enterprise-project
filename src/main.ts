import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';


async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Basic security headers
  app.use(helmet());

  // Enable cookie parser middleware
  app.use(cookieParser());

  // Enable CORS with proper configuration
  app.enableCors({
    origin: [
      // Development origins
      'http://localhost:3000',
      'http://localhost:3001', 
      'http://localhost:4200',
      'http://localhost:5173',
      
      // Current frontend deployments
      'https://frontend-six-liard-24.vercel.app',
      'https://mfon-obong-enterprises.pipeops.net',
      
      // Production domains
      'https://mfonobongenterprise.com',
      'https://www.mfonobongenterprise.com',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
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

  const port = configService.get('PORT');
  await app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });

  Logger.log(`Application is running on: http://localhost:${port}/api`, 'Bootstrap');
}
bootstrap();
