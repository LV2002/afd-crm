/**
 * "Hi Anjali" — and the several ways that goes wrong.
 *
 * The expensive failures are not typos. They are a parameter Meta refuses
 * (a newline pasted out of a spreadsheet), and a blank value that turns
 * "Hi {{1}}," into "Hi ," for the one lead whose name was never filled
 * in. Both are per-message rejections at Meta's door, which means nobody
 * finds out until somebody reads the failed count.
 */
import { describe, expect, it } from "vitest";

import {
  MAX_PARAM_LENGTH,
  describeSource,
  fillTemplateBody,
  firstName,
  parseParamSources,
  resolveParams,
  sanitiseParam,
  type ParamSource,
} from "../src/lib/whatsapp/personalise";
import {
  MERGE_VARIABLES,
  findMergeVariable,
  isUsableVariable,
  mergeVariablesFor,
} from "../src/lib/whatsapp/merge-variables";

describe("sanitiseParam", () => {
  it("flattens what Meta rejects outright", () => {
    // Newlines, tabs and runs of spaces are error 132000, per message.
    expect(sanitiseParam("Anjali\nMenon")).toBe("Anjali Menon");
    expect(sanitiseParam("Anjali\tMenon")).toBe("Anjali Menon");
    expect(sanitiseParam("Anjali      Menon")).toBe("Anjali Menon");
    expect(sanitiseParam("  Anjali  ")).toBe("Anjali");
  });

  it("reports whitespace-only as empty so the caller can fall back", () => {
    expect(sanitiseParam("   \n ")).toBe("");
  });

  it("cuts to Meta's parameter limit", () => {
    expect(sanitiseParam("x".repeat(2000))).toHaveLength(MAX_PARAM_LENGTH);
  });
});

describe("firstName", () => {
  it("takes the first word", () => {
    expect(firstName("Anjali Menon")).toBe("Anjali");
    expect(firstName("Anjali")).toBe("Anjali");
  });

  it("skips an honorific rather than greeting somebody as Dr", () => {
    expect(firstName("Dr. Rajesh Nair")).toBe("Rajesh");
    expect(firstName("Mr Vishnu")).toBe("Vishnu");
    expect(firstName("Smt. Latha Kumari")).toBe("Latha");
  });

  it("title-cases a name recorded in block capitals", () => {
    // The walk-in register produces these by the dozen, and "Hi ANJALI"
    // reads as shouting.
    expect(firstName("ANJALI MENON")).toBe("Anjali");
  });

  it("leaves a name containing lower case exactly as typed", () => {
    // Second-guessing real capitalisation is how you greet "Mcdonald".
    expect(firstName("McDonald Thomas")).toBe("McDonald");
    expect(firstName("deSouza Maria")).toBe("deSouza");
  });

  it("is empty for an empty name, rather than inventing one", () => {
    expect(firstName("")).toBe("");
    expect(firstName("   ")).toBe("");
    expect(firstName("Dr.")).toBe("");
  });
});

describe("resolveParams", () => {
  const sources: ParamSource[] = [
    { kind: "variable", key: "first_name", fallback: "there" },
    { kind: "text", value: "NIFT 2027" },
  ];

  it("fills each placeholder from the recipient's own record", () => {
    const { params, missing } = resolveParams(sources, { first_name: "Anjali" });
    expect(params).toEqual(["Anjali", "NIFT 2027"]);
    expect(missing).toEqual([]);
  });

  it("uses the fallback when that person's value is blank", () => {
    // One lead with no name must not cost the other 399 their message.
    expect(resolveParams(sources, { first_name: "" }).params[0]).toBe("there");
    expect(resolveParams(sources, { first_name: null }).params[0]).toBe("there");
    expect(resolveParams(sources, {}).params[0]).toBe("there");
  });

  it("reports a placeholder it could not fill at all", () => {
    // Meta rejects an empty parameter, so this recipient is failed with a
    // reason rather than sent "Hi ,".
    const { missing } = resolveParams([{ kind: "variable", key: "course", fallback: "  " }], {
      course: null,
    });
    expect(missing).toEqual([1]);
  });

  it("squeezes a resolved value flat too, not just typed text", () => {
    const { params } = resolveParams([{ kind: "variable", key: "course", fallback: "x" }], {
      course: "Foundation\n(Kochi)",
    });
    expect(params[0]).toBe("Foundation (Kochi)");
  });

  it("returns nothing for a template with no placeholders", () => {
    expect(resolveParams([], { first_name: "Anjali" })).toEqual({ params: [], missing: [] });
  });
});

