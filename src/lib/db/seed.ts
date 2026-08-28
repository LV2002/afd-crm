/**
 * Phase 0 seed. Idempotent — safe to re-run.
 *
 * Run with: npm run db:seed
 * Requires DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY in the environment (.env.local is loaded).
 */
import "./load-env";

import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";

import { PERMISSIONS, type PermissionCode, type PermissionScope } from "../auth/permissions";
import { ensurePermissionsSeeded } from "../auth/seed-permissions";
import { db } from "./client";
import {
  centers,
  dropdownCategories,
  dropdownOptions,
  fieldDefinitions,
  orgSettings,
  pipelineStages,
  profiles,
  roles,
  rolePermissions,
  terminology,
  userCenters,
} from "./schema";

const SEED_PASSWORD = "AfdCrm2026!";

async function seedOrgSettings() {
  const existing = await db.select().from(orgSettings).limit(1);
  if (existing.length > 0) return;

  await db.insert(orgSettings).values({
    name: "AFD India",
    primaryColor: "#0f172a",
    timezone: "Asia/Kolkata",
    currency: "INR",
    locale: "en-IN",
    fiscalYearStartMonth: 4,
    dateFormat: "dd/MM/yyyy",
  });
  console.log("seeded org_settings");
}

async function seedTerminology() {
  const rows = [
    { key: "lead", singular: "Lead", plural: "Leads" },
    { key: "student", singular: "Student", plural: "Students" },
    { key: "counsellor", singular: "Counsellor", plural: "Counsellors" },
    { key: "center", singular: "Centre", plural: "Centres" },
    { key: "course", singular: "Course", plural: "Courses" },
    { key: "exam", singular: "Exam", plural: "Exams" },
  ];

  for (const row of rows) {
    await db
      .insert(terminology)
      .values(row)
      .onConflictDoUpdate({
        target: terminology.key,
        set: { singular: row.singular, plural: row.plural },
      });
  }
  console.log(`seeded ${rows.length} terminology rows`);
}

const CENTER_SEEDS = [
  { name: "Kochi", city: "Kochi", timezone: "Asia/Kolkata" },
  { name: "Kannur", city: "Kannur", timezone: "Asia/Kolkata" },
] as const;

async function seedCenters() {
  const result: Record<string, string> = {};
  for (const center of CENTER_SEEDS) {
    const [row] = await db
      .insert(centers)
      .values(center)
      .onConflictDoNothing()
      .returning({ id: centers.id, name: centers.name });

    if (row) {
      result[row.name] = row.id;
    } else {
      const [existing] = await db
        .select({ id: centers.id, name: centers.name })
        .from(centers)
        .where(eq(centers.name, center.name));
      if (existing) result[existing.name] = existing.id;
    }
  }
  console.log(`seeded ${CENTER_SEEDS.length} centers`);
  return result;
}

async function seedPermissions() {
  await ensurePermissionsSeeded(db);
  console.log(`seeded ${PERMISSIONS.length} permissions`);
}

interface RoleSeed {
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

function grant(codes: PermissionCode[], scope: PermissionScope) {
  return codes.map((code) => ({ code, scope }));
}

const ROLE_SEEDS: RoleSeed[] = [
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
    description: "Deputy admin. Full operational and configuration access.",
    isProtected: false,
    grants: allAt("all"),
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
          "enrolment.read",
          "enrolment.create",
          "enrolment.update",
          "payment.read",
          "discount.approve",
          "student.read",
          "batch.manage",
          "report.read",
          "report.center",
          "ai.query",
          "users.manage",
          "audit.read",
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
          "enrolment.read",
          "enrolment.create",
          "payment.read",
          "report.read",
          "ai.query",
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
          "payment.read",
          "payment.record",
          "payment.refund",
          "discount.approve",
          "enrolment.read",
          "student.read",
          "report.read",
          "report.center",
          "audit.read",
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
          "enrolment.read",
          "report.read",
          "report.center",
          "ai.query",
        ],
        "center",
      ),
    ],
  },
];

