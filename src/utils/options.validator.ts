import type { CloudflareAccount, CloudflareAttacksOptions } from "../interfaces";

function isNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateOptions(opzioni: CloudflareAttacksOptions): void {
  if (!opzioni) throw new Error("CloudflareAttacksOptions è obbligatorio");

  const campiObbligatori: (keyof CloudflareAttacksOptions)[] = ["comment", "logPath"];

  for (const campo of campiObbligatori) {
    if (!isNonEmptyString(opzioni[campo])) {
      throw new Error(`CloudflareAttacksOptions.${campo} deve essere una stringa non vuota`);
    }
  }

  if (!Array.isArray(opzioni.accounts) || opzioni.accounts.length === 0) {
    throw new Error("CloudflareAttacksOptions.accounts deve essere un array non vuoto");
  }

  const campiAccount: (keyof CloudflareAccount)[] = ["apiToken", "accountId", "listId"];

  opzioni.accounts.forEach((account, i) => {
    for (const campo of campiAccount) {
      if (!isNonEmptyString(account?.[campo])) {
        throw new Error(`CloudflareAttacksOptions.accounts[${i}].${campo} deve essere una stringa non vuota`);
      }
    }
  });

  const provider = opzioni.notifyProvider;
  if (provider !== undefined && provider !== "whatsapp" && provider !== "telegram") {
    throw new Error(`CloudflareAttacksOptions.notifyProvider deve essere "whatsapp" o "telegram"`);
  }
}