describe("parseParamSources", () => {
  it("reads back what the composer wrote", () => {
    expect(
      parseParamSources([
        { kind: "variable", key: "first_name", fallback: "there" },
        { kind: "text", value: "NIFT" },
      ]),
    ).toEqual([
      { kind: "variable", key: "first_name", fallback: "there" },
      { kind: "text", value: "NIFT" },
    ]);
  });

  it("degrades to no personalisation rather than throwing in the send path", () => {
    // A row written by an older composer, or by hand, must not take a
    // whole batch down with it.
    expect(parseParamSources(null)).toEqual([]);
    expect(parseParamSources("nonsense")).toEqual([]);
    expect(parseParamSources([{ kind: "mystery" }, null, 7])).toEqual([]);
    expect(parseParamSources([{ kind: "variable" }])).toEqual([]);
  });

  it("defaults a missing fallback to blank rather than dropping the placeholder", () => {
    // Dropping it would shift every later placeholder up by one, which
    // sends the course where the name belongs.
    expect(parseParamSources([{ kind: "variable", key: "course" }])).toEqual([
      { kind: "variable", key: "course", fallback: "" },
    ]);
  });
});

describe("fillTemplateBody", () => {
  it("shows what one person will actually read", () => {
    expect(fillTemplateBody("Hi {{1}}, your {{2}} class starts Monday.", ["Anjali", "NIFT"])).toBe(
      "Hi Anjali, your NIFT class starts Monday.",
    );
  });

  it("leaves an unfilled placeholder visible", () => {
    // Obviously unfinished beats subtly wrong.
    expect(fillTemplateBody("Hi {{1}}, about {{2}}", ["Anjali"])).toBe("Hi Anjali, about {{2}}");
  });
});

describe("describeSource", () => {
  it("says where each placeholder's words come from", () => {
    expect(describeSource({ kind: "text", value: "NIFT" })).toBe("NIFT");
    expect(describeSource({ kind: "text", value: "  " })).toBe("(blank)");
    expect(
      describeSource({ kind: "variable", key: "first_name", fallback: "there" }, "First name"),
    ).toBe('First name (or "there")');
  });
});

describe("the merge variable catalogue", () => {
  it("offers a counsellor only for leads and a batch only for students", () => {
    // A student has no counsellor and a lead has no batch; offering
    // either would be a variable that resolves blank every time.
    const leadKeys = mergeVariablesFor("lead").map((v) => v.key);
    const studentKeys = mergeVariablesFor("student").map((v) => v.key);
    expect(leadKeys).toContain("counsellor_name");
    expect(leadKeys).not.toContain("batch_name");
    expect(studentKeys).toContain("batch_name");
    expect(studentKeys).not.toContain("counsellor_name");
  });

  it("has unique keys, since the key is what gets stored", () => {
    const keys = MERGE_VARIABLES.map((v) => v.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("refuses a key that isn't in the catalogue", () => {
    // Checked on the way in, so a variable nobody can resolve never
    // reaches four hundred queued messages.
    expect(isUsableVariable("first_name", "lead")).toBe(true);
    expect(isUsableVariable("batch_name", "lead")).toBe(false);
    expect(isUsableVariable("drop table leads", "lead")).toBe(false);
    expect(findMergeVariable("nope")).toBeUndefined();
  });
});
