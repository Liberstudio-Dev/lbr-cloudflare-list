// cloudflare-attacks.interfaces.ts
export interface WhatsappNotifyOptions {
  phone: string;
}

export interface CloudflareAttacksOptions {
  apiToken: string;
  accountId: string;
  listId: string;
  comment: string;
  logPath: string;
  allowedIps?: string[];
  excludedPaths?: (string | RegExp)[];
  silentPaths?: (string | RegExp)[];
  verbose?: boolean;
  whatsappNotify?: WhatsappNotifyOptions;
}

export interface CloudflareAttacksAsyncOptions {
  imports?: any[];
  inject?: any[];
  useFactory: (
    ...args: any[]
  ) => Promise<CloudflareAttacksOptions> | CloudflareAttacksOptions;
}
