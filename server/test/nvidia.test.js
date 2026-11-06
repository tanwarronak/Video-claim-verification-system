import { describe, it } from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import { LLMFactory } from "../src/services/llm/llm.factory.js";
import { NvidiaProvider } from "../src/services/llm/nvidia.provider.js";
import { NliProviderFactory } from "../src/services/nli-providers/nli.factory.js";
import { NvidiaNliProvider } from "../src/services/nli-providers/nvidia-nli.provider.js";
import { nvidiaChatCompletion } from "../src/services/nvidia.client.js";
import { config } from "../src/config/env.config.js";

describe("NVIDIA NIM provider integration", () => {
  it("uses the configured NVIDIA chat-completions endpoint and JSON response mode", async (t) => {
    let request;
    t.mock.method(axios, "post", async (...args) => {
      request = args;
      return { data: { choices: [{ message: { content: '{"claims":[]}' } }] } };
    });

    const messages = [{ role: "user", content: "Return JSON." }];
    const result = await nvidiaChatCompletion(messages, "test/model", "test-nvidia-key");

    assert.deepEqual(result, { claims: [] });
    assert.equal(
      request[0],
      `${config.nvidiaBaseUrl.replace(/\/+$/, "")}/chat/completions`
    );
    assert.equal(request[1].model, "test/model");
    assert.deepEqual(request[1].messages, messages);
    assert.deepEqual(request[1].response_format, { type: "json_object" });
    assert.equal(request[2].timeout, config.nvidiaRequestTimeoutMs);
    assert.equal(request[2].headers.Authorization, "Bearer test-nvidia-key");
  });

  it("selects NVIDIA providers for both claim extraction and NLI", () => {
    assert.ok(
      LLMFactory.getProvider({ provider: "nvidia", apiKey: "test-nvidia-key" }) instanceof NvidiaProvider
    );
    assert.ok(
      NliProviderFactory.getProvider({ provider: "nvidia", apiKey: "test-nvidia-key" }) instanceof NvidiaNliProvider
    );
  });

  it("retries a claim response whose quote is not grounded in the supplied segments", async (t) => {
    const responses = [
      { claims: [{ originalText: "Mars is blue", normalizedText: "Mars is blue.", type: "FACTUAL", sourceSegmentIds: [8], reason: "An objective assertion." }] },
      { claims: [{ originalText: "Mars is red", normalizedText: "Mars is red.", type: "FACTUAL", sourceSegmentIds: [8], reason: "An objective assertion." }] },
    ];
    const requests = [];
    t.mock.method(axios, "post", async (...args) => {
      requests.push(args[1]);
      return { data: { choices: [{ message: { content: JSON.stringify(responses.shift()) } }] } };
    });

    const provider = new NvidiaProvider("test-nvidia-key", "test/model");
    const claims = await provider.extractClaims(
      [{ id: 8, start: 0, end: 2, text: "Mars is red." }],
      "Mars is red."
    );

    assert.equal(claims[0].originalText, "Mars is red");
    assert.equal(requests.length, 2);
    assert.match(requests[1].messages.at(-1).content, /failed validation/i);
  });

    it("preserves complete spoken assertions during claim extraction", async (t) => {
      let request;
      const extractedClaim = {
        originalText: "The city closed three schools after heavy rain flooded the east side.",
        normalizedText: "The city closed three schools after heavy rain flooded the east side.",
        type: "FACTUAL",
        sourceSegmentIds: [4],
        reason: "It describes a checkable past event.",
      };
      t.mock.method(axios, "post", async (...args) => {
        request = args[1];
        return { data: { choices: [{ message: { content: JSON.stringify({ claims: [extractedClaim] }) } }] } };
      });

      const provider = new NvidiaProvider("test-nvidia-key", "test/model");
      const claims = await provider.extractClaims(
        [{ id: 4, start: 0, end: 5, text: extractedClaim.originalText }],
        extractedClaim.originalText
      );

      assert.equal(claims[0].normalizedText, extractedClaim.originalText);
      assert.match(request.messages[0].content, /complete standalone.*not a short label or summary/i);
      assert.match(request.messages[1].content, /do not reduce claims to short fragments/i);
    });

    it("extracts long transcripts in bounded overlapping chunks without losing or duplicating segment claims", async (t) => {
      const segments = Array.from({ length: 45 }, (_, id) => ({
        id,
        start: id * 3,
        end: id * 3 + 2.5,
        text: `Segment ${id} reports that the regional authority opened a public health center after construction was completed in the northern district. Additional context for segment ${id} explains that residents can receive routine care there without traveling to the city center.`,
      }));
      const requests = [];
      t.mock.method(axios, "post", async (...args) => {
        const request = args[1];
        requests.push(request);
        const prompt = request.messages.at(-1).content;
        const ids = [...prompt.matchAll(/\[Segment ID: (\d+)/g)].map((match) => Number(match[1]));
        const claims = ids.map((id) => ({
          originalText: segments[id].text,
          normalizedText: segments[id].text,
          type: "FACTUAL",
          sourceSegmentIds: [id],
          reason: "It states a checkable past event.",
        }));
        return { data: { choices: [{ message: { content: JSON.stringify({ claims }) } }] } };
      });

      const provider = new NvidiaProvider("test-nvidia-key", "test/model");
      const claims = await provider.extractClaims(
        segments,
        segments.map((segment) => segment.text).join(" ")
      );

      assert.equal(requests.length, 2);
      assert.ok(requests.every((request) => request.messages.at(-1).content.length < 25000));
      assert.equal(claims.length, segments.length);
      assert.deepEqual(claims.map((claim) => claim.sourceSegmentIds[0]), segments.map((segment) => segment.id));
    });

    it("normalizes common NVIDIA NLI field variants and percentage confidence", async (t) => {
      t.mock.method(axios, "post", async () => ({
        data: {
          choices: [{
            message: {
              content: JSON.stringify({
                results: [{
                  evidence_id: "ev_1",
                  label: "supports",
                  confidence: "92%",
                  explanation: "The source explicitly confirms the claim.",
                  snippet: "The source text.",
                }],
              }),
            },
          }],
        },
      }));

      const provider = new NvidiaNliProvider("test-nvidia-key", "test/model");
      const assessments = await provider.assessEvidence("The claim.", [{
        evidenceId: "ev_1",
        title: "Source",
        url: "https://example.com/source",
        snippet: "The source text.",
        sourceType: "NEWS",
        retrievalScore: 0.9,
      }]);

      assert.deepEqual(assessments, [{
        evidenceId: "ev_1",
        verdict: "SUPPORTS",
        confidence: 0.92,
        reasoning: "The source explicitly confirms the claim.",
        relevantSnippet: "The source text.",
      }]);
    });

    it("repairs malformed NLI assessments once while requiring exact evidence IDs", async (t) => {
      const requests = [];
      const responses = [
        { assessments: [{ evidenceId: "wrong-id", verdict: "SUPPORTS", confidence: 0.9, reasoning: "Reason." }] },
        { assessments: [{ evidenceId: "ev_2", verdict: "NOT ENOUGH INFO", confidence: "0.6", reasoning: "The source is insufficient." }] },
      ];
      t.mock.method(axios, "post", async (...args) => {
        requests.push(args[1]);
        return { data: { choices: [{ message: { content: JSON.stringify(responses.shift()) } }] } };
      });

      const provider = new NvidiaNliProvider("test-nvidia-key", "test/model");
      const assessments = await provider.assessEvidence("The claim.", [{
        evidenceId: "ev_2",
        title: "Source",
        url: "https://example.com/source",
        snippet: "Unclear source text.",
        sourceType: "NEWS",
        retrievalScore: 0.5,
      }]);

      assert.equal(requests.length, 2);
      assert.match(requests[1].messages.at(-1).content, /exact supplied evidence IDs/i);
      assert.equal(assessments[0].evidenceId, "ev_2");
      assert.equal(assessments[0].verdict, "NOT_ENOUGH_INFO");
    });

  it("rejects unsupported hosted-model providers rather than silently switching providers", () => {
    assert.throws(() => LLMFactory.getProvider({ provider: "openai" }), {
      code: "UNSUPPORTED_LLM_PROVIDER",
    });
    assert.throws(() => NliProviderFactory.getProvider({ provider: "openai" }), {
      code: "UNSUPPORTED_NLI_PROVIDER",
    });
  });
});
