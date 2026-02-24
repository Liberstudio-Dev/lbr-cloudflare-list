import { Inject, Injectable, Logger, NestMiddleware, OnModuleDestroy } from "@nestjs/common";
import { createWriteStream, WriteStream, mkdirSync, existsSync } from "fs";
import { dirname, resolve } from "path";
import { AttacksService } from "../attacks.service";
import { CLOUDFLARE_OPTIONS, getClientIp, normalizeIp } from "../utils";

import type { NextFunction, Request, Response } from "express";
import type { CloudflareAttacksOptions } from "../interfaces";

@Injectable()
export class AttackLoggerMiddleware implements NestMiddleware, OnModuleDestroy {
  private readonly logger = new Logger(AttackLoggerMiddleware.name);

  private readonly recentIps = new Map<string, NodeJS.Timeout>();
  private readonly throttleMs = 5_000;

  private readonly stream: WriteStream;

  constructor(
    private readonly attSrv: AttacksService,
    @Inject(CLOUDFLARE_OPTIONS)
    private readonly options: CloudflareAttacksOptions,
  ) {
    if (!options.logPath || typeof options.logPath !== "string") {
      throw new Error("CloudflareAttacksOptions.logPath deve essere una stringa valida");
    }

    const absolutePath = resolve(options.logPath);
    this.ensureDirectoryExists(absolutePath);

    this.stream = createWriteStream(absolutePath, {
      flags: "a",
      encoding: "utf8",
      highWaterMark: 64 * 1024,
    });

    this.stream.on("error", (err) => {
      this.logger.error(`Errore nello stream del log (${absolutePath}): ${err.message}`);
    });
  }

  use(req: Request, res: Response, next: NextFunction): void {
    res.on("finish", () => {
      if (res.statusCode === 404) {
        this.handleSuspicious(req);
      }
    });

    next();
  }

  private handleSuspicious(req: Request): void {
    const ip = getClientIp(req);
    if (!ip || this.isThrottled(ip)) return;

    const entry = {
      timestamp: new Date().toISOString(),
      type: "ATTACK",
      ip,
      method: req.method,
      url: this.sanitize(req.url),
    };

    const line = JSON.stringify(entry) + "\n";

    if (!this.stream.write(line)) {
      this.stream.once("drain", () => {
        this.logger.debug("Stream del log degli attacchi svuotato");
      });
    }

    const cidr = normalizeIp(ip);
    if (!cidr) {
      this.logger.warn(`IP non valido: ${ip}`);
      return;
    }

    this.attSrv.updateIpList(cidr).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      this.logger.error(`Aggiornamento Cloudflare fallito: ${msg}`);
    });
  }

  private isThrottled(ip: string): boolean {
    if (this.recentIps.has(ip)) return true;

    const timeout = setTimeout(() => {
      this.recentIps.delete(ip);
    }, this.throttleMs);

    this.recentIps.set(ip, timeout);
    return false;
  }

  private sanitize(value: string): string {
    return value.replace(/[\r\n]/g, "_");
  }

  private ensureDirectoryExists(filePath: string): void {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      this.logger.log(`Cartella dei log creata: ${dir}`);
    }
  }

  onModuleDestroy(): void {
    this.stream.end();
    for (const timeout of this.recentIps.values()) {
      clearTimeout(timeout);
    }
    this.recentIps.clear();
  }
}
