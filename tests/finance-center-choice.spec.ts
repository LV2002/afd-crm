import { beforeEach, describe, expect, it, vi } from "vitest";

// The cookie jar the action writes to, recording what it was told to do.
const written: Array<{ op: "set" | "delete"; name: string; value?: string; options?: Record<string, unknown> }> = [];
const jar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      jar.set(name, value);
      written.push({ op: "set", name, value, options });
    },
    delete: (name: string) => {
      jar.delete(name);
      written.push({ op: "delete", name });
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => ({ id: "u", permissions: { "finance.read": "all" } }),
  can: () => true,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => ({
      select: () => ({
        is: async () => ({ data: [{ center_id: "kannur" }, { center_id: "kochi" }] }),
        in: () => ({ order: async () => ({ data: [{ id: "kannur", name: "Kannur" }, { id: "kochi", name: "Kochi" }] }) }),
      }),
      _table: table,
    }),
  }),
}));

const { setFinanceCenter } = await import("../src/lib/finance/center-actions");
const { getFinanceCenterId } = await import("../src/lib/finance/center-filter");
const { createClient } = await import("@/lib/supabase/server");

beforeEach(() => {
  jar.clear();
  written.length = 0;
});

describe("choosing a centre on the finance screens", () => {
  it("remembers a centre that was picked", async () => {
    await setFinanceCenter("kannur");
    expect(await getFinanceCenterId(await createClient() as never)).toBe("kannur");
  });

  it("goes back to all centres when All centres is picked after a centre", async () => {
    await setFinanceCenter("kannur");
    await setFinanceCenter("");
    // The old behaviour deleted the cookie without its path, so Kannur stayed.
    expect(await getFinanceCenterId(await createClient() as never)).toBeUndefined();
    expect(written.some((w) => w.op === "delete")).toBe(false);
  });

  it("switches from one centre to another without falling back to the first", async () => {
    await setFinanceCenter("kannur");
    await setFinanceCenter("kochi");
    expect(await getFinanceCenterId(await createClient() as never)).toBe("kochi");
  });

  it("writes every choice at the finance path and only for the browser session", async () => {
    await setFinanceCenter("kochi");
    await setFinanceCenter("");
    for (const w of written) {
      expect(w.options).toMatchObject({ path: "/finance" });
      expect(w.options).not.toHaveProperty("maxAge");
    }
  });

  it("starts at all centres when nothing has been chosen", async () => {
    expect(await getFinanceCenterId(await createClient() as never)).toBeUndefined();
  });
});
