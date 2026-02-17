import * as fs from "fs/promises"; // Passiamo alla versione asincrona
import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { AttacksService } from "../attacks.service";

@Injectable()
export class AttackLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger("AttackLogger");
  private readonly logPath = "/var/log/nestjs-attacks.log";

  constructor(private readonly attSrv: AttacksService) {}

  use(req: Request, res: Response, next: NextFunction) {
    res.on("finish", () => {
      if (res.statusCode === 404) {
        this.processSuspiciousRequest(req).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : "Unknown error";
          this.logger.error(`Errore nel processando la richiesta verso Cloudflare: ${msg}`);
        });
      }
    });
    next();
  }

  private async processSuspiciousRequest(req: Request): Promise<void> {
    const ip = this.getClientIp(req);

    if (ip === "unknown") return;

    const logEntry = `${new Date().toISOString()} [ATTACK] IP=${ip} METHOD=${req.method} URL=${req.url}\n`;

    await this.attSrv.updateIpList(ip);

    try {
      await fs.appendFile(this.logPath, logEntry);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "FS Error";
      this.logger.error(`Impossibile scrivere log su ${this.logPath}: ${msg}`);
    }
  }

  private getClientIp(req: Request): string {
    const cfIp = req.headers["cf-connecting-ip"];
    if (typeof cfIp === "string") return cfIp;

    const xRealIp = req.headers["x-real-ip"];
    if (typeof xRealIp === "string") return xRealIp;

    const xForwardedFor = req.headers["x-forwarded-for"];
    if (typeof xForwardedFor === "string") {
      return xForwardedFor.split(",")[0].trim();
    }

    return req.socket.remoteAddress ?? "unknown";
  }
}
