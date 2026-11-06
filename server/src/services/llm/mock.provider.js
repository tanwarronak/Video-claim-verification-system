import { RawLLMExtractionSchema } from "../../validators/claim.validator.js";

/**
 * Deterministic Mock LLM Provider for offline testing, CI environments, and local development.
 */
export class MockProvider {
  /**
   * Cleans text from common spoken filler words.
   * @param {string} text
   */
  static cleanFiller(text) {
    return text
      .replace(/^(well|you know|basically|like|honestly|i mean)[,\s]*/i, "")
      .replace(/,\s*(right|you know)\??$/i, "")
      .trim();
  }

  /**
   * Deterministic claim extraction and semantic classification logic.
   * @param {Array<{ id: number, start: number, end: number, text: string }>} segments
   * @param {string} fullText
   * @returns {Promise<Array<{ originalText: string, normalizedText: string, type: "FACTUAL"|"OPINION"|"PREDICTION"|"NON_CLAIM", sourceSegmentIds: number[], reason: string }>>}
   */
  async extractClaims(segments, fullText) {
    const claims = [];

    for (const seg of segments) {
      const segText = seg.text.trim();
      if (!segText) continue;

      // Handle compound sentence containing multiple claims in one segment (e.g. "The Earth is the third planet from the Sun and Jupiter is the largest planet")
      if (
        /the earth is the third planet from the sun/i.test(segText) &&
        /jupiter is the largest planet/i.test(segText)
      ) {
        claims.push({
          originalText: "The Earth is the third planet from the Sun",
          normalizedText: "The Earth is the third planet from the Sun.",
          type: "FACTUAL",
          sourceSegmentIds: [seg.id],
          reason: "Asserts an empirically verifiable astronomical fact regarding Earth's position from the Sun.",
        });
        claims.push({
          originalText: "Jupiter is the largest planet",
          normalizedText: "Jupiter is the largest planet in our solar system.",
          type: "FACTUAL",
          sourceSegmentIds: [seg.id],
          reason: "Asserts an empirically verifiable astronomical fact regarding Jupiter's size.",
        });
        continue;
      }

      // Check for Greetings / Calls to action / Non-claims
      if (
        /welcome (back|to)|subscribe|like the video|channel|dive right in|hello everyone/i.test(
          segText
        )
      ) {
        claims.push({
          originalText: segText,
          normalizedText: segText,
          type: "NON_CLAIM",
          sourceSegmentIds: [seg.id],
          reason: "Conversational greeting, call-to-action, or channel meta-commentary containing no verifiable proposition.",
        });
        continue;
      }

      // Check for Future Predictions & Speculation
      if (
        /\b(will replace|will become|will reach|may discover|in the future|within \w+ years|by \d{4})\b/i.test(
          segText
        )
      ) {
        claims.push({
          originalText: segText,
          normalizedText: MockProvider.cleanFiller(segText),
          type: "PREDICTION",
          sourceSegmentIds: [seg.id],
          reason: "Asserts a forward-looking speculative forecast or future outcome that cannot be verified with current empirical evidence.",
        });
        continue;
      }

      // Check for Subjective Opinions & Personal judgments
      if (
        /\b(i think|i feel|i personally think|in my opinion|best country|best university|fascinating|superior to|wonderful|delicious|awful)\b/i.test(
          segText
        )
      ) {
        claims.push({
          originalText: segText,
          normalizedText: MockProvider.cleanFiller(segText),
          type: "OPINION",
          sourceSegmentIds: [seg.id],
          reason: "Expresses a subjective personal belief, aesthetic appraisal, or value judgment that cannot be empirically verified.",
        });
        continue;
      }

      // Check for Ambiguous statements
      if (/maybe it was something else|it could have been whatever|uncertain/i.test(segText)) {
        claims.push({
          originalText: segText,
          normalizedText: MockProvider.cleanFiller(segText),
          type: "OPINION",
          sourceSegmentIds: [seg.id],
          reason: "Statement expresses uncertainty or ambiguity without asserting a verifiable proposition.",
        });
        continue;
      }

      // Default: Factual Claim
      let normalized = MockProvider.cleanFiller(segText);
      if (/jupiter is basically the biggest planet/i.test(segText)) {
        normalized = "Jupiter is the largest planet in the solar system.";
      }

      claims.push({
        originalText: segText,
        normalizedText: normalized,
        type: "FACTUAL",
        sourceSegmentIds: [seg.id],
        reason: "Asserts an objective, empirically verifiable proposition that can be evaluated against external evidence.",
      });
    }

    // Validate result against RawLLMExtractionSchema
    const validated = RawLLMExtractionSchema.safeParse({ claims });
    if (!validated.success) {
      throw new Error(`MockProvider generated invalid claims schema: ${validated.error.message}`);
    }

    return validated.data.claims;
  }
}
