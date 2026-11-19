import { of } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { AttacksService } from "./attacks.service";
import type { HttpService } from "@nestjs/axios";

// Niente rete: i controlli Cloudflare/Googlebot rispondono "non è loro"
vi.mock("./utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./utils")>()),
  isCloudflareIp: async () => false,
  isGoogleBotIp: async () => false,
  googleBotOverlapsCidr: async () => false,
}));

function service(asn?: string) {
  const data = asn
    ? { asn, asn_name: "X, IT", asn_range: "93.40.192.0/18", ip: "93.40.197.153" }
    : { error: "API count exceeded - Increase Quota with Membership" };
  const http = {
    get: vi.fn(() => of({ data })),
    post: vi.fn(() => of({ data: { success: true } })),
  };
  const options = { accounts: [{ accountId: "a", listId: "l", apiToken: "t" }], comment: "c", logPath: "x" };
  return { srv: new AttacksService(http as unknown as HttpService, options as never), http };
}

describe("AttacksService.blockIp", () => {
  it("non banna gli IP dei provider italiani", async () => {
    const { srv, http } = service("12874"); // Fastweb
    expect(await srv.blockIp("93.40.197.153")).toBeNull();
    expect(http.post).not.toHaveBeenCalled();
  });

  it("non banna gli IP Cloudflare fuori dalle liste del proxy (es. 1.1.1.1)", async () => {
    const { srv, http } = service("13335");
    expect(await srv.blockIp("1.1.1.1")).toBeNull();
    expect(http.post).not.toHaveBeenCalled();
  });

  it("non banna se l'ASN non è disponibile (quota hackertarget esaurita)", async () => {
    const { srv, http } = service();
    expect(await srv.blockIp("93.40.197.153")).toBeNull();
    expect(http.post).not.toHaveBeenCalled();
  });

  it("banna il range ASN degli altri provider", async () => {
    const { srv, http } = service("64496");
    await srv.blockIp("93.40.197.153");
    expect(http.post).toHaveBeenCalledWith(expect.stringContaining("/rules/lists/l/items"), [
      { ip: "93.40.192.0/18", comment: "c" },
    ], expect.anything());
  });
});
