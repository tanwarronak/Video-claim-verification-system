import { config } from "../../config/env.config.js";
import { nvidiaChatCompletion } from "../nvidia.client.js";
import { NliAssessmentsSchema } from "../../validators/nli.validator.js";

function normalizeVerdict(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  if (["SUPPORTS", "SUPPORT", "ENTAILED", "ENTAILMENT"].includes(normalized)) return "SUPPORTS";
  if (["REFUTES", "REFUTE", "CONTRADICTS", "CONTRADICTED", "CONTRADICTION"].includes(normalized)) return "REFUTES";
  if (["NOT_ENOUGH_INFO", "NOT_ENOUGH_INFORMATION", "NEI", "UNKNOWN", "NEUTRAL", "INCONCLUSIVE"].includes(normalized)) {
    return "NOT_ENOUGH_INFO";
  }
  return value;
}

function normalizeAssessmentResponse(response) {
  const assessments = Array.isArray(response)
    ? response
    : response?.assessments ?? response?.results ?? response?.data?.assessments;

  if (!Array.isArray(assessments)) return response;

  return {
    assessments: assessments.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;

      const rawConfidence = item.confidence ?? item.score;
      const parsedConfidence = typeof rawConfidence === "string"
        ? Number(rawConfidence.trim().replace(/%$/, ""))
        : Number(rawConfidence);

      return {
        evidenceId: item.evidenceId ?? item.evidence_id ?? item.id,
        verdict: normalizeVerdict(item.verdict ?? item.label ?? item.classification),
        confidence: Number.isFinite(parsedConfidence)
          ? (typeof rawConfidence === "string" && rawConfidence.trim().endsWith("%")
            ? parsedConfidence / 100
            : parsedConfidence > 1 && parsedConfidence <= 100
              ? parsedConfidence / 100
              : parsedConfidence)
          : rawConfidence,
        reasoning: item.reasoning ?? item.explanation ?? item.rationale ?? item.reason,
        relevantSnippet: item.relevantSnippet ?? item.relevant_snippet ?? item.snippet ?? item.quote,
      };
    }),
  };
}

function formatSchemaIssues(issues) {
  return issues.map(({ path, message }) => `${path.join(".") || "response"}: ${message}`).join("; ");
}

export class NvidiaNliProvider {
  /**
   * @param {string} [apiKey]
   * @param {string} [model]
   */
  constructor(apiKey, model) {
    const key = apiKey || config.nvidiaApiKey;
    if (!key) {
      const err = new Error("NVIDIA API key is missing. Set NVIDIA_API_KEY in server/.env.");
      err.code = "NVIDIA_API_KEY_MISSING";
      err.statusCode = 500;
      throw err;
    }

    this.apiKey = key;
    this.model = model || config.nliLlmModel || "meta/llama-3.3-70b-instruct";
  }

  getName() {
    return "nvidia";
  }

  /**
   * System prompt for NLI assessment.
   */
  getSystemPrompt() {
    return `You are an expert Natural Language Inference (NLI) engine for fact-checking.
Your task is to assess whether each piece of evidence SUPPORTS, REFUTES, or provides NOT_ENOUGH_INFO for a given claim.

DEFINITIONS:
- SUPPORTS: The evidence directly confirms or substantiates the claim. The evidence contains information that, if true, makes the claim more likely to be true.
- REFUTES: The evidence directly contradicts or disproves the claim. The evidence contains information that, if true, makes the claim less likely to be true.
- NOT_ENOUGH_INFO: The evidence is relevant but insufficient to determine the truth of the claim. It neither clearly supports nor clearly refutes.

ASSESSMENT RULES:
1. Base your assessment ONLY on the provided evidence snippet. Do not use external knowledge.
2. Consider the evidence source type and retrieval score as context, but the verdict must be based on content.
3. Provide a confidence score (0.0-1.0) reflecting how certain you are of the verdict given this specific evidence.
4. Provide a concise reasoning (1-2 sentences) explaining why the evidence leads to this verdict.
5. Extract the most relevant snippet from the evidence that supports your assessment.
6. Be conservative: prefer NOT_ENOUGH_INFO over weak SUPPORTS/REFUTES.
7. Do NOT hallucinate facts not present in the evidence snippet.

OUTPUT FORMAT: Return exactly {"assessments":[{"evidenceId":"EXACT_INPUT_ID","verdict":"SUPPORTS|REFUTES|NOT_ENOUGH_INFO","confidence":0.0,"reasoning":"...","relevantSnippet":"..."}]}. Use one assessment for every input evidence ID, copy each ID exactly, and return no other fields or prose.`;
  }

