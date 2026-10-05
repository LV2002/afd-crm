/**
 * Who may do what, asserted against the seeded role bundles.
 *
 * Roles are database rows an admin can edit, so this is not a claim about
 * what any particular installation allows. It is a claim about what the
 * system ships believing, which is the thing a future change can break
 * silently: adding one line to a bundle in `seed.ts` is easy, and nothing
 * else in the suite would notice.
 *
 * Pure — it reads the seed definitions, not the database — so it says
 * nothing about whether a given instance has been re-seeded.
 */
import { describe, expect, it } from "vitest";

import { ROLE_SEEDS } from "../src/lib/db/role-seeds";

function grantsOf(code: string): string[] {
  const role = ROLE_SEEDS.find((candidate) => candidate.code === code);
  if (!role) throw new Error(`No seeded role named ${code}`);
  return role.grants.map((entry) => entry.code);
}

describe("the course is academics' to change", () => {
  it("gives academics the course, as well as the batch", () => {
    const academics = grantsOf("academics");
    expect(academics).toContain("enrolment.change_course");
    expect(academics).toContain("enrolment.change_plan");
  });

  it("gives accounts the batch but not the course", () => {
    // The whole point of splitting the two primitives. Accounts correct
    // fees, batches, modes and years; what a student is actually studying
    // is not theirs to move, and the fee does not follow a course change
    // anyway — they are told, and decide about the money deliberately.
    const accounts = grantsOf("accounts");
    expect(accounts).toContain("enrolment.change_plan");
    expect(accounts).not.toContain("enrolment.change_course");
  });

  it("gives a centre head the batch but not the course", () => {
    const centreHead = grantsOf("center_head");
    expect(centreHead).toContain("enrolment.change_plan");
    expect(centreHead).not.toContain("enrolment.change_course");
  });

  it("keeps it with admin and co-admin, who hold everything", () => {
    // Not an exception made for them: both bundles are defined as "all
    // primitives", so a new one joins automatically. Asserted so that a
    // future change which narrows those bundles has to do it on purpose.
    expect(grantsOf("admin")).toContain("enrolment.change_course");
    expect(grantsOf("co_admin")).toContain("enrolment.change_course");
  });

  it("lets a counsellor fix a batch but not the course", () => {
    // A counsellor already held `enrolment.change_plan` before the split,
    // and nothing here takes it away: they sold the admission and moving
    // somebody to the Thursday group is ordinary work. The course is the
    // part that now needs academics.
    const counsellor = grantsOf("counsellor");
    expect(counsellor).toContain("enrolment.change_plan");
    expect(counsellor).not.toContain("enrolment.change_course");
  });
});
