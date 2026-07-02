import axios from "axios";
import { promises as dns } from "dns";

import { ipVersion, isInCidrV4, isInCidrV6, isIpInAnyCidr, purifyIp } from "./cidr.util";

// common-crawlers.json = Googlebot Search + altri crawler comuni, con range IP
// stretti. NB: il vecchio URL .../search/apis/ipranges/googlebot.json è stato
// dismesso da Google (risponde "Temporarily Broken") — questo è il rimpiazzo
// ufficiale indicato da Google. special-crawlers e user-triggered-fetchers li
// escludiamo di proposito: includono range GCP molto ampi (Lighthouse, PageSpeed,
// Feed Fetcher) e causano falsi positivi — non meritano protezione "skip ban".
const GOOGLE_IP_LIST_URLS = [
  "https://developers.google.com/static/crawling/ipranges/common-crawlers.json",
];

// Domini dei crawler verificati da Google (per il fallback reverse DNS).
// NB: .googleusercontent.com è escluso di proposito — è il PTR generico di ogni
// VM su Google Cloud, quindi qualsiasi scanner ospitato su GCP forward-confirma
// e verrebbe messo erroneamente in whitelist. I crawler veri usano solo i due sotto.
const GOOGLE_HOSTS = [".googlebot.com", ".google.com"];

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
 * True se l'IP appartiene ai crawler di Google Search (googlebot.json ufficiale).
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

/**
 * True se il CIDR dato si sovrappone con almeno un range Googlebot.
 * Usato prima di bannare un'intera subnet ASN: se la subnet contiene IP Google,
 * meglio bannare solo l'IP singolo per non bloccare il crawler.
 * Fail-safe: in caso di errore ritorna false (lascia procedere il ban della subnet).
 */
export async function googleBotOverlapsCidr(cidr: string): Promise<boolean> {
  const networkAddr = purifyIp(cidr);
  const version = ipVersion(networkAddr);
  if (!version) return false;

  try {
    const { v4, v6 } = await loadGoogleIps();
    const googlebotCidrs = version === 4 ? v4 : v6;

    // Il network address della subnet ASN cade in un range Googlebot?
    if (isIpInAnyCidr(networkAddr, googlebotCidrs, version)) return true;

    // Il network address di un range Googlebot cade nella subnet ASN?
    return googlebotCidrs.some((gbCidr) => {
      const gbNet = purifyIp(gbCidr);
      return version === 4 ? isInCidrV4(gbNet, cidr) : isInCidrV6(gbNet, cidr);
    });
  } catch {
    return false;
  }
}
