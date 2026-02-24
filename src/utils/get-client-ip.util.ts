import type { Request } from "express";
import { isIP } from "net";

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

export function normalizeIp(ip: string): string | null {
  if (!ip) return null;

  ip = ip.trim();

  // IPv4-mapped IPv6 → converti in IPv4 puro
  if (ip.startsWith("::ffff:")) {
    ip = ip.replace("::ffff:", "");
  }

  const version = isIP(ip);
  if (!version) return null;

  // Blocca loopback
  if (ip === "127.0.0.1" || ip === "::1") return null;

  // Blocca IPv4 privati
  if (version === 4) {
    if (ip.startsWith("10.") || ip.startsWith("192.168.") || (ip.startsWith("172.") && isPrivate172(ip))) {
      return null;
    }
    return `${ip}/32`;
  }

  // Blocca IPv6 link-local e unique local
  if (version === 6) {
    if (
      ip.startsWith("fe80:") || // link-local
      ip.startsWith("fc") || // unique local
      ip.startsWith("fd")
    ) {
      return null;
    }
    return `${ip}/128`;
  }

  return null;
}

function isPrivate172(ip: string): boolean {
  const secondOctet = Number(ip.split('.')[1]);
  return secondOctet >= 16 && secondOctet <= 31;
}