async function seedRoles() {
  const roleIds: Record<string, string> = {};

  for (const role of ROLE_SEEDS) {
    const [row] = await db
      .insert(roles)
      .values({
        code: role.code,
        name: role.name,
        description: role.description,
        isSystem: true,
        isProtected: role.isProtected,
      })
      .onConflictDoUpdate({
        target: roles.code,
        set: { name: role.name, description: role.description },
      })
      .returning({ id: roles.id, code: roles.code });

    if (row) {
      roleIds[row.code] = row.id;
    } else {
      const [existing] = await db
        .select({ id: roles.id, code: roles.code })
        .from(roles)
        .where(eq(roles.code, role.code));
      if (existing) roleIds[existing.code] = existing.id;
    }
  }

  for (const role of ROLE_SEEDS) {
    const roleId = roleIds[role.code];
    for (const g of role.grants) {
      await db
        .insert(rolePermissions)
        .values({ roleId, permissionCode: g.code, scope: g.scope })
        .onConflictDoUpdate({
          target: [rolePermissions.roleId, rolePermissions.permissionCode],
          set: { scope: g.scope },
        });
    }
  }

  console.log(`seeded ${ROLE_SEEDS.length} roles`);
  return roleIds;
}

interface DropdownSeed {
  key: string;
  label: string;
  isSystem: boolean;
  options: Array<{
    value: string;
    label: string;
    color?: string;
    metadata?: Record<string, unknown>;
  }>;
}

const DROPDOWN_SEEDS: DropdownSeed[] = [
  {
    key: "temperature",
    label: "Temperature",
    isSystem: true,
    options: [
      { value: "hot", label: "Hot", color: "#dc2626", metadata: { rank: 4, is_terminal: false } },
      { value: "warm", label: "Warm", color: "#f97316", metadata: { rank: 3, is_terminal: false } },
      { value: "cold", label: "Cold", color: "#0ea5e9", metadata: { rank: 2, is_terminal: false } },
      { value: "dead", label: "Dead", color: "#6b7280", metadata: { rank: 1, is_terminal: true } },
    ],
  },
  {
    key: "lead_source",
    label: "Lead source",
    isSystem: true,
    options: [
      { value: "meta", label: "Meta" },
      { value: "google", label: "Google" },
      { value: "website", label: "Website" },
      { value: "walk_in", label: "Walk-in" },
      { value: "referral", label: "Referral" },
      { value: "purchased_database", label: "Purchased Database" },
      { value: "knorish", label: "Knorish" },
      { value: "whatsapp", label: "WhatsApp" },
      { value: "other", label: "Other" },
    ],
  },
  {
    key: "exam",
    label: "Exam",
    isSystem: true,
    options: [
      { value: "nid", label: "NID" },
      { value: "nift_ug", label: "NIFT UG" },
      { value: "nift_mdes", label: "NIFT MDes" },
      { value: "uceed", label: "UCEED" },
      { value: "ceed", label: "CEED" },
      { value: "nata", label: "NATA" },
      { value: "jee_paper_2", label: "JEE Paper 2" },
    ],
  },
  {
    key: "course",
    label: "Course",
    isSystem: true,
    options: [
      { value: "foundation", label: "Foundation" },
      { value: "dwo", label: "DWO" },
      { value: "dao", label: "DAO" },
      { value: "drh", label: "DRH" },
      { value: "crash", label: "Crash" },
      { value: "repeat_batch", label: "Repeat Batch" },
      { value: "mdes", label: "MDes" },
      { value: "consultancy", label: "Consultancy" },
    ],
  },
  {
    key: "education_status",
    label: "Education status",
    isSystem: false,
    options: [
      { value: "10th", label: "10th" },
      { value: "11th", label: "11th" },
      { value: "12th", label: "12th" },
      { value: "12th_pass", label: "12th Pass" },
      { value: "diploma", label: "Diploma" },
      { value: "graduate", label: "Graduate" },
      { value: "other", label: "Other" },
    ],
  },
  {
    key: "preferred_mode",
    label: "Preferred mode",
    isSystem: false,
    options: [
      { value: "online", label: "Online" },
      { value: "offline", label: "Offline" },
      { value: "hybrid", label: "Hybrid" },
    ],
  },
  {
    key: "gender",
    label: "Gender",
    isSystem: false,
    options: [
      { value: "male", label: "Male" },
      { value: "female", label: "Female" },
      { value: "other", label: "Other" },
      { value: "prefer_not_to_say", label: "Prefer not to say" },
    ],
  },
  {
    key: "lost_reason",
    label: "Lost reason",
    isSystem: true,
    options: [
      { value: "not_interested", label: "Not Interested" },
      { value: "budget_constraint", label: "Budget Constraint" },
      { value: "joined_competitor", label: "Joined Competitor" },
      { value: "not_reachable", label: "Not Reachable" },
      { value: "wrong_number", label: "Wrong Number" },
      { value: "other", label: "Other" },
    ],
  },
  {
    key: "consent_status",
    label: "Consent status",
    isSystem: true,
    options: [
      { value: "given", label: "Given" },
      { value: "withdrawn", label: "Withdrawn" },
      { value: "pending", label: "Pending" },
    ],
  },
  {
    key: "payment_method",
    label: "Payment method",
    isSystem: true,
    options: [
      { value: "cash", label: "Cash" },
      { value: "upi", label: "UPI" },
      { value: "card", label: "Card" },
      { value: "neft", label: "NEFT" },
      { value: "cheque", label: "Cheque" },
      { value: "other", label: "Other" },
    ],
  },
  {
    key: "interaction_type",
    label: "Interaction type",
    isSystem: true,
    options: [
      { value: "call", label: "Call" },
      { value: "whatsapp", label: "WhatsApp" },
      { value: "email", label: "Email" },
      { value: "sms", label: "SMS" },
      { value: "walk_in", label: "Walk-in" },
      { value: "meeting", label: "Meeting" },
      { value: "note", label: "Note" },
    ],
  },
  {
    key: "interaction_outcome",
    label: "Interaction outcome",
    isSystem: true,
    options: [
      { value: "connected", label: "Connected" },
      { value: "not_reachable", label: "Not Reachable" },
      { value: "call_back_later", label: "Call Back Later" },
      { value: "interested", label: "Interested" },
      { value: "not_interested", label: "Not Interested" },
      { value: "demo_scheduled", label: "Demo Scheduled" },
      { value: "converted", label: "Converted" },
    ],
  },
  {
    key: "task_type",
    label: "Task type",
    isSystem: true,
    options: [
      { value: "follow_up_call", label: "Follow-up Call" },
      { value: "send_brochure", label: "Send Brochure" },
      { value: "document_collection", label: "Document Collection" },
      { value: "demo", label: "Demo" },
      { value: "other", label: "Other" },
    ],
  },
];

