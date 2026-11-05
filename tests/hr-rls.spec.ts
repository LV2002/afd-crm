/**
 * Who can see an employee's HR rows, enforced by the database and not by the
 * page: HR, the employee, and their manager, and nobody else. Simulates what
 * PostgREST does per request, inside transactions that are always rolled back.
 */
import { config as loadEnv } from "dotenv";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const owner = postgres(process.env.DATABASE_URL, { max: 2 });
afterAll(() => owner.end());

type Reserved = Awaited<ReturnType<typeof owner.reserve>>;

/** Sets up fixtures as the owner, then reads as `userId`, all rolled back. */
async function readAs<T>(
  userId: string,
  setup: (tx: Reserved) => Promise<void>,
  read: (tx: Reserved) => Promise<T>,
): Promise<T> {
  const tx = await owner.reserve();
  try {
    await tx`begin`;
    await setup(tx);
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
    return await read(tx);
  } finally {
    await tx`rollback`.catch(() => {});
    tx.release();
  }
}

async function users() {
  const rows = await owner<Array<{ id: string; code: string }>>`
    select p.id, r.code from profiles p join roles r on r.id = p.role_id where p.is_active order by p.created_at
  `;
  const plain = rows.filter((r) => r.code === "counsellor");
  const hr = rows.find((r) => r.code === "co_admin");
  if (plain.length < 3 || !hr) throw new Error("Needs three counsellors and a co-admin in the test database.");
  return { staff: plain[0].id, boss: plain[1].id, stranger: plain[2].id, hr: hr.id };
}

async function fixtures(tx: Reserved, u: Awaited<ReturnType<typeof users>>) {
  const [b] = await tx<Array<{ id: string }>>`
    insert into employees (emp_no, name, user_id) values ('RLS-1', 'RLS boss', ${u.boss}) returning id`;
  const [s] = await tx<Array<{ id: string }>>`
    insert into employees (emp_no, name, user_id, reports_to_id) values ('RLS-2', 'RLS staff', ${u.staff}, ${b.id}) returning id`;
  await tx`insert into leave_requests (employee_id, kind, from_date, to_date, days) values (${s.id}, 'casual', '2026-11-02', '2026-11-02', 1)`;
}

describe("HR visibility", () => {
  it("lets an employee see themselves and their own leave", async () => {
    const u = await users();
    const [emp, leave] = await readAs(u.staff, (tx) => fixtures(tx, u), async (tx) => [
      await tx`select name from employees where emp_no like 'RLS-%' order by emp_no`,
      await tx`select id from leave_requests`,
    ]);
    expect(emp.map((e) => e.name)).toEqual(["RLS staff"]);
    expect(leave).toHaveLength(1);
  });

  it("lets a manager see themselves and their reports", async () => {
    const u = await users();
    const [emp, leave] = await readAs(u.boss, (tx) => fixtures(tx, u), async (tx) => [
      await tx`select name from employees where emp_no like 'RLS-%' order by emp_no`,
      await tx`select id from leave_requests`,
    ]);
    expect(emp.map((e) => e.name)).toEqual(["RLS boss", "RLS staff"]);
    expect(leave).toHaveLength(1);
  });

  it("shows HR everybody", async () => {
    const u = await users();
    const emp = await readAs(u.hr, (tx) => fixtures(tx, u), (tx) => tx`select name from employees where emp_no like 'RLS-%'`);
    expect(emp).toHaveLength(2);
  });

  it("shows a colleague with no connection nothing at all", async () => {
    const u = await users();
    const [emp, leave] = await readAs(u.stranger, (tx) => fixtures(tx, u), async (tx) => [
      await tx`select name from employees where emp_no like 'RLS-%'`,
      await tx`select id from leave_requests`,
    ]);
    expect(emp).toHaveLength(0);
    expect(leave).toHaveLength(0);
  });

  it("lets nobody write straight through the API, whoever they are", async () => {
    const u = await users();
    await expect(
      readAs(u.hr, (tx) => fixtures(tx, u), (tx) => tx`insert into employees (emp_no, name) values ('RLS-9', 'sneaky')`),
    ).rejects.toThrow();
    await expect(
      readAs(u.staff, (tx) => fixtures(tx, u), (tx) => tx`update leave_requests set status = 'approved'`),
    ).resolves.toBeDefined();
    const after = await readAs(
      u.staff,
      (tx) => fixtures(tx, u),
      async (tx) => {
        await tx`update leave_requests set status = 'approved'`;
        return tx`select status from leave_requests`;
      },
    );
    expect(after[0].status).toBe("pending");
  });
});
