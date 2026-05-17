// attacks.service.ts
import { HttpException, Injectable, Logger, Inject } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import axios from "axios";

import { firstValueFrom } from "rxjs";

import { CLOUDFLARE_OPTIONS, isCloudflareIp, normalizeIp } from "./utils";

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
    if (await isCloudflareIp(rawIp)) {
      this.logger.log(`IP ${rawIp} appartiene al range Cloudflare — ban saltato`);
      return null;
    }

    const asnRange = await this.lookupAsnRange(rawIp);

    if (asnRange) {
      this.logger.log(`ASN range trovato per ${rawIp}: ${asnRange} — blocco intera subnet`);
      return this.updateIpList(asnRange);
    }

    const cidr = normalizeIp(rawIp);
    if (!cidr) throw new Error(`IP non valido: ${rawIp}`);
    return this.updateIpList(cidr);
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

    this.logger.log(`Aggiungo ${cidr} alla lista Cloudflare`);

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