async function seedDropdowns() {
  for (const category of DROPDOWN_SEEDS) {
    await db
      .insert(dropdownCategories)
      .values({ key: category.key, label: category.label, isSystem: category.isSystem })
      .onConflictDoUpdate({
        target: dropdownCategories.key,
        set: { label: category.label, isSystem: category.isSystem },
      });

    for (const [index, option] of category.options.entries()) {
      await db
        .insert(dropdownOptions)
        .values({
          category: category.key,
          value: option.value,
          label: option.label,
          sortOrder: index,
          color: option.color,
          metadata: option.metadata,
        })
        .onConflictDoUpdate({
          target: [dropdownOptions.category, dropdownOptions.value],
          set: { label: option.label, sortOrder: index, color: option.color, metadata: option.metadata },
        });
    }
  }
  console.log(`seeded ${DROPDOWN_SEEDS.length} dropdown categories`);
}

interface StageSeed {
  name: string;
  stageType: (typeof pipelineStages.$inferInsert)["stageType"];
  probability: string;
  slaHours?: number;
  requiresReason?: boolean;
}

const STAGE_SEEDS: StageSeed[] = [
  { name: "New Lead", stageType: "new", probability: "5" },
  { name: "Contacted", stageType: "normal", probability: "10", slaHours: 4 },
  { name: "Qualified", stageType: "normal", probability: "20", slaHours: 24 },
  { name: "Demo Scheduled", stageType: "scheduled", probability: "35", slaHours: 48 },
  { name: "Demo Completed", stageType: "normal", probability: "45", slaHours: 24 },
  { name: "Counselling Done", stageType: "normal", probability: "55", slaHours: 48 },
  { name: "Brochure Sent", stageType: "normal", probability: "40", slaHours: 72 },
  { name: "Follow-up", stageType: "normal", probability: "50", slaHours: 72 },
  { name: "Registration Form Sent", stageType: "enrolment_form", probability: "65", slaHours: 48 },
  { name: "Registration Form Submitted", stageType: "enrolment_form", probability: "80" },
  { name: "Payment Pending", stageType: "payment", probability: "90", slaHours: 24 },
  { name: "Admission Confirmed", stageType: "won", probability: "100" },
  { name: "Lost", stageType: "lost", probability: "0", requiresReason: true },
  { name: "Parked", stageType: "parked", probability: "15" },
];

