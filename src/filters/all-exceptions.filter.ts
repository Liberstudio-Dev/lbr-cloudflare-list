import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Request, Response } from "express";
import { getClientIp } from "../utils/get-client-ip.util";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = exception instanceof HttpException ? exception.getResponse() : "Internal server error";

    const ip = getClientIp(request);

    const errorLog = {
      ip,
      timestamp: new Date().toISOString(),
      statusCode: status,
      path: request.url,
      method: request.method,
      body: request.body as Record<string, unknown>,
      query: request.query,
      params: request.params,
      message,
      stack: exception instanceof Error ? exception.stack : undefined,
    };
    const isMissingToken = message === "Invalid or missing token";

    if (status >= 500) {
      this.logger.error(`[${ip}] [${request.method}] ${request.url} → ${status}`, isMissingToken ? null : JSON.stringify(errorLog, null, 2));
    } else {
      this.logger.warn(`[${ip}] [${request.method}] ${request.url} → ${status}`, isMissingToken ? null : JSON.stringify(errorLog, null, 2));
    }

    response.status(status).json({
      statusCode: status,
      timestamp: errorLog.timestamp,
      path: request.url,
      message,
    });
  }
}
