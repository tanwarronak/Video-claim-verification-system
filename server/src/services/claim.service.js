import { LLMFactory } from "./llm/llm.factory.js";
import { calculateClaimTimestamps } from "../utils/timestamp.utils.js";
import { validateClaimResult } from "../validators/claim.validator.js";
import { validateClaimSourceGrounding } from "../validators/claim-grounding.js";

export class ClaimService {
  /**
   * Extracts, classifies, normalizes, and aligns timestamps for claims from a transcript.
   *
   * @param {object} transcript - Phase 1 transcript object
   * @param {string} [transcript.text] - Full transcript text
   * @param {number} [transcript.duration] - Total video/audio duration
   * @param {string} [transcript.language] - Detected language
   * @param {Array<{ id: number, start: number, end: number, text: string }>} transcript.segments - Timestamped segments
   * @param {object} [options] - Extraction options (provider, model, apiKey)
   * @returns {Promise<{ claims: Array<object>, summary: object }>}
   */
  static async extractClaims(transcript, options = {}) {
    const segments = transcript?.segments || [];
    const fullText = transcript?.text || segments.map((s) => s.text).join(" ");
    const duration = transcript?.duration || 0;

    // Handle empty transcript or no speech segments gracefully
    if (segments.length === 0 || !fullText.trim()) {
      return {
        claims: [],
        summary: {
          total: 0,
          factual: 0,
          opinion: 0,
          prediction: 0,
          nonClaim: 0,
        },
      };
    }

    // Build segments map for fast timestamp lookup
    const normalizedSegments = segments.map((seg, idx) => ({
      id: Number(seg.id ?? idx),
      start: Number(seg.start || 0),
      end: Number(seg.end || 0),
      text: seg.text || "",
    }));
    const segmentsMap = new Map(normalizedSegments.map((seg) => [seg.id, seg]));

    // 1. Get LLM Provider & Extract Raw Claims
    const provider = LLMFactory.getProvider(options);
    const rawClaims = await provider.extractClaims(normalizedSegments, fullText);
    validateClaimSourceGrounding(rawClaims, normalizedSegments);

    // 2. Assemble Structured Claims with Accurate Timestamps
    const structuredClaims = rawClaims.map((rawClaim, index) => {
      const claimId = `claim_${String(index + 1).padStart(3, "0")}`;
      const sourceSegmentIds = (rawClaim.sourceSegmentIds || []).map((id) => Number(id));

      const { startTime, endTime } = calculateClaimTimestamps(
        sourceSegmentIds,
        segmentsMap,
        duration
      );

      return {
        id: claimId,
        originalText: rawClaim.originalText.trim(),
        normalizedText: rawClaim.normalizedText.trim(),
        type: rawClaim.type,
        startTime,
        endTime,
        sourceSegmentIds,
        reason: rawClaim.reason.trim(),
      };
    });

    // 3. Calculate Summary Statistics
    const summary = {
      total: structuredClaims.length,
      factual: structuredClaims.filter((c) => c.type === "FACTUAL").length,
      opinion: structuredClaims.filter((c) => c.type === "OPINION").length,
      prediction: structuredClaims.filter((c) => c.type === "PREDICTION").length,
      nonClaim: structuredClaims.filter((c) => c.type === "NON_CLAIM").length,
    };

    const finalResult = {
      claims: structuredClaims,
      summary,
    };

    // 4. Validate output schema
    const validation = validateClaimResult(finalResult);
    if (!validation.success) {
      console.error("[ClaimService] Structured claims output validation error:", validation.error);
      const err = new Error("Failed to produce schema-compliant claims result.");
      err.code = "CLAIM_SCHEMA_VALIDATION_ERROR";
      err.statusCode = 500;
      err.details = validation.error.issues || validation.error.errors || [];
      throw err;
    }

    return finalResult;
  }
}
