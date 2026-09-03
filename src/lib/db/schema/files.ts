import { bigint, check, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { idColumn, softDelete, timestamps } from "./_helpers";
import { profiles } from "./auth";
import { students } from "./finance";
import { leads } from "./leads";

/**
 * Metadata for a file held in Supabase Storage's private `attachments`
 * bucket. The bytes live in Storage; this row is the record of what the
 * file is, who uploaded it, and — crucially — which lead or student it
 * belongs to, since that parent is what every access decision is made
 * against.
 *
 * Two nullable FKs with a check constraint rather than a polymorphic
 * (entity, entity_id) pair. A polymorphic pair would need the owning
 * centre denormalised onto this row for RLS to be able to scope it, and
 * that copy would then silently go stale the moment a lead is moved to
 * another centre — a quiet way to leak a file across centres. Real FKs
 * keep referential integrity (a deleted lead can't leave orphaned file
 * rows) and let the policies resolve the centre from the parent every
 * time, so it is always current.
 *
 * `storage_path` is the object's key inside the bucket and is unique:
 * two rows must never point at the same object, or deleting one would
 * break the other. It is shaped `<kind>/<parent id>/<uuid>-<filename>`
 * because the Storage policies parse those segments to authorise the
 * object itself — see migration 0031.
 *
 * Never hard-deleted (CLAUDE.md § Non-negotiables 5): `deleted_at` hides
 * the row and the object stops being served, but the bytes are only
 * removed by a deliberate admin action, so a mis-click is recoverable.
 */
export const attachments = pgTable(
  "attachments",
  {
    id: idColumn(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    studentId: uuid("student_id").references(() => students.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull().unique(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    /** bigint: a video can exceed the 2^31 a plain integer holds. */
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    /**
     * What this file IS to the business — "Photo", "Signed agreement",
     * "Marksheet". Free text rather than an enum so a new document type
     * doesn't need a migration; the upload UI offers the common ones.
     */
    label: text("label"),
    uploadedBy: uuid("uploaded_by").references(() => profiles.id, { onDelete: "set null" }),
    ...timestamps(),
    ...softDelete(),
  },
  (table) => [
    index("attachments_lead_idx").on(table.leadId),
    index("attachments_student_idx").on(table.studentId),
    // Exactly one parent. Without this a row could attach to both a lead
    // and a student (two different access boundaries at once) or to
    // neither (unreachable, and unauthorisable — no parent to check).
    check(
      "attachments_one_parent",
      sql`(lead_id is not null and student_id is null) or (lead_id is null and student_id is not null)`,
    ),
  ],
);
