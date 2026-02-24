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

export function toCidr(ip: string): string | null {
  if (!ip) return null;

  // IPv6
  if (ip.includes(":")) {
    return `${ip}/128`;
  }

  // IPv4
  if (ip.includes(".")) {
    return `${ip}/32`;
  }

  return null;
}
