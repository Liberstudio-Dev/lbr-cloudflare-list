export const CLOUDFLARE_OPTIONS = Symbol('CLOUDFLARE_OPTIONS');

/** Provider italiani: i loro IP non vengono mai bannati (sono i clienti delle app). */
export const ITALIAN_ISP_ASNS: Record<string, string> = {
  '3269': 'TIM',
  '30722': 'Vodafone',
  '12874': 'Fastweb',
  '1267': 'WindTre',
  '29447': 'Iliad',
  '8612': 'Tiscali',
};

/**
 * ASN mai bannati. Cloudflare serve perché ips-v4/v6 coprono solo il proxy, non 1.1.1.1 né le uscite
 * WARP / iCloud Private Relay (104.28.x, 2a09:bac0::/29), da cui arrivano utenti veri.
 * Google (AS15169) NON è qui: annuncia anche range GCP da cui arrivano scanner; i crawler sono
 * protetti da isGoogleBotIp / googleBotOverlapsCidr.
 */
export const PROTECTED_ASNS: Record<string, string> = {
  '13335': 'Cloudflare',
  '209242': 'Cloudflare',
  ...ITALIAN_ISP_ASNS,
};
