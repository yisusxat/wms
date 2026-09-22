import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const request = host.switchToHttp().getRequest();
    const requestId = request.header?.('x-request-id');
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      const detail = typeof payload === 'string' ? payload : (payload as { message?: string | string[] }).message;
      message = Array.isArray(detail) ? detail.join(', ') : detail ?? exception.message;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      code = exception.code;
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        message = 'A record with the same unique value already exists';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = 'Record not found';
      } else if (exception.code === 'P2003') {
        status = HttpStatus.BAD_REQUEST;
        message = 'Referenced record does not exist';
      } else if (exception.code === 'P2010') {
        status = HttpStatus.BAD_REQUEST;
        const rawMsg = (exception.meta?.message as string) || exception.message || '';
        if (rawMsg.includes('insufficient stock')) {
          message = 'Stock insuficiente en la posición para realizar el despacho o ajuste.';
        } else if (rawMsg.includes('quantity must be greater than zero')) {
          message = 'La cantidad debe ser mayor a cero.';
        } else if (rawMsg.includes('destination is not available')) {
          message = 'La ubicación de destino no se encuentra disponible.';
        } else if (rawMsg.includes('source and destination cannot be the same')) {
          message = 'La ubicación de origen y destino no pueden ser iguales.';
        } else {
          const match = rawMsg.match(/ERROR:\s*([^\n]+)/i);
          message = match ? match[1].trim() : ((exception.meta?.message as string) || 'Operación de inventario rechazada');
        }
      }
    }

    if (status >= 500 && process.env.SENTRY_DSN) {
      import('@sentry/node').then((Sentry) => {
        Sentry.withScope((scope) => {
          if (requestId) scope.setTag('requestId', requestId);
          Sentry.captureException(exception);
        });
      }).catch(() => null);
    }

    response.status(status).json({ statusCode: status, message, ...(code ? { code } : {}), ...(requestId ? { requestId } : {}) });
  }
}