async function seedPipelineStages() {
  for (const [index, stage] of STAGE_SEEDS.entries()) {
    const existing = await db
      .select({ id: pipelineStages.id })
      .from(pipelineStages)
      .where(eq(pipelineStages.name, stage.name));

    if (existing.length > 0) continue;

    await db.insert(pipelineStages).values({
      name: stage.name,
      sortOrder: index,
      stageType: stage.stageType,
      probability: stage.probability,
      slaHours: stage.slaHours,
      requiresReason: stage.requiresReason ?? false,
    });
  }
  console.log(`seeded ${STAGE_SEEDS.length} pipeline stages`);
}

interface FieldSeed {
  key: string;
  label: string;
  type: (typeof fieldDefinitions.$inferInsert)["type"];
  section: string;
  isRequired?: boolean;
  showInList?: boolean;
  showInFilters?: boolean;
  options?: Array<{ value: string; label: string }>;
}

const LEAD_FIELD_SEEDS: FieldSeed[] = [
  // Personal
  { key: "student_name", label: "Student Name", type: "text", section: "Personal", isRequired: true, showInList: true },
  { key: "father_name", label: "Father's Name", type: "text", section: "Personal" },
  { key: "primary_phone", label: "Primary Phone", type: "phone", section: "Personal", isRequired: true, showInList: true, showInFilters: true },
  { key: "alternate_phone", label: "Alternate Phone", type: "phone", section: "Personal" },
  { key: "email", label: "Email", type: "email", section: "Personal" },
  { key: "dob", label: "Date of Birth", type: "date", section: "Personal" },
  { key: "city", label: "City", type: "text", section: "Personal", showInFilters: true },
  { key: "state", label: "State", type: "select", section: "Personal", showInFilters: true },
  { key: "state_other", label: "State (specify)", type: "text", section: "Personal" },
  { key: "district", label: "District", type: "select", section: "Personal", showInFilters: true },
  { key: "pincode", label: "Pincode", type: "text", section: "Personal" },
  { key: "parents_occupation", label: "Parents' Occupation", type: "text", section: "Personal" },

  // Education
  { key: "education_status", label: "Education Status", type: "select", section: "Education", showInFilters: true, options: [] },
  { key: "school_college", label: "School / College", type: "text", section: "Education" },
  { key: "previous_attempts", label: "Previous Attempts", type: "number", section: "Education" },
  { key: "is_competitor_student", label: "Competitor Student?", type: "boolean", section: "Education" },
  { key: "competitor_institute", label: "Competitor Institute", type: "text", section: "Education" },

  // Preferences
  { key: "interested_exams", label: "Interested Exams", type: "multiselect", section: "Preferences", showInFilters: true },
  { key: "exam_year", label: "Exam Year", type: "text", section: "Preferences", showInFilters: true },
  { key: "courses_interested", label: "Courses Interested", type: "multiselect", section: "Preferences", showInFilters: true },
  { key: "preferred_mode", label: "Preferred Mode", type: "select", section: "Preferences" },

  // Tracking
  { key: "lead_source", label: "Lead Source", type: "select", section: "Tracking", showInList: true, showInFilters: true },
  { key: "sub_source", label: "Sub-source", type: "text", section: "Tracking" },
  { key: "stage_id", label: "Stage", type: "select", section: "Tracking", showInList: true, showInFilters: true },
  { key: "temperature", label: "Temperature", type: "select", section: "Tracking", showInList: true, showInFilters: true },
  { key: "assigned_to", label: "Assigned Counsellor", type: "user_ref", section: "Tracking", showInList: true, showInFilters: true },
  { key: "center_id", label: "Centre", type: "select", section: "Tracking", showInList: true, showInFilters: true },
  { key: "next_followup_at", label: "Next Follow-up", type: "datetime", section: "Tracking", showInList: true },
  { key: "brochure_sent", label: "Brochure Sent", type: "boolean", section: "Tracking" },
];

