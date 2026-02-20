import { Request } from "express";

export function getClientIp(req: Request): string {
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
