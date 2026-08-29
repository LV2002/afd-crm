import { z } from "zod";

/**
 * CLAUDE.md § Plug-and-play test: dump every configuration table to one
 * JSON bundle, import it into a fresh instance, get a working CRM shaped
 * the same way. This is the bundle's shape, validated with zod at the
 * import boundary — a config bundle is an uploaded file, i.e. untrusted
 * input, same as any other boundary CLAUDE.md's conventions call for
 * validation at.
 *
 * Deliberately NOT included, beyond the doc's own "never exports: leads,
 * students, payments, users, messages, audit log":
 * - `permissions`: fixed in code (CLAUDE.md's "Fixed in code" list), not
 *   part of any company's configuration. Re-seeded from the PERMISSIONS
 *   constant by `ensurePermissionsSeeded()` as part of import itself, so
 *   `role_permissions` rows always have a real code to reference.
 * - `assignment_rules`: its `action` payload (`assignTo`/`userIds`) and
 *   `created_by` name specific PEOPLE, who are data, not configuration,
 *   and never transfer between instances. Carrying the rows over as-is
 *   would either dangle (person no longer exists) or silently reassign
 *   leads to the wrong stranger in a different company. Revisit if a
 *   future version separates a rule's portable shape (conditions,
 *   priority) from its person-specific action target.
 */

const uuid = z.string().uuid();
const timestamp = z.coerce.date();
const nullableTimestamp = z.coerce.date().nullable().optional();

export const orgSettingsSchema = z.object({
  id: uuid,
  name: z.string(),
  logoUrl: z.string().nullable().optional(),
  primaryColor: z.string(),
  timezone: z.string(),
  currency: z.string(),
  locale: z.string(),
  fiscalYearStartMonth: z.number().int(),
  dateFormat: z.string(),
  createdAt: timestamp,
  updatedAt: nullableTimestamp,
});

export const terminologySchema = z.object({
  id: uuid,
  key: z.string(),
  singular: z.string(),
  plural: z.string(),
  isActive: z.boolean(),
  createdAt: timestamp,
  updatedAt: nullableTimestamp,
});

export const centerSchema = z.object({
  id: uuid,
  name: z.string(),
  city: z.string(),
  address: z.string().nullable().optional(),
  isActive: z.boolean(),
  timezone: z.string(),
  catchment: z.object({ districts: z.array(z.string()).optional() }).nullable().optional(),
  createdAt: timestamp,
  updatedAt: nullableTimestamp,
});

export const dropdownCategorySchema = z.object({
  key: z.string(),
  label: z.string(),
  isSystem: z.boolean(),
  allowAdminEdit: z.boolean(),
  createdAt: timestamp,
  updatedAt: nullableTimestamp,
});

