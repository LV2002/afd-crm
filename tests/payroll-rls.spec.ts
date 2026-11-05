/**
 * Who can see pay: payroll, and the employee themselves. Not their manager,
 * and not a colleague. Enforced by the database, inside rolled-back transactions.
 */
import { config as loadEnv } from "dotenv";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

import { createTestUsers } from "./helpers/fixture-users";

const owner = postgres(process.env.DATABASE_URL, { max: 2 });
let cleanupUsers: (() => Promise<void>) | undefined;
afterAll(async () => {
  await cleanupUsers?.();
  await owner.end();
});
type Reserved = Awaited<ReturnType<typeof owner.reserve>>;

async function readAs<T>(userId: string, read: (tx: Reserved) => Promise<T>, u: Awaited<ReturnType<typeof users>>): Promise<T> {
  const tx = await owner.reserve();
  try {
    await tx`begin`;
    const [b] = await tx<Array<{ id: string }>>`insert into employees (emp_no, name, user_id) values ('PRLS-1', 'PR boss', ${u.boss}) returning id`;
    const [s] = await tx<Array<{ id: string }>>`insert into employees (emp_no, name, user_id, reports_to_id) values ('PRLS-2', 'PR staff', ${u.staff}, ${b.id}) returning id`;
    await tx`insert into employee_pay (employee_id, basic_paise) values (${s.id}, 3000000)`;
    await tx`insert into payslips (employee_id, month, inputs, result, base_components, net_paise, earnings_paise, sl_closing, cl_closing)
             values (${s.id}, '2026-10', '{}', '{}', '{}', 3000000, 3000000, 6, 6)`;
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
    return await read(tx);
  } finally {
    await tx`rollback`.catch(() => {});
    tx.release();
  }
}

let cached: { staff: string; boss: string; stranger: string; admin: string } | undefined;
async function users() {
  if (cached) return cached;
  const made = await createTestUsers(["counsellor", "counsellor", "counsellor", "hr"]);
  cleanupUsers = made.cleanup;
  cached = { staff: made.ids[0], boss: made.ids[1], stranger: made.ids[2], admin: made.ids[3] };
  return cached;
}

const seen = (tx: Reserved) => Promise.all([tx`select basic_paise from employee_pay`, tx`select net_paise from payslips`]);

describe("who can see pay", () => {
  it("shows an employee their own pay and payslips", async () => {
    const u = await users();
    const [pay, slips] = await readAs(u.staff, seen, u);
    expect(pay).toHaveLength(1);
    expect(slips).toHaveLength(1);
  });

  it("does not show a manager what their report earns", async () => {
    const u = await users();
    const [pay, slips] = await readAs(u.boss, seen, u);
    expect(pay).toHaveLength(0);
    expect(slips).toHaveLength(0);
  });

  it("shows a colleague nothing", async () => {
    const u = await users();
    const [pay, slips] = await readAs(u.stranger, seen, u);
    expect(pay).toHaveLength(0);
    expect(slips).toHaveLength(0);
  });

  it("shows payroll everybody's", async () => {
    const u = await users();
    const [pay, slips] = await readAs(u.admin, seen, u);
    expect(pay).toHaveLength(1);
    expect(slips).toHaveLength(1);
  });

  it("lets nobody change a payslip or a pay rate through the API", async () => {
    const u = await users();
    const after = await readAs(u.admin, async (tx) => {
      await tx`update payslips set net_paise = 1`;
      await tx`update employee_pay set basic_paise = 1`;
      return Promise.all([tx`select net_paise from payslips`, tx`select basic_paise from employee_pay`]);
    }, u);
    expect(Number(after[0][0].net_paise)).toBe(3000000);
    expect(Number(after[1][0].basic_paise)).toBe(3000000);
  });
});
