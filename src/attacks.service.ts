// attacks.service.ts
import { HttpException, Injectable, Logger, Inject } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import axios from "axios";

import { firstValueFrom } from "rxjs";

import { CLOUDFLARE_OPTIONS, isAllowedIp, isCloudflareIp, isGoogleBotIp, googleBotOverlapsCidr, normalizeIp } from "./utils";

import type { AsnLookupResponse, CloudflareAccount, CloudflareAttacksOptions, CloudflareErrorData, CloudflareResponse } from "./interfaces";

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

  async blockIp(rawIp: string): Promise<CloudflareResponse[] | null> {
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

    if (asnRange && !(await googleBotOverlapsCidr(asnRange))) {
      this.logger.error(`ASN range trovato per ${rawIp}: ${asnRange} — blocco intera subnet`);
      const result = await this.updateIpList(asnRange);
      this.sendNotification(rawIp, asnRange, result.length);
      return result;
    }

    if (asnRange) {
      this.logger.warn(`ASN range ${asnRange} sovrapposto a range Googlebot — ban limitato all'IP singolo`);
    }

    const cidr = normalizeIp(rawIp);
    if (!cidr) throw new Error(`IP non valido: ${rawIp}`);
    const result = await this.updateIpList(cidr);
    this.sendNotification(rawIp, cidr, result.length);
    return result;
  }

  private sendNotification(rawIp: string, cidr: string, okAccounts: number): void {
    const message = `🚨 IP bannato su Cloudflare\nProvenienza: ${this.options.comment}\nIP: ${rawIp}\nSubnet bloccata: ${cidr}\nAccount: ${okAccounts}/${this.options.accounts.length}`;
    const provider = this.options.notifyProvider ?? (this.isWhatsappConfigured() ? "whatsapp" : "telegram");

    if (provider === "whatsapp") this.sendWhatsappNotification(message);
    else this.sendTelegramNotification(message);
  }

  private isWhatsappConfigured(): boolean {
    const env = process.env;
    return !!(this.options.whatsappNotify && env["WA_URL"] && env["WA_USER"] && env["WA_PASSWORD"] && env["CLOUDFLARE_WA_DEVICE_ID"]);
  }

  private sendTelegramNotification(message: string): void {
    const tg = this.options.telegramNotify;
    if (!tg) return;

    const token = process.env["TELEGRAM_BOT_TOKEN"];
    if (!token) {
      this.logger.warn("Notifica Telegram saltata: TELEGRAM_BOT_TOKEN mancante");
      return;
    }

    firstValueFrom(
      this.httpService.post(`https://api.telegram.org/bot${token}/sendMessage`, { chat_id: tg.chatId, text: message }),
    ).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      const description = axios.isAxiosError(err) ? (err.response?.data as { description?: string } | undefined)?.description : undefined;
      this.logger.warn(`Notifica Telegram fallita: ${msg}${description ? ` (${description})` : ""}`);
    });
  }

  private sendWhatsappNotification(message: string): void {
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

  /** Aggiunge il CIDR alle liste di tutti gli account; ritorna le risposte degli account riusciti. */
  async updateIpList(cidr: string): Promise<CloudflareResponse[]> {
    const { accounts } = this.options;

    this.logger.error(`Aggiungo ${cidr} alle liste Cloudflare (${accounts.length} account)`);

    const results = await Promise.allSettled(accounts.map((account) => this.addToAccountList(account, cidr)));

    const ok: CloudflareResponse[] = [];
    let firstError: unknown;

    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        ok.push(r.value);
        return;
      }
      firstError ??= r.reason;
      const msg = r.reason instanceof Error ? r.reason.message : "Errore sconosciuto";
      this.logger.error(`Aggiunta di ${cidr} fallita sull'account ${accounts[i].accountId}: ${msg}`);
    });

    if (ok.length === 0) throw firstError;
    return ok;
  }

  private async addToAccountList(account: CloudflareAccount, cidr: string): Promise<CloudflareResponse> {
    const { accountId, listId, apiToken } = account;
    const url = `${this.API_URL}/${accountId}/rules/lists/${listId}/items`;

    const body = [{ ip: cidr, comment: this.options.comment }];

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
