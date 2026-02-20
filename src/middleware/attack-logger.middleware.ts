import * as fs from "fs/promises";
import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { AttacksService } from "../attacks.service";

@Injectable()
export class AttackLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger("AttackLogger");
  private readonly logPath = "/var/log/nestjs-attacks.log";

  // Throttle per IP: evita flood verso Cloudflare
  private readonly recentIps = new Map<string, number>();
  private readonly THROTTLE_MS = 5_000;

  // Coda serializzata (fire-and-forget, non awaited dall'esterno)
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly attSrv: AttacksService) {}

  use(req: Request, res: Response, next: NextFunction) {
    res.on("finish", () => {
      if (res.statusCode === 404) {
        this.enqueue(req);
      }
    });
    next();
  }

  private enqueue(req: Request): void {
    this.writeQueue = this.writeQueue
      .then(() => this.processSuspiciousRequest(req))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Unknown error";
        this.logger.error(`Errore processing richiesta: ${msg}`);
      });
  }

  private async processSuspiciousRequest(req: Request): Promise<void> {
    const ip = this.getClientIp(req);
    if (ip === "unknown") return;

    if (this.isThrottled(ip)) return;

    const safeUrl = req.url.replace(/[\r\n]/g, "_");
    const logEntry = `${new Date().toISOString()} [ATTACK] IP=${ip} METHOD=${req.method} URL=${safeUrl}\n`;

    this.logger.debug(logEntry.trimEnd());

    // Esegue in parallelo: log su file + update Cloudflare
    await Promise.allSettled([
      fs.appendFile(this.logPath, logEntry).catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : "FS Error";
        this.logger.error(
          `Impossibile scrivere log su ${this.logPath}: ${msg}`,
        );
      }),
      this.attSrv.updateIpList(ip).catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : "Service Error";
        this.logger.error(`Impossibile aggiornare IP list: ${msg}`);
      }),
    ]);
  }

  private isThrottled(ip: string): boolean {
    const now = Date.now();
    const last = this.recentIps.get(ip);
    if (last && now - last < this.THROTTLE_MS) return true;

    if (this.recentIps.size > 10_000) this.recentIps.clear();

    this.recentIps.set(ip, now);
    return false;
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
