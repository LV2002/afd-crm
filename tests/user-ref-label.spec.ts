/**
 * A column headed "Assigned Counsellor" must never print a uuid.
 *
 * It did, for two independent reasons that each produced the same
 * symptom — which is why it looked like a data problem rather than two
 * missing branches.
 */
import { describe, expect, it } from "vitest";

import { formatFieldValue } from "../src/lib/fields/format-field-value";
import type { FieldSchemaEntry } from "../src/lib/fields/get-field-schema";

const userRef = { key: "assigned_to", label: "Assigned Counsellor", type: "user_ref" } as FieldSchemaEntry;
const select = { key: "center_id", label: "Centre", type: "select" } as FieldSchemaEntry;

const ID = "28d12296-8de1-4a52-8838-0a3ae0228c58";

describe("formatFieldValue, user_ref", () => {
  it("resolves the person, where a select would resolve its label", () => {
    expect(
      formatFieldValue(userRef, ID, { assigned_to: [{ value: ID, label: "Athira Nair" }] }),
    ).toBe("Athira Nair");
  });

  it("falls back to the raw id rather than an empty cell when the person is unknown", () => {
    // Not ideal, but a uuid at least identifies the row for somebody
    // debugging. A blank would hide that the lead is assigned at all.
    expect(formatFieldValue(userRef, ID, { assigned_to: [] })).toBe(ID);
    expect(formatFieldValue(userRef, ID, {})).toBe(ID);
  });

  it("shows an unassigned lead as unassigned, not as 'null'", () => {
    expect(formatFieldValue(userRef, null, {})).toBe("—");
    expect(formatFieldValue(userRef, "", {})).toBe("—");
  });

  it("still resolves a select, which shared the branch", () => {
    expect(
      formatFieldValue(select, "c1", { center_id: [{ value: "c1", label: "Kannur" }] }),
    ).toBe("Kannur");
  });
});
