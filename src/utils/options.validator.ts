import type { CloudflareAttacksOptions } from "../interfaces";

export function validateOptions(opzioni: CloudflareAttacksOptions): void {
  if (!opzioni) throw new Error("CloudflareAttacksOptions è obbligatorio");

  const campiObbligatori: (keyof CloudflareAttacksOptions)[] = ["apiToken", "accountId", "listId", "comment", "logPath"];

  for (const campo of campiObbligatori) {
    const valore = opzioni[campo];
    if (typeof valore !== "string" || valore.trim().length === 0) {
      throw new Error(`CloudflareAttacksOptions.${campo} deve essere una stringa non vuota`);
    }
  }
}
