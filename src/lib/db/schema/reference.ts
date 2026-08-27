import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { idColumn, softDelete, timestamps } from "./_helpers";

export const dropdownCategories = pgTable("dropdown_categories", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  isSystem: boolean("is_system").notNull().default(false),
  allowAdminEdit: boolean("allow_admin_edit").notNull().default(true),
  ...timestamps(),
});

export const dropdownOptions = pgTable(
  "dropdown_options",
  {
    id: idColumn(),
    category: text("category")
      .notNull()
      .references(() => dropdownCategories.key, { onDelete: "cascade" }),
    value: text("value").notNull(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    color: text("color"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [uniqueIndex("dropdown_options_category_value_uq").on(t.category, t.value)],
);

/**
 * stage_type is the one part of the pipeline that stays a fixed vocabulary
 * — it drives behaviour (lost-reason modal, form link, won calculation).
 * Everything else about a stage (name, order, colour, probability, SLA,
 * required fields) is admin-editable data.
 */
export const stageTypeEnum = pgEnum("stage_type", [
  "new",
  "normal",
  "scheduled",
  "enrolment_form",
  "payment",
  "won",
  "lost",
  "parked",
]);

export const pipelineStages = pgTable("pipeline_stages", {
  id: idColumn(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  color: text("color"),
  stageType: stageTypeEnum("stage_type").notNull().default("normal"),
  isActive: boolean("is_active").notNull().default(true),
  probability: numeric("probability", { precision: 5, scale: 2 }),
  slaHours: integer("sla_hours"),
  requiresReason: boolean("requires_reason").notNull().default(false),
  requiredFields: text("required_fields").array(),
  autoActions: jsonb("auto_actions").$type<Record<string, unknown>>(),
  ...timestamps(),
  ...softDelete(),
});

export const fieldEntityEnum = pgEnum("field_entity", [
  "lead",
  "student",
  "enrolment",
]);

export const fieldTypeEnum = pgEnum("field_type", [
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
]);

export const fieldDefinitions = pgTable(
  "field_definitions",
  {
    id: idColumn(),
    entity: fieldEntityEnum("entity").notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    helpText: text("help_text"),
    type: fieldTypeEnum("type").notNull(),
    options: jsonb("options").$type<Array<{ value: string; label: string }>>(),
    validation: jsonb("validation").$type<Record<string, unknown>>(),
    isRequired: boolean("is_required").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    section: text("section").notNull(),
    showInList: boolean("show_in_list").notNull().default(false),
    showInFilters: boolean("show_in_filters").notNull().default(false),
    visibleToRoles: uuid("visible_to_roles").array(),
    editableByRoles: uuid("editable_by_roles").array(),
    /** Backed by a real column (name, phone, stage). Cannot be deleted. */
    isCore: boolean("is_core").notNull().default(false),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [uniqueIndex("field_definitions_entity_key_uq").on(t.entity, t.key)],
);
