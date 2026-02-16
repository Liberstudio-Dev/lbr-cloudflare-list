// attacks.service.ts
import { HttpException, Injectable, Logger, Inject } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import axios from "axios";

import { firstValueFrom } from "rxjs";

import type {
  CloudflareAttacksOptions,
  CloudflareErrorData,
  CloudflareResponse,
} from "./interfaces";

@Injectable()
export class AttacksService {
  private readonly logger = new Logger("AttackLogger");
  private readonly API_URL = `https://api.cloudflare.com/client/v4/accounts`;

  constructor(
    private readonly httpService: HttpService,
    @Inject("CLOUDFLARE_OPTIONS")
    private readonly options: CloudflareAttacksOptions,
  ) {}

  async updateIpList(ip: string) {
    const apiToken = this.options.apiToken.trim();
    const accountId = this.options.accountId.trim();
    const listId = this.options.listId.trim();
    const comment = this.options.comment || "Auto-blocked";

    const url = `${this.API_URL}/${accountId}/rules/lists/${listId}/items`;

    this.logger.error(`Aggiungo IP ${ip} alla lista Cloudflare`);

    const formattedIp = ip.includes("/") ? ip : `${ip}/32`;
    const body = [{ ip: formattedIp, comment }];

    try {
      const response = await axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
          Accept: "application/json", // Aggiungi questo esplicitamente
        },
      });

      return response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const data = error.response?.data as CloudflareErrorData | undefined;

        const message: string =
          data?.errors?.[0]?.message || "Errore Cloudflare API";
        const status: number = error.response?.status || 500;

        throw new HttpException(message, status);
      }

      throw new HttpException("Internal Server Error", 500);
    }
  }
}