export const dropdownOptionSchema = z.object({
  id: uuid,
  category: z.string(),
  value: z.string(),
  label: z.string(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  color: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: timestamp,
  updatedAt: nullableTimestamp,
});

export const pipelineStageSchema = z.object({
  id: uuid,
  name: z.string(),
  sortOrder: z.number().int(),
  color: z.string().nullable().optional(),
  stageType: z.enum(["new", "normal", "scheduled", "enrolment_form", "payment", "won", "lost", "parked"]),
  isActive: z.boolean(),
  probability: z.string().nullable().optional(),
  slaHours: z.number().int().nullable().optional(),
  requiresReason: z.boolean(),
  requiredFields: z.array(z.string()).nullable().optional(),
  autoActions: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: timestamp,
  updatedAt: nullableTimestamp,
});

export const fieldDefinitionSchema = z.object({
  id: uuid,
  entity: z.enum(["lead", "student", "enrolment"]),
  key: z.string(),
  label: z.string(),
  helpText: z.string().nullable().optional(),
  type: z.enum([
    "text",
    "long_text",
    "number",
    "currency",
    "date",
    "datetime",
    "boolean",
    "select",
    "multiselect",
    "phone",
    "email",
    "url",
    "file",
    "user_ref",
    "lead_ref",
  ]),
  options: z.array(z.object({ value: z.string(), label: z.string() })).nullable().optional(),
  validation: z.record(z.string(), z.unknown()).nullable().optional(),
  isRequired: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  section: z.string(),
  showInList: z.boolean(),
  showInFilters: z.boolean(),
  visibleToRoles: z.array(uuid).nullable().optional(),
  editableByRoles: z.array(uuid).nullable().optional(),
  isCore: z.boolean(),
  createdAt: timestamp,
  updatedAt: nullableTimestamp,
});

export const roleSchema = z.object({
  id: uuid,
  code: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  isSystem: z.boolean(),
  isProtected: z.boolean(),
  createdAt: timestamp,
  updatedAt: nullableTimestamp,
});

export const rolePermissionSchema = z.object({
  roleId: uuid,
  permissionCode: z.string(),
  scope: z.enum(["own", "center", "all"]),
  createdAt: timestamp,
  updatedAt: nullableTimestamp,
});

export const temperatureRuleSchema = z.object({
  id: uuid,
  temperatureValue: z.string(),
  priority: z.number().int(),
  conditions: z.record(z.string(), z.unknown()),
  isActive: z.boolean(),
  createdAt: timestamp,
  updatedAt: nullableTimestamp,
});

export const slaPolicySchema = z.object({
  id: uuid,
  name: z.string(),
  priority: z.number().int(),
  isActive: z.boolean(),
  appliesTo: z.record(z.string(), z.unknown()).nullable().optional(),
  measure: z.enum(["first_response", "next_followup", "in_stage"]),
  targetHours: z.number().int(),
  businessHoursOnly: z.boolean(),
  escalations: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
  createdAt: timestamp,
  updatedAt: nullableTimestamp,
});

export const businessHoursSchema = z.object({
  id: uuid,
  centerId: uuid,
  dayOfWeek: z.number().int().min(0).max(6),
  opensAt: z.string().nullable().optional(),
  closesAt: z.string().nullable().optional(),
  isClosed: z.boolean(),
  createdAt: timestamp,
  updatedAt: nullableTimestamp,
});

export const holidaySchema = z.object({
  id: uuid,
  centerId: uuid,
  date: z.string(),
  name: z.string(),
  createdAt: timestamp,
  updatedAt: nullableTimestamp,
});

/**
 * CLAUDE.md § What is configurable lists "Fees: Structures ..." explicitly
 * — base fee by course/centre/mode/year is configuration, not business
 * data (unlike the enrolments/payments it's looked up from, which are
 * never exported). `centerId` carries over as-is on import, same as
 * `businessHoursSchema`/`holidaySchema`'s — importConfig() re-inserts
 * `centers` rows with their original ids, so no remapping is needed.
 */
export const feeStructureSchema = z.object({
  id: uuid,
  course: z.string(),
  centerId: uuid,
  mode: z.string(),
  academicYear: z.string(),
  baseFeePaise: z.number().int(),
  isActive: z.boolean(),
  createdAt: timestamp,
  updatedAt: nullableTimestamp,
});

/**
 * Tag definitions are configuration (an admin-editable label list), same
 * reasoning as fee_structures above — `lead_tags` (which leads carry which
 * tag) is data, not configuration, and is never exported, same bucket as
 * leads/students/payments themselves.
 */
export const tagSchema = z.object({
  id: uuid,
  name: z.string(),
  color: z.string().nullable().optional(),
  isActive: z.boolean(),
  createdAt: timestamp,
  updatedAt: nullableTimestamp,
});

/** Bumped only if this shape itself changes, not on every export. */
export const CONFIG_BUNDLE_VERSION = "3";

export const configBundleSchema = z.object({
  version: z.literal(CONFIG_BUNDLE_VERSION),
  exportedAt: z.coerce.date(),
  orgSettings: z.array(orgSettingsSchema),
  terminology: z.array(terminologySchema),
  centers: z.array(centerSchema),
  dropdownCategories: z.array(dropdownCategorySchema),
  dropdownOptions: z.array(dropdownOptionSchema),
  pipelineStages: z.array(pipelineStageSchema),
  fieldDefinitions: z.array(fieldDefinitionSchema),
  roles: z.array(roleSchema),
  rolePermissions: z.array(rolePermissionSchema),
  temperatureRules: z.array(temperatureRuleSchema),
  slaPolicies: z.array(slaPolicySchema),
  businessHours: z.array(businessHoursSchema),
  holidays: z.array(holidaySchema),
  feeStructures: z.array(feeStructureSchema),
  tags: z.array(tagSchema),
});

export type ConfigBundle = z.infer<typeof configBundleSchema>;
