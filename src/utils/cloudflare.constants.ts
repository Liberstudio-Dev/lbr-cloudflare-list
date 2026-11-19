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
 * ASN mai bannati. Cloudflare e Google servono perché le liste ips-v4/v6 e quelle dei crawler
 * non coprono tutti i loro IP (es. 1.1.1.1). Google Cloud (AS396982) NON è qui: da lì arrivano molti scanner.
 */
export const PROTECTED_ASNS: Record<string, string> = {
  '13335': 'Cloudflare',
  '209242': 'Cloudflare',
  '15169': 'Google',
  ...ITALIAN_ISP_ASNS,
};
