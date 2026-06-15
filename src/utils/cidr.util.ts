import { isIP } from "net";

/** Rimuove il suffisso CIDR, fa trim e srotola gli IPv4-mapped IPv6 (`::ffff:`). */
export function purifyIp(ip: string): string {
  let pure = ip.includes("/") ? ip.split("/")[0] : ip;
  pure = pure.trim();
  if (pure.startsWith("::ffff:")) pure = pure.slice("::ffff:".length);
  return pure;
}

export function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
}

export function ipv6ToBigInt(ip: string): bigint {
  const [headStr, tailStr] = ip.includes("::") ? ip.split("::") : [ip, ""];
  const head = headStr ? headStr.split(":") : [];
  const tail = tailStr ? tailStr.split(":") : [];
  const missing = 8 - head.length - tail.length;
  const groups = [...head, ...Array(missing).fill("0"), ...tail];
  return groups.reduce((acc, g) => (acc << 16n) + BigInt(parseInt(g || "0", 16)), 0n);
}

export function isInCidrV4(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split("/");
  const bits = bitsStr === undefined ? 32 : Number(bitsStr);
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(range) & mask);
}

export function isInCidrV6(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split("/");
  const prefix = bitsStr === undefined ? 128 : Number(bitsStr);
  if (prefix === 0) return true;
  const mask = ((1n << 128n) - 1n) ^ ((1n << BigInt(128 - prefix)) - 1n);
  return (ipv6ToBigInt(ip) & mask) === (ipv6ToBigInt(range) & mask);
}

/** Verifica se un IP "puro" appartiene a uno qualsiasi dei CIDR della sua versione. */
export function isIpInAnyCidr(pureIp: string, cidrs: string[], version: 4 | 6): boolean {
  return version === 4
    ? cidrs.some((cidr) => isInCidrV4(pureIp, cidr))
    : cidrs.some((cidr) => isInCidrV6(pureIp, cidr));
}

/** Ritorna la versione IP (4 | 6) di un valore già "purificato", oppure null. */
export function ipVersion(pureIp: string): 4 | 6 | null {
  const version = isIP(pureIp);
  return version === 0 ? null : (version as 4 | 6);
}