  /**
   * Build user message with claim and evidence.
   * @param {string} claimText
   * @param {Array<{ evidenceId: string, snippet: string, title: string, url: string, sourceType: string, retrievalScore: number }>} evidenceItems
   */
  buildUserMessage(claimText, evidenceItems) {
    const evidenceText = evidenceItems
      .map((item, idx) => `
Evidence ${idx + 1} (ID: ${item.evidenceId}):
Title: ${item.title}
Source: ${item.sourceType} (${item.url})
Retrieval Score: ${item.retrievalScore}
Snippet: ${item.snippet}
`).join("\n");

    return `Claim to verify:
"${claimText}"

Evidence items to assess:
${evidenceText}

Please assess each evidence item against the claim. Return exactly one assessment per item, in the same order, and copy every evidence ID exactly.`;
  }

  /**
   * Calls NVIDIA NIM for NLI and validates its JSON response.
   * @param {string} claimText
   * @param {Array<{ evidenceId: string, snippet: string, title: string, url: string, sourceType: string, retrievalScore: number }>} evidenceItems
   * @returns {Promise<Array<{ evidenceId: string, verdict: "SUPPORTS"|"REFUTES"|"NOT_ENOUGH_INFO", confidence: number, reasoning: string, relevantSnippet: string }>>}
   */
  async assessEvidence(claimText, evidenceItems, options = {}) {
    if (!evidenceItems || evidenceItems.length === 0) {
      return [];
    }

    const systemPrompt = this.getSystemPrompt();
    const userMessage = this.buildUserMessage(claimText, evidenceItems);

    console.log(`[NvidiaNliProvider] Calling ${this.model} for NLI assessment (${evidenceItems.length} evidence items)...`);
    const evidenceIds = new Set(evidenceItems.map((item) => item.evidenceId));
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ];

    for (let attempt = 0; attempt < 2; attempt++) {
      let parsedJSON;
      try {
        parsedJSON = await nvidiaChatCompletion(messages, this.model, this.apiKey);
      } catch (err) {
        if (attempt === 0 && err.code === "NVIDIA_INVALID_JSON") {
          messages.push({
            role: "user",
            content: "Your previous response was not valid JSON. Return the complete assessment object as valid JSON only, using the exact evidence IDs.",
          });
          continue;
        }
        throw err;
      }

      const normalized = normalizeAssessmentResponse(parsedJSON);
      const validated = NliAssessmentsSchema.safeParse(normalized);
      const assessments = validated.success ? validated.data.assessments : [];
      const hasExactEvidenceIds = validated.success &&
        assessments.length === evidenceItems.length &&
        assessments.every((assessment) => evidenceIds.has(assessment.evidenceId)) &&
        new Set(assessments.map((assessment) => assessment.evidenceId)).size === assessments.length;

      if (hasExactEvidenceIds) {
        return assessments.map((assessment) => ({
          evidenceId: assessment.evidenceId,
          verdict: assessment.verdict,
          confidence: assessment.confidence,
          reasoning: assessment.reasoning,
          relevantSnippet: assessment.relevantSnippet || "",
        }));
      }

      const detail = validated.success
        ? "assessments must include every supplied evidence ID exactly once"
        : formatSchemaIssues(validated.error.issues);
      if (attempt === 0) {
        messages.push(
          { role: "assistant", content: JSON.stringify(parsedJSON) },
          {
            role: "user",
            content: `Repair the previous response. Validation failed: ${detail}. Return the complete JSON object in the required format, preserving the exact supplied evidence IDs.`,
          }
        );
        continue;
      }

      const err = new Error(`NVIDIA model response could not be validated after repair: ${detail}.`);
      err.code = "INVALID_LLM_OUTPUT";
      err.statusCode = 502;
      if (!validated.success) err.details = validated.error.issues;
      throw err;
    }
  }
}