async function seedFieldDefinitions() {
  for (const [index, field] of LEAD_FIELD_SEEDS.entries()) {
    await db
      .insert(fieldDefinitions)
      .values({
        entity: "lead",
        key: field.key,
        label: field.label,
        type: field.type,
        section: field.section,
        sortOrder: index,
        isRequired: field.isRequired ?? false,
        showInList: field.showInList ?? false,
        showInFilters: field.showInFilters ?? false,
        isCore: true,
        options: field.options,
      })
      .onConflictDoUpdate({
        target: [fieldDefinitions.entity, fieldDefinitions.key],
        set: {
          label: field.label,
          type: field.type,
          section: field.section,
          sortOrder: index,
        },
      });
  }
  console.log(`seeded ${LEAD_FIELD_SEEDS.length} field definitions`);
}

interface UserSeed {
  email: string;
  fullName: string;
  roleCode: string;
  centerNames: string[];
}

const USER_SEEDS: UserSeed[] = [
  { email: "admin@afd-crm.test", fullName: "Admin User", roleCode: "admin", centerNames: ["Kochi", "Kannur"] },
  { email: "coadmin@afd-crm.test", fullName: "Co-Admin User", roleCode: "co_admin", centerNames: ["Kochi", "Kannur"] },
  { email: "centerhead.kochi@afd-crm.test", fullName: "Kochi Centre Head", roleCode: "center_head", centerNames: ["Kochi"] },
  { email: "counsellor.kochi@afd-crm.test", fullName: "Kochi Counsellor", roleCode: "counsellor", centerNames: ["Kochi"] },
  { email: "accounts@afd-crm.test", fullName: "Accounts User", roleCode: "accounts", centerNames: ["Kochi", "Kannur"] },
  { email: "academics@afd-crm.test", fullName: "Academics User", roleCode: "academics", centerNames: ["Kochi", "Kannur"] },
];

async function seedUsers(
  roleIds: Record<string, string>,
  centerIds: Record<string, string>,
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.warn(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping auth user + profile seed. " +
        "Set them in .env.local and re-run `npm run db:seed` to create the 6 seed logins.",
    );
    return;
  }

  const admin = createSupabaseAdminClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const user of USER_SEEDS) {
    let userId: string | undefined;

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: user.email,
      password: SEED_PASSWORD,
      email_confirm: true,
    });

    if (createError) {
      if (!createError.message.toLowerCase().includes("already been registered")) {
        throw createError;
      }
      const { data: list, error: listError } = await admin.auth.admin.listUsers();
      if (listError) throw listError;
      userId = list.users.find((u) => u.email === user.email)?.id;
    } else {
      userId = created.user?.id;
    }

    if (!userId) {
      console.warn(`could not resolve auth user id for ${user.email}, skipping`);
      continue;
    }

    await db
      .insert(profiles)
      .values({
        id: userId,
        fullName: user.fullName,
        email: user.email,
        roleId: roleIds[user.roleCode],
      })
      .onConflictDoUpdate({
        target: profiles.id,
        set: { fullName: user.fullName, roleId: roleIds[user.roleCode] },
      });

    for (const centerName of user.centerNames) {
      const centerId = centerIds[centerName];
      if (!centerId) continue;
      await db
        .insert(userCenters)
        .values({ userId, centerId })
        .onConflictDoNothing();
    }
  }

  console.log(`seeded ${USER_SEEDS.length} users (password: ${SEED_PASSWORD})`);
}

async function main() {
  await seedOrgSettings();
  await seedTerminology();
  const centerIds = await seedCenters();
  await seedPermissions();
  const roleIds = await seedRoles();
  await seedDropdowns();
  await seedPipelineStages();
  await seedFieldDefinitions();
  await seedUsers(roleIds, centerIds);
  console.log("done");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
