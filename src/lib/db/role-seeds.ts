import { PERMISSIONS, type PermissionCode, type PermissionScope } from "../auth/permissions";

/**
 * The six roles the system ships with, and what each may do.
 *
 * Lifted out of `seed.ts` so it can be read without running it — that
 * file calls `main()` on import and exits the process, which makes
 * "assert that accounts cannot change a course" impossible to write. The
 * seed still owns writing these rows; this owns stating them.
 *
 * They are **seed** definitions, not the rules. Roles are database rows
 * an admin edits in Settings → Roles, so what any particular installation
 * allows is a question for its database. This is only what a fresh one
 * believes on its first day.
 */
export interface RoleSeed {
  code: string;
  name: string;
  description: string;
  isProtected: boolean;
  grants: Array<{ code: PermissionCode; scope: PermissionScope }>;
}

const ALL_PERMISSION_CODES = PERMISSIONS.map((p) => p.code);

function allAt(scope: PermissionScope) {
  return ALL_PERMISSION_CODES.map((code) => ({ code, scope }));
}

/**
 * Everything except a named few — for co-admin, which is "everything the
 * admin can do" with the deliberate exception of handing over somebody
 * else's identity by setting their password. Leon asked for password
 * resets to be the admin's alone; this is where that is expressed, and it
 * stays an ordinary editable grant he can turn on in Settings → Roles.
 */
function allExcept(excluded: PermissionCode[], scope: PermissionScope) {
  const skip = new Set<string>(excluded);
  return ALL_PERMISSION_CODES.filter((code) => !skip.has(code)).map((code) => ({ code, scope }));
}

function grant(codes: PermissionCode[], scope: PermissionScope) {
  return codes.map((code) => ({ code, scope }));
}

export const ROLE_SEEDS: RoleSeed[] = [
  {
    code: "admin",
    name: "Admin",
    description: "Full access to everything. Protected — cannot be deleted or stripped.",
    isProtected: true,
    grants: allAt("all"),
  },
  {
    code: "co_admin",
    name: "Co-Admin",
    description:
      "Deputy admin. Full operational and configuration access, except resetting passwords.",
    isProtected: false,
    grants: allExcept(["user.reset_password", "audit.read"], "all"),
  },
  {
    code: "center_head",
    name: "Centre Head",
    description: "Runs one or more centres: leads, staff and reporting for their own centre(s).",
    isProtected: false,
    grants: [
      ...grant(
        [
          "lead.read",
          "lead.create",
          "lead.update",
          "lead.assign",
          "lead.merge",
          "lead.export",
          "lead.reveal_phone",
          "lead.import",
          "interaction.read",
          "interaction.create",
          "whatsapp.read",
          "whatsapp.send",
          "file.read",
          "file.upload",
          "file.delete",
          "enrolment.read",
          "enrolment.create",
          "enrolment.update",
          "enrolment.change_plan",
          "enrolment.drop",
          "payment.read",
          "discount.approve",
          // Leon's requirement: a centre head sees their own centre's
          // finance. They can post day-to-day entries but not add
          // accounts or reverse a posted one — that stays with accounts
          // and the admins.
          "finance.read",
          "finance.record",
          "student.read",
          "batch.manage",
          "report.read",
          "report.center",
          // A centre head sets their centre's numbers for the month and
          // splits them between their counsellors. Scoped to "center", so
          // the institute-wide target stays out of reach.
          "target.manage",
          "users.manage",
          // No `audit.read`. It cannot be scoped to a centre — audit_log
          // has no center_id and a row about a role change belongs to no
          // centre — so a centre-scoped grant read the whole institute's
          // log. Leon's call: the audit trail is the admin's. See
          // migration 0066.
        ],
        "center",
      ),
    ],
  },
  {
    code: "counsellor",
    name: "Counsellor",
    description: "Owns and works their own leads.",
    isProtected: false,
    grants: [
      ...grant(
        [
          "lead.read",
          "lead.create",
          "lead.update",
          "lead.reveal_phone",
          "interaction.read",
          "interaction.create",
          "whatsapp.read",
          "whatsapp.send",
          "file.read",
          "file.upload",
          "enrolment.read",
          "enrolment.create",
          // Moving a student they sold from one course or batch to
          // another. Not `enrolment.update`: the fee stays with accounts
          // and the people who hold the discount limits.
          "enrolment.change_plan",
          "payment.read",
          "report.read",
        ],
        "own",
      ),
    ],
  },
  {
    code: "accounts",
    name: "Accounts",
    description: "Fee collection, payments and the ledger, scoped to their centre(s).",
    isProtected: false,
    grants: [
      ...grant(
        [
          "lead.read",
          "lead.reveal_phone",
          "interaction.read",
          "file.read",
          "file.upload",
          "payment.read",
          "payment.record",
          "payment.refund",
          "discount.approve",
          "finance.read",
          "finance.record",
          "finance.manage",
          "enrolment.read",
          // Correcting a fee that was agreed wrongly is accounts' work,
          // and before this it had to go through a centre head.
          "enrolment.update",
          "enrolment.change_plan",
          "enrolment.drop",
          "student.read",
          "report.read",
          "report.center",
          // No `audit.read` — same reason as center_head above.
        ],
        "center",
      ),
    ],
  },
  {
    code: "academics",
    name: "Academics",
    description: "Course delivery: students and batches, scoped to their centre(s).",
    isProtected: false,
    grants: [
      ...grant(
        [
          "student.read",
          "student.update",
          "batch.manage",
          "file.read",
          "file.upload",
          "enrolment.read",
          // The team actually teaching them moves people between courses
          // and batches more often than anyone else does.
          "enrolment.change_plan",
          // Theirs alone (with admin and co-admin): the course decides
          // which room and which syllabus, so it is not accounts' to move.
          "enrolment.change_course",
          "report.read",
          "report.center",
        ],
        "center",
      ),
    ],
  },
];
