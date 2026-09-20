import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(request: Request, response: Response, next: NextFunction): void {
    const start = Date.now();
    const { method, originalUrl, ip } = request;
    const userAgent = request.get('user-agent') || '-';

    response.on('finish', () => {
      const durationMs = Date.now() - start;
      const { statusCode } = response;
      const requestId = response.getHeader('x-request-id') || request.header('x-request-id') || '-';

      const logPayload = {
        requestId,
        method,
        url: originalUrl,
        statusCode,
        durationMs,
        ip,
        userAgent,
      };

      const message = `${method} ${originalUrl} ${statusCode} - ${durationMs}ms [${requestId}]`;

      if (statusCode >= 500) {
        this.logger.error(message, JSON.stringify(logPayload));
      } else if (statusCode >= 400) {
        this.logger.warn(message, JSON.stringify(logPayload));
      } else {
        this.logger.log(message, JSON.stringify(logPayload));
      }
    });

    next();
  }
}
