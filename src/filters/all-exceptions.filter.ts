import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Inject, Logger, Optional } from "@nestjs/common";
import { getClientIp } from "../utils/get-client-ip.util";
import { CLOUDFLARE_OPTIONS } from "../utils";

import type { Request, Response } from "express";
import type { CloudflareAttacksOptions } from "../interfaces";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(
    @Optional() @Inject(CLOUDFLARE_OPTIONS) private readonly options?: CloudflareAttacksOptions,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    // ✅ SuperTokens gestisce i propri errori autonomamente
    // if (request.url.startsWith("/auth")) {
    //   return;
    // }

    const isSilentPath = (this.options?.silentPaths ?? []).some((p) =>
      p instanceof RegExp ? p.test(request.url) : request.url.startsWith(p),
    );

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = exception instanceof HttpException ? exception.getResponse() : exception instanceof Error ? exception.message : "Internal server error";

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

    /* const isMissingToken = message === "Invalid or missing token"; */

    

    if (!isSilentPath) {
      if (status >= 500) {
        this.logger.error(`[${ip}] [${request.method}] ${request.url} → ${status}`, JSON.stringify(errorLog, null, 2));
      } else {
        this.logger.error(`[${ip}] [${request.method}] ${request.url} → ${status}`);
        // this.logger.warn(`[${ip}] [${request.method}] ${request.url} → ${status}`, JSON.stringify(errorLog, null, 2));
      }
    }

    response.status(status).json({
      statusCode: status,
      timestamp: errorLog.timestamp,
      path: request.url,
      message,
    });
  }
}
