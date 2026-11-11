import "reflect-metadata";
import { tmpdir } from "os";
import { join } from "path";
import { Controller, Get, Module, NotFoundException } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import { AttackLoggerMiddleware } from "./attack-logger.middleware";
import type { AttacksService } from "../attacks.service";

// Decoratori applicati come funzioni: il file è fuori dal tsconfig della build
class ArtworksController {
  findOne(): never {
    throw new NotFoundException("ARTWORK_NOT_FOUND");
  }
}
Controller("artworks")(ArtworksController);
Get(":id")(
  ArtworksController.prototype,
  "findOne",
  Object.getOwnPropertyDescriptor(ArtworksController.prototype, "findOne")!,
);

class AppModule {}
Module({ controllers: [ArtworksController] })(AppModule);

/** Restituisce gli indirizzi che il middleware avrebbe bloccato */
async function blockedPaths(prefix: string, paths: string[]): Promise<string[]> {
  const app = await NestFactory.create(AppModule, { logger: false });
  if (prefix) app.setGlobalPrefix(prefix);

  const mw = new AttackLoggerMiddleware({} as AttacksService, {
    logPath: join(tmpdir(), "attack-logger-spec.log"),
  } as never);
  const blocked: string[] = [];
  (mw as unknown as { handleSuspicious: (req: { originalUrl: string }) => void }).handleSuspicious =
    (req) => blocked.push(req.originalUrl);
  app.use(mw.use.bind(mw));

  await app.listen(0);
  const base = await app.getUrl();
  for (const path of paths) {
    const res = await fetch(base + path);
    expect(res.status).toBe(404);
  }
  await new Promise((r) => setTimeout(r, 20)); // 'finish' arriva dopo la risposta
  await app.close();
  mw.onModuleDestroy();
  return blocked;
}

describe("AttackLoggerMiddleware", () => {
  it("senza prefisso: blocca solo i 404 degli indirizzi senza rotta", async () => {
    const blocked = await blockedPaths("", ["/artworks/123", "/wp-admin", "/.env"]);
    expect(blocked).toEqual(["/wp-admin", "/.env"]);
  });

  it("con prefisso globale: il catch-all di Nest non conta come rotta", async () => {
    const blocked = await blockedPaths("api", ["/api/artworks/123", "/api/wp-admin", "/.env"]);
    expect(blocked).toEqual(["/api/wp-admin", "/.env"]);
  });
});
