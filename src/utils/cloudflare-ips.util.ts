import axios from "axios";
import { isIP } from "net";

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

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
}

function ipv6ToBigInt(ip: string): bigint {
  const [headStr, tailStr] = ip.includes("::") ? ip.split("::") : [ip, ""];
  const head = headStr ? headStr.split(":") : [];
  const tail = tailStr ? tailStr.split(":") : [];
  const missing = 8 - head.length - tail.length;
  const groups = [...head, ...Array(missing).fill("0"), ...tail];
  return groups.reduce((acc, g) => (acc << 16n) + BigInt(parseInt(g || "0", 16)), 0n);
}

function isInCidrV4(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split("/");
  const bits = bitsStr === undefined ? 32 : Number(bitsStr);
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(range) & mask);
}

function isInCidrV6(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split("/");
  const prefix = bitsStr === undefined ? 128 : Number(bitsStr);
  if (prefix === 0) return true;
  const mask = ((1n << 128n) - 1n) ^ ((1n << BigInt(128 - prefix)) - 1n);
  return (ipv6ToBigInt(ip) & mask) === (ipv6ToBigInt(range) & mask);
}

export async function isCloudflareIp(ip: string): Promise<boolean> {
  if (!ip) return false;

  let pure = ip.includes("/") ? ip.split("/")[0] : ip;
  pure = pure.trim();
  if (pure.startsWith("::ffff:")) pure = pure.slice("::ffff:".length);

  const version = isIP(pure);
  if (!version) return false;

  try {
    const { v4, v6 } = await loadCloudflareIps();
    return version === 4
      ? v4.some((cidr) => isInCidrV4(pure, cidr))
      : v6.some((cidr) => isInCidrV6(pure, cidr));
  } catch {
    return false;
  }
}
