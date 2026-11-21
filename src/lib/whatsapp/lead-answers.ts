import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { leads } from "@/lib/db/schema";

import type { AskField } from "./flow-engine";

/** Lead column each askable field writes to. Fixed: an answer goes nowhere else. */
export const ASK_COLUMNS: Record<AskField, keyof typeof leads.$inferInsert> = {
  email: "email",
  city: "city",
  district: "district",
  state: "state",
  exam_year: "examYear",
  school_college: "schoolCollege",
  board: "board",
  father_name: "fatherName",
  mother_name: "motherName",
  education_status: "educationStatus",
};

/** Writes already-validated answers onto a lead. */
export async function writeLeadAnswers(leadId: string, values: Partial<Record<AskField, string>>): Promise<void> {
  const set: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(values)) set[ASK_COLUMNS[field as AskField]] = value;
  if (Object.keys(set).length === 0) return;
  await db.update(leads).set({ ...set, updatedAt: new Date() }).where(eq(leads.id, leadId));
}
