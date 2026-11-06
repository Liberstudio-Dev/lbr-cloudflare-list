// cloudflare-attacks.interfaces.ts
export interface WhatsappNotifyOptions {
  phone: string;
}

export interface TelegramNotifyOptions {
  chatId: string;
}

export type NotifyProvider = "whatsapp" | "telegram";

export interface CloudflareAccount {
  apiToken: string;
  accountId: string;
  listId: string;
}

export interface CloudflareAttacksOptions {
  accounts: CloudflareAccount[];
  comment: string;
  logPath: string;
  allowedIps?: string[];
  excludedPaths?: (string | RegExp)[];
  silentPaths?: (string | RegExp)[];
  verbose?: boolean;
  whatsappNotify?: WhatsappNotifyOptions;
  telegramNotify?: TelegramNotifyOptions;
  notifyProvider?: NotifyProvider;
}

export interface CloudflareAttacksAsyncOptions {
  imports?: any[];
  inject?: any[];
  useFactory: (
    ...args: any[]
  ) => Promise<CloudflareAttacksOptions> | CloudflareAttacksOptions;
}
