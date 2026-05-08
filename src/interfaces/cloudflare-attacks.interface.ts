// cloudflare-attacks.interfaces.ts
export interface CloudflareAttacksOptions {
  apiToken: string;
  accountId: string;
  listId: string;
  comment: string;
  logPath: string;
  excludedPaths?: (string | RegExp)[];
  silentPaths?: (string | RegExp)[];
  verbose?: boolean;
}

export interface CloudflareAttacksAsyncOptions {
  imports?: any[];
  inject?: any[];
  useFactory: (
    ...args: any[]
  ) => Promise<CloudflareAttacksOptions> | CloudflareAttacksOptions;
}
