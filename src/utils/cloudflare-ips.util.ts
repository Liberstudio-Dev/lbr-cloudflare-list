import axios from "axios";

import { ipVersion, isIpInAnyCidr, purifyIp } from "./cidr.util";

const CF_IPS_V4_URL = "https://www.cloudflare.com/ips-v4/";
const CF_IPS_V6_URL = "https://www.cloudflare.com/ips-v6/";
const TTL_MS = 24 * 60 * 60 * 1000;

interface CloudflareIpsCache {
  v4: string[];
  v6: string[];
  expiresAt: number;
}

let cache: CloudflareIpsCache | null = null;
let inFlight: Promise<CloudflareIpsCache> | null = null;

async function loadCloudflareIps(): Promise<CloudflareIpsCache> {
  if (cache && Date.now() < cache.expiresAt) return cache;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const [v4Res, v6Res] = await Promise.all([
      axios.get<string>(CF_IPS_V4_URL, { responseType: "text" }),
      axios.get<string>(CF_IPS_V6_URL, { responseType: "text" }),
    ]);

    const parse = (data: string): string[] =>
      data.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

    cache = {
      v4: parse(v4Res.data),
      v6: parse(v6Res.data),
      expiresAt: Date.now() + TTL_MS,
    };
    return cache;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

export function isAllowedIp(ip: string, allowedIps: string[]): boolean {
  if (!ip || !allowedIps.length) return false;

  const pure = purifyIp(ip);
  const version = ipVersion(pure);
  if (!version) return false;

  return allowedIps.some((entry) => {
    const entryVersion = ipVersion(purifyIp(entry));
    if (!entryVersion || entryVersion !== version) return false;

    return isIpInAnyCidr(pure, [entry], version);
  });
}

export async function isCloudflareIp(ip: string): Promise<boolean> {
  if (!ip) return false;

  const pure = purifyIp(ip);
  const version = ipVersion(pure);
  if (!version) return false;

  try {
    const { v4, v6 } = await loadCloudflareIps();
    return isIpInAnyCidr(pure, version === 4 ? v4 : v6, version);
  } catch {
    return false;
  }
}
