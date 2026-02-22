// cloudflare-attacks.interfaces.ts
export interface CloudflareAttacksOptions {
  apiToken: string;
  accountId: string;
  listId: string;
  comment: string;
  logPath: string;
}

export interface CloudflareAttacksAsyncOptions {
  imports?: any[];
  inject?: any[];
  useFactory: (
    ...args: any[]
  ) => Promise<CloudflareAttacksOptions> | CloudflareAttacksOptions;
}
