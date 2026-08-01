import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest();
    const response = ctx.getResponse();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const res = exception instanceof HttpException ? exception.getResponse() : null;
    const safeMessage = status >= 500
      ? '服务器异常，请稍后再试'
      : (typeof res === 'object' && res && 'message' in res
          ? Array.isArray((res as any).message) ? (res as any).message.join('；') : (res as any).message
          : exception instanceof Error ? exception.message : '请求失败');
    const errorStack = exception instanceof Error ? exception.stack : undefined;
    const body: Record<string, any> = {
      code: status,
      message: safeMessage,
      data: null,
      service: process.env.SERVICE_NAME || 'trace-enterprise-api',
      env: process.env.NODE_ENV || 'development',
      request_id: req?.request_id || req?.id || null,
      trace_id: req?.trace_id || req?.headers?.['x-trace-id'] || null,
      path: req?.url || null,
      user_id: req?.user?.id || null,
      timestamp: Date.now(),
    };

    if (process.env.NODE_ENV !== 'production' && errorStack) body.stack = errorStack;
    req?.log?.error?.({ ...body, error_stack: errorStack }, 'exception');
    response.status(status).send(body);
  }
}
