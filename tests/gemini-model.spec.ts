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

const {
  forgetResolvedModel,
  generateWithTools,
  listUsableModels,
  resolveModel,
  resolveModelCandidates,
} = await import("../src/lib/ai/gemini");

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

/**
 * Leon's analyst was down for two days on a 503:
 *
 *   Gemini returned 503 for model "gemini-3.8-flash":
 *   "This model is currently experiencing high demand."
 *
 * Nothing was wrong with the key or the question. Picking the single best
 * model made the feature exactly as available as the newest flash model,
 * which is the least available thing on the free tier precisely because
 * it is newest — while the model one step down sat idle.
 */
describe("falling through to another model", () => {
  const args = {
    apiKey: "k",
    systemInstruction: "be useful",
    contents: [{ role: "user" as const, parts: [{ text: "how many leads?" }] }],
    tools: [],
  };

  const answer = {
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: "42 leads." }] } }] }),
  };

  const busy = (status: number) => ({
    ok: false,
    status,
    text: async () => `{"error":{"code":${status},"status":"UNAVAILABLE"}}`,
  });

  /** Serves the listing, then one response per generate call, in order. */
  function stubSequence(names: string[], generates: unknown[]) {
    let call = 0;
    const spy = vi.fn(async (url: string) => {
      if (!url.includes(":generateContent")) return modelListing(names);
      const next = generates[Math.min(call, generates.length - 1)];
      call += 1;
      return next;
    });
    vi.stubGlobal("fetch", spy);
    return spy;
  }

  it("offers several models, best first", async () => {
    stubFetch(modelListing(["gemini-3.8-flash", "gemini-2.5-flash", "gemini-2.5-pro"]));
    const candidates = await resolveModelCandidates("k");
    expect(candidates[0]).toBe("gemini-3.8-flash");
    expect(candidates).toContain("gemini-2.5-flash");
  });

  it("answers from the next model when the best one is overloaded", async () => {
    const spy = stubSequence(["gemini-3.8-flash", "gemini-2.5-flash"], [busy(503), answer]);

    const turn = await generateWithTools(args);

    expect(turn.text).toBe("42 leads.");
    const generateUrls = spy.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.includes(":generateContent"));
    expect(generateUrls[0]).toContain("gemini-3.8-flash");
    expect(generateUrls[1]).toContain("gemini-2.5-flash");
  });

  // A per-model daily quota is exactly that — per model. Another model has
  // its own, so 429 is a reason to step down rather than to give up.
  it("steps down on an exhausted quota too", async () => {
    stubSequence(["gemini-3.8-flash", "gemini-2.5-flash"], [busy(429), answer]);
    await expect(generateWithTools(args)).resolves.toMatchObject({ text: "42 leads." });
  });

  it("sticks with the model that answered, so the tool loop stops knocking on the busy one", async () => {
    const spy = stubSequence(["gemini-3.8-flash", "gemini-2.5-flash"], [busy(503), answer]);
    await generateWithTools(args);

    const before = spy.mock.calls.length;
    await generateWithTools(args);
    const after = spy.mock.calls
      .slice(before)
      .map(([url]) => String(url))
      .filter((url) => url.includes(":generateContent"));

    expect(after).toHaveLength(1);
    expect(after[0]).toContain("gemini-2.5-flash");
  });

  it("reports the last failure when every model is busy", async () => {
    stubSequence(["gemini-3.8-flash", "gemini-2.5-flash"], [busy(503)]);
    await expect(generateWithTools(args)).rejects.toMatchObject({ status: 503 });
  });

  // A bad key or a malformed request is not going to work any better on
  // another model, and trying three of them just delays the real message.
  it("does not shop around for a request that is simply wrong", async () => {
    const spy = stubSequence(
      ["gemini-3.8-flash", "gemini-2.5-flash"],
      [{ ok: false, status: 403, text: async () => "bad key" }],
    );

    await expect(generateWithTools(args)).rejects.toMatchObject({ status: 403 });
    const generateCalls = spy.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.includes(":generateContent"));
    expect(generateCalls).toHaveLength(1);
  });
});
