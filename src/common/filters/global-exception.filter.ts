import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = exception;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message =
        typeof res === 'string'
          ? res
          : (res as any).message || message;
      error = typeof res === 'string' ? { message: res } : res;
    } else if (isPrismaError(exception)) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        message = 'Duplicate entry';
        const target = exception.meta?.target;
        error = {
          message,
          field: Array.isArray(target) ? target[0] : target,
        };
      }
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      message,
      error,
    });
  }
}

function isPrismaError(
  exception: unknown,
): exception is { code: string; meta?: { target?: string | string[] } } {
  return (
    exception !== null &&
    typeof exception === 'object' &&
    'code' in exception &&
    'clientVersion' in exception
  );
}
