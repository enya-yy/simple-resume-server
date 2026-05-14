import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { ERROR_CODES } from '../contracts/index';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest<Request>();
    const requestId = request.requestId ?? randomUUID();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ERROR_CODES.INTERNAL_SERVER_ERROR;
    let message = '服务器内部错误';
    let errorDetails: unknown;

    if (exception instanceof ThrottlerException) {
      status = HttpStatus.TOO_MANY_REQUESTS;
      code = ERROR_CODES.THROTTLE_LIMIT;
      message = '请求过于频繁，请稍后再试';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null && 'code' in res) {
        const body = res as {
          code: string;
          message: string;
          details?: unknown;
        };
        code = body.code;
        message = body.message;
        if (body.details !== undefined) {
          errorDetails = body.details;
        }
      } else if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null && 'message' in res) {
        const body = res as { message: string | string[] };
        message = Array.isArray(body.message)
          ? body.message.join(', ')
          : body.message;
      }
    } else if (exception instanceof Error) {
      this.logger.error({
        msg: 'unhandled_http_error',
        requestId,
        method: request.method,
        path: request.url,
        errorName: exception.name,
        errorMessage: exception.message,
        stack: exception.stack,
      });
    }

    const payload: {
      error: { code: string; message: string; details?: unknown };
      requestId: string;
      debug?: { message: string; name?: string };
    } = {
      error:
        errorDetails !== undefined
          ? { code, message, details: errorDetails }
          : { code, message },
      requestId,
    };

    if (
      process.env.NODE_ENV !== 'production' &&
      exception instanceof Error &&
      !(exception instanceof HttpException)
    ) {
      payload.debug = {
        name: exception.name,
        message: exception.message,
      };
    }

    response.status(status).json(payload);
  }
}
