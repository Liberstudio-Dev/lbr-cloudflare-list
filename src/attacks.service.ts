// attacks.service.ts
import { HttpException, Injectable, Logger, Inject } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import axios from "axios";

import { firstValueFrom } from "rxjs";

import { CLOUDFLARE_OPTIONS, isAllowedIp, isCloudflareIp, isGoogleBotIp, normalizeIp } from "./utils";

import type { AsnLookupResponse, CloudflareAttacksOptions, CloudflareErrorData, CloudflareResponse } from "./interfaces";

@Injectable()
export class AttacksService {
  private readonly logger = new Logger("AttackLogger");
  private readonly API_URL = `https://api.cloudflare.com/client/v4/accounts`;
  private readonly ASN_LOOKUP_URL = `https://api.hackertarget.com/aslookup`;

  constructor(
    private readonly httpService: HttpService,
    @Inject(CLOUDFLARE_OPTIONS)
    private readonly options: CloudflareAttacksOptions,
  ) {}

  async blockIp(rawIp: string): Promise<CloudflareResponse | null> {
    if (isAllowedIp(rawIp, this.options.allowedIps ?? [])) {
      this.logger.log(`IP ${rawIp} in whitelist — ban saltato`);
      return null;
    }

    if (await isCloudflareIp(rawIp)) {
      this.logger.log(`IP ${rawIp} appartiene al range Cloudflare — ban saltato`);
      return null;
    }

    if (await isGoogleBotIp(rawIp)) {
      this.logger.log(`IP ${rawIp} è un crawler Google — ban saltato`);
      return null;
    }

    const asnRange = await this.lookupAsnRange(rawIp);

    if (asnRange) {
      this.logger.error(`ASN range trovato per ${rawIp}: ${asnRange} — blocco intera subnet`);
      const result = await this.updateIpList(asnRange);
      this.sendWhatsappNotification(rawIp, asnRange);
      return result;
    }

    const cidr = normalizeIp(rawIp);
    if (!cidr) throw new Error(`IP non valido: ${rawIp}`);
    const result = await this.updateIpList(cidr);
    this.sendWhatsappNotification(rawIp, cidr);
    return result;
  }

  private sendWhatsappNotification(rawIp: string, cidr: string): void {
    const wa = this.options.whatsappNotify;
    if (!wa) return;

    const url = process.env["WA_URL"];
    const user = process.env["WA_USER"];
    const password = process.env["WA_PASSWORD"];
    const deviceId = process.env["CLOUDFLARE_WA_DEVICE_ID"];

    if (!url || !user || !password || !deviceId) {
      this.logger.warn("Notifica WhatsApp saltata: WA_URL, WA_USER, WA_PASSWORD o CLOUDFLARE_WA_DEVICE_ID mancanti");
      return;
    }

    const auth = Buffer.from(`${user}:${password}`).toString("base64");
    const message = `🚨 IP bannato su Cloudflare\nProvenienza: ${this.options.comment}\nIP: ${rawIp}\nSubnet bloccata: ${cidr}`;

    firstValueFrom(
      this.httpService.post(
        `${url}/send/message`,
        { phone: wa.phone, message },
        { headers: { Authorization: `Basic ${auth}`, "X-Device-Id": deviceId } },
      ),
    ).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      this.logger.warn(`Notifica WhatsApp fallita: ${msg}`);
    });
  }

  private async lookupAsnRange(ip: string): Promise<string | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<AsnLookupResponse>(`${this.ASN_LOOKUP_URL}/?q=${ip}&output=json`),
      );
      return response.data?.asn_range ?? null;
    } catch {
      return null;
    }
  }

  async updateIpList(cidr: string): Promise<CloudflareResponse> {
    const { accountId, listId, apiToken, comment } = this.options;
    const url = `${this.API_URL}/${accountId}/rules/lists/${listId}/items`;

    this.logger.error(`Aggiungo ${cidr} alla lista Cloudflare`);

    const body = [{ ip: cidr, comment }];

    try {
      const response = await firstValueFrom(
        this.httpService.post<CloudflareResponse>(url, body, {
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
        }),
      );

      return response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const data = error.response?.data as CloudflareErrorData | undefined;

        const message: string = data?.errors?.[0]?.message || "Errore Cloudflare API";
        const status: number = error.response?.status || 500;

        throw new HttpException(message, status);
      }

      throw new HttpException("Internal Server Error", 500);
    }
  }
}
