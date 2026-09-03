/**
 * Picking a Gemini model.
 *
 * Leon set his API key and got "Gemini doesn't recognise the model
 * gemini-2.0-flash". Nothing was wrong with his key: Google had retired
 * the name that was hardcoded as the default. Any name written into this
 * codebase has the same fate on a schedule nobody here controls, so the
 * model is now discovered by asking the API what the key can actually
 * call. These tests are that choice, which is the only real logic in the
 * driver.
 *
 * No database and no network — `fetch` is stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Must be unset before the module is loaded: an explicit GEMINI_MODEL is
// an override that skips discovery entirely, which is the point of it.
delete process.env.GEMINI_MODEL;

const { forgetResolvedModel, generateWithTools, listUsableModels, resolveModel } = await import(
  "../src/lib/ai/gemini"
);

const GENERATE = ["generateContent"];

function modelListing(names: string[], methods: string[] = GENERATE) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      models: names.map((name) => ({
        name: `models/${name}`,
        supportedGenerationMethods: methods,
      })),
    }),
  };
}

function stubFetch(response: unknown) {
  const spy = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", spy);
  return spy;
}

beforeEach(() => {
  forgetResolvedModel();
});

afterEach(() => {
  vi.unstubAllGlobals();
  forgetResolvedModel();
});

describe("listUsableModels", () => {
  it("keeps only models that can answer generateContent", async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: async () => ({
        models: [
          { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-embedding-001", supportedGenerationMethods: ["embedContent"] },
        ],
      }),
    });

    expect(await listUsableModels("k")).toEqual(["gemini-2.5-flash"]);
  });

  it("drops models that answer generateContent but are the wrong tool", async () => {
    // These do respond to generateContent. None of them is an analyst
    // that calls functions and writes a sentence back.
    stubFetch(
      modelListing([
        "gemini-2.5-flash",
        "imagen-4.0-generate-001",
        "veo-3.0-generate-preview",
        "gemini-2.5-flash-preview-tts",
        "gemini-live-2.5-flash-preview",
        "learnlm-2.0-flash-experimental",
      ]),
    );

    expect(await listUsableModels("k")).toEqual(["gemini-2.5-flash"]);
  });

  it("prefers the newest stable flash model", async () => {
    stubFetch(
      modelListing([
        "gemini-1.5-flash",
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-3.0-flash",
        "gemini-3.0-flash-lite",
        "gemini-3.0-flash-preview",
      ]),
    );

    const [best] = await listUsableModels("k");
    expect(best).toBe("gemini-3.0-flash");
  });

  it("prefers the unsuffixed alias over a pinned build", async () => {
    // "gemini-2.5-flash" keeps pointing at the current build; "-001" is
    // frozen and eventually retired, which is how this bug started.
    stubFetch(modelListing(["gemini-2.5-flash-001", "gemini-2.5-flash"]));

    const [best] = await listUsableModels("k");
    expect(best).toBe("gemini-2.5-flash");
  });

  it("falls back to a pro model when the key has no flash model", async () => {
    stubFetch(modelListing(["gemini-2.5-pro"]));

    expect(await listUsableModels("k")).toEqual(["gemini-2.5-pro"]);
  });

  it("reports the status when the listing itself is refused", async () => {
    stubFetch({ ok: false, status: 403, text: async () => "API key not valid" });

    await expect(listUsableModels("bad")).rejects.toMatchObject({ status: 403 });
  });
});

describe("resolveModel", () => {
  it("asks the API once and reuses the answer", async () => {
    const spy = stubFetch(modelListing(["gemini-2.5-flash"]));

    expect(await resolveModel("k")).toBe("gemini-2.5-flash");
    expect(await resolveModel("k")).toBe("gemini-2.5-flash");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("falls back rather than failing the question when listing breaks", async () => {
    // The generate call that follows will report the real problem (a bad
    // key, an exhausted quota) in Google's own words. Failing here would
    // replace that with a less useful error.
    stubFetch({ ok: false, status: 500, text: async () => "boom" });

    expect(await resolveModel("k")).toBe("gemini-2.5-flash");
  });

  it("falls back when the key can use nothing at all", async () => {
    stubFetch(modelListing([]));

    expect(await resolveModel("k")).toBe("gemini-2.5-flash");
  });
});

describe("generateWithTools", () => {
  /**
   * Routes the model listing and the generate call to different
   * responses, since resolving the model happens before generating.
   */
  function stubApi(generate: unknown) {
    const spy = vi.fn(async (url: string) =>
      url.includes(":generateContent") ? generate : modelListing(["gemini-3.8-flash"]),
    );
    vi.stubGlobal("fetch", spy);
    return spy;
  }

  const args = {
    apiKey: "k",
    systemInstruction: "be useful",
    contents: [{ role: "user" as const, parts: [{ text: "how many leads?" }] }],
    tools: [],
  };

  it("returns the model's parts verbatim, thought signatures included", async () => {
    // A thinking model rejects the follow-up request if the functionCall
    // it gets back has lost its thoughtSignature:
    //   "Function call is missing a thought_signature in functionCall parts."
    // So the caller must echo these parts, not rebuild them from name+args.
    stubApi({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: { name: "leads_by_source", args: { days: 30 } },
                  thoughtSignature: "sig-abc",
                },
              ],
            },
          },
        ],
      }),
    });

    const turn = await generateWithTools(args);

    expect(turn.functionCalls).toEqual([{ name: "leads_by_source", args: { days: 30 } }]);
    expect(turn.parts).toEqual([
      {
        functionCall: { name: "leads_by_source", args: { days: 30 } },
        thoughtSignature: "sig-abc",
      },
    ]);
  });

  it("keeps the signature on every call when the model asks for several at once", async () => {
    stubApi({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                { functionCall: { name: "a", args: {} }, thoughtSignature: "sig-1" },
                { functionCall: { name: "b", args: {} }, thoughtSignature: "sig-2" },
              ],
            },
          },
        ],
      }),
    });

    const turn = await generateWithTools(args);

    expect(turn.parts.map((part) => part.thoughtSignature)).toEqual(["sig-1", "sig-2"]);
  });

  it("keeps the model's reasoning out of the answer but inside the echoed turn", async () => {
    stubApi({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                { text: "First I should count them.", thought: true },
                { text: "You had 42 leads last month." },
              ],
            },
          },
        ],
      }),
    });

    const turn = await generateWithTools(args);

    expect(turn.text).toBe("You had 42 leads last month.");
    expect(turn.parts).toHaveLength(2);
  });
});
