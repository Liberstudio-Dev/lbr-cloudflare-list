import axios from "axios";
import { promises as dns } from "dns";

import { ipVersion, isIpInAnyCidr, purifyIp } from "./cidr.util";

// Liste IP ufficiali pubblicate (e aggiornate) da Google.
const GOOGLE_IP_LIST_URLS = [
  "https://developers.google.com/static/search/apis/ipranges/googlebot.json",
  "https://developers.google.com/static/search/apis/ipranges/special-crawlers.json",
  "https://developers.google.com/static/search/apis/ipranges/user-triggered-fetchers.json",
];

// Domini dei crawler verificati da Google (per il fallback reverse DNS).
const GOOGLE_HOSTS = [".googlebot.com", ".google.com", ".googleusercontent.com"];

const TTL_MS = 24 * 60 * 60 * 1000;

interface GooglePrefix {
  ipv4Prefix?: string;
  ipv6Prefix?: string;
}

interface GoogleIpRangesResponse {
  prefixes?: GooglePrefix[];
}

interface GoogleIpsCache {
  v4: string[];
  v6: string[];
  expiresAt: number;
}

let cache: GoogleIpsCache | null = null;
let inFlight: Promise<GoogleIpsCache> | null = null;

async function loadGoogleIps(): Promise<GoogleIpsCache> {
  if (cache && Date.now() < cache.expiresAt) return cache;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const responses = await Promise.all(
      GOOGLE_IP_LIST_URLS.map((url) => axios.get<GoogleIpRangesResponse>(url)),
    );

    const v4: string[] = [];
    const v6: string[] = [];

    for (const res of responses) {
      for (const prefix of res.data?.prefixes ?? []) {
        if (prefix.ipv4Prefix) v4.push(prefix.ipv4Prefix);
        if (prefix.ipv6Prefix) v6.push(prefix.ipv6Prefix);
      }
    }

    cache = { v4, v6, expiresAt: Date.now() + TTL_MS };
    return cache;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

/**
 * Verifica anti-spoofing via reverse + forward DNS (metodo raccomandato da Google).
 * Ritorna `true`/`false` se determinabile, `null` se la risoluzione DNS fallisce.
 */
async function verifyByReverseDns(pureIp: string, version: 4 | 6): Promise<boolean | null> {
  try {
    const hostnames = await dns.reverse(pureIp);
    const host = hostnames.find((h) => GOOGLE_HOSTS.some((d) => h.endsWith(d)));
    if (!host) return false; // reverse DNS risolto ma non è un dominio Google

    const resolved = version === 4 ? await dns.resolve4(host) : await dns.resolve6(host);
    return resolved.some((addr) => purifyIp(addr) === pureIp);
  } catch {
    return null; // nessun PTR / errore DNS: non determinabile
  }
}

/**
 * True se l'IP appartiene ai crawler Google (Googlebot, special crawlers, fetcher).
 *
 * Strategia hybrid:
 *  1. match veloce sulle liste IP ufficiali (cache 24h, auto-aggiornate);
 *  2. fallback reverse DNS anti-spoofing se non presente nelle liste.
 *
 * Fail-open: se né le liste né il DNS riescono a verificare, ritorna `true`
 * (non bannare) per non rischiare di bloccare Googlebot durante un disservizio.
 */
export async function isGoogleBotIp(ip: string): Promise<boolean> {
  if (!ip) return false;

  const pure = purifyIp(ip);
  const version = ipVersion(pure);
  if (!version) return false;

  let listAvailable = false;
  try {
    const { v4, v6 } = await loadGoogleIps();
    listAvailable = true;
    if (isIpInAnyCidr(pure, version === 4 ? v4 : v6, version)) return true;
  } catch {
    listAvailable = false;
  }

  const dnsResult = await verifyByReverseDns(pure, version);
  if (dnsResult !== null) return dnsResult;

  // DNS non determinabile: se la lista era disponibile e l'IP non c'era → non è Google;
  // se nemmeno la lista era raggiungibile → fail-open.
  return !listAvailable;
}
