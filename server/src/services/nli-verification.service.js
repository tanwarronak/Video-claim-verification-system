import { config } from "../config/env.config.js";
import { NliProviderFactory } from "./nli-providers/nli.factory.js";
import { generateEvidenceId, getCurrentTimestamp } from "../utils/evidence-normalizer.js";

/**
 * NLI Verification Service.
 * Orchestrates evidence assessment and aggregates verdicts per claim.
 */
export class NliVerificationService {
  /**
   * Verifies claims against their evidence using NLI.
   * Only processes FACTUAL claims with evidence; others are skipped.
   *
   * @param {Array<{ claimId: string, text: string, normalizedText?: string, category: string, startTime: number, endTime: number, sourceSegmentIds?: number[], reason?: string, evidence?: Array<object> }>} claims
   * @param {object} [options]
   * @returns {Promise<{ results: Array<object>, summary: object }>}
   */
  static async verifyClaims(claims, options = {}) {
    // Handle potential config loading issues in test environment
    let nliMaxEvidencePerClaim = 5;
    let nliConfidenceThreshold = 0.7;
    let nliProvider = "mock";
    let nliLlmModel = "meta/llama-3.3-70b-instruct";
    try {
      nliMaxEvidencePerClaim = config?.nliMaxEvidencePerClaim || 5;
      nliConfidenceThreshold = config?.nliConfidenceThreshold || 0.7;
      nliProvider = config?.nliProvider || "mock";
      nliLlmModel = config?.nliLlmModel || "meta/llama-3.3-70b-instruct";
    } catch {
      // Use defaults
    }

    const maxEvidencePerClaim = options.maxEvidencePerClaim || nliMaxEvidencePerClaim;
    const confidenceThreshold = options.confidenceThreshold || nliConfidenceThreshold;
    const providerType = options.provider || nliProvider;
    const model = options.model || nliLlmModel;

    const provider = NliProviderFactory.getProvider({ provider: providerType, model });
    const results = [];
    let supports = 0;
    let refutes = 0;
    let notEnoughInfo = 0;
    let skipped = 0;
    let totalConfidence = 0;
    let confidenceCount = 0;

    for (const claim of claims) {
      // Skip non-factual claims
      if (claim.category !== "FACTUAL") {
        results.push({
          claimId: claim.claimId,
          claimText: claim.normalizedText || claim.text,
          finalVerdict: "NOT_ENOUGH_INFO",
          aggregateConfidence: 0,
          evidenceAssessments: [],
          supportingEvidenceCount: 0,
          refutingEvidenceCount: 0,
          neutralEvidenceCount: 0,
          summary: "Non-factual claim skipped",
          status: "SKIPPED_NO_EVIDENCE",
          errors: [{ code: "NON_FACTUAL_CLAIM", message: "NLI verification only supports FACTUAL claims" }],
        });
        skipped++;
        continue;
      }

      const evidence = claim.evidence || [];

      // Skip claims with no evidence
      if (evidence.length === 0) {
        results.push({
          claimId: claim.claimId,
          claimText: claim.normalizedText || claim.text,
          finalVerdict: "NOT_ENOUGH_INFO",
          aggregateConfidence: 0,
          evidenceAssessments: [],
          supportingEvidenceCount: 0,
          refutingEvidenceCount: 0,
          neutralEvidenceCount: 0,
          summary: "No evidence available for verification",
          status: "SKIPPED_NO_EVIDENCE",
          errors: [{ code: "NO_EVIDENCE", message: "No evidence provided for this claim" }],
        });
        skipped++;
        continue;
      }

      try {
        const claimResult = await this.verifyClaim(
          claim,
          evidence,
          provider,
          maxEvidencePerClaim,
          confidenceThreshold
        );

        results.push(claimResult);

        // Update summary counts based on claimResult status
        if (claimResult.status === "SKIPPED_NO_EVIDENCE") {
          skipped++;
        } else if (claimResult.finalVerdict === "SUPPORTS") {
          supports++;
        } else if (claimResult.finalVerdict === "REFUTES") {
          refutes++;
        } else {
          notEnoughInfo++;
        }

        if (claimResult.aggregateConfidence > 0) {
          totalConfidence += claimResult.aggregateConfidence;
          confidenceCount++;
        }
      } catch (err) {
        console.error(`[NliVerificationService] Failed to verify claim ${claim.claimId}:`, err.message);
        results.push({
          claimId: claim.claimId,
          claimText: claim.normalizedText || claim.text,
          finalVerdict: "NOT_ENOUGH_INFO",
          aggregateConfidence: 0,
          evidenceAssessments: [],
          supportingEvidenceCount: 0,
          refutingEvidenceCount: 0,
          neutralEvidenceCount: 0,
          summary: `Verification failed: ${err.message}`,
          status: "FAILED",
          errors: [{ code: "VERIFICATION_ERROR", message: err.message }],
        });
        notEnoughInfo++;
      }
    }

    const summary = {
      totalClaims: claims.length,
      supports,
      refutes,
      notEnoughInfo,
      skipped,
      averageConfidence: confidenceCount > 0 ? Number((totalConfidence / confidenceCount).toFixed(3)) : 0,
    };

    return { results, summary };
  }

  /**
   * Verifies a single claim against its evidence.
   * @param {object} claim
   * @param {Array<object>} evidence
   * @param {object} provider
   * @param {number} maxEvidencePerClaim
   * @param {number} confidenceThreshold
   * @returns {Promise<object>}
   */
  static async verifyClaim(claim, evidence, provider, maxEvidencePerClaim, confidenceThreshold) {
    const claimText = claim.normalizedText || claim.text;
    const errors = [];

    // Filter and limit evidence (only successful extractions, sorted by retrieval score)
    const validEvidence = evidence
      .filter((e) => ["SUCCESS", "PARTIAL"].includes(e.extractionStatus) && e.snippet)
      .sort((a, b) => (b.retrievalScore || 0) - (a.retrievalScore || 0))
      .slice(0, maxEvidencePerClaim);

    if (validEvidence.length === 0) {
      return {
        claimId: claim.claimId,
        claimText,
        finalVerdict: "NOT_ENOUGH_INFO",
        aggregateConfidence: 0,
        evidenceAssessments: [],
        supportingEvidenceCount: 0,
        refutingEvidenceCount: 0,
        neutralEvidenceCount: 0,
        summary: "No valid evidence available for verification",
        status: "SKIPPED_NO_EVIDENCE",
        errors: [{ code: "NO_VALID_EVIDENCE", message: "All evidence items had failed extractions or empty snippets" }],
      };
    }

    // Prepare evidence items for NLI provider
    const evidenceForNli = validEvidence.map((e) => ({
      evidenceId: e.evidenceId,
      snippet: e.snippet,
      title: e.title,
      url: e.url,
      sourceType: e.sourceType,
      retrievalScore: e.retrievalScore || 0,
    }));

    // Get NLI assessments
    let assessments;
    try {
      assessments = await provider.assessEvidence(claimText, evidenceForNli);
    } catch (err) {
      errors.push({ code: "NLI_ASSESSMENT_FAILED", message: err.message });
      return {
        claimId: claim.claimId,
        claimText,
        finalVerdict: "NOT_ENOUGH_INFO",
        aggregateConfidence: 0,
        evidenceAssessments: [],
        supportingEvidenceCount: 0,
        refutingEvidenceCount: 0,
        neutralEvidenceCount: 0,
        summary: `NLI assessment failed: ${err.message}`,
        status: "FAILED",
        errors,
      };
    }

    // Map assessments back to full evidence items
    const evidenceAssessments = assessments.map((assessment) => {
      const evidenceItem = validEvidence.find((e) => e.evidenceId === assessment.evidenceId);
      return {
        evidenceId: assessment.evidenceId,
        verdict: assessment.verdict,
        confidence: assessment.confidence,
        reasoning: assessment.reasoning,
        relevantSnippet: assessment.relevantSnippet,
      };
    });

    // Aggregate verdict
    const { finalVerdict, aggregateConfidence, supportingEvidenceCount, refutingEvidenceCount, neutralEvidenceCount } =
      this.aggregateVerdict(evidenceAssessments, confidenceThreshold);

    // Generate summary
    const summary = this.generateSummary(
      finalVerdict,
      aggregateConfidence,
      supportingEvidenceCount,
      refutingEvidenceCount,
      neutralEvidenceCount
    );

    // Determine overall status
    let status = "COMPLETED";
    if (errors.length > 0) {
      status = "PARTIAL";
    }

    return {
      claimId: claim.claimId,
      claimText,
      finalVerdict,
      aggregateConfidence,
      evidenceAssessments,
      supportingEvidenceCount,
      refutingEvidenceCount,
      neutralEvidenceCount,
      summary,
      status,
      errors,
    };
  }

  /**
   * Aggregates individual evidence assessments into a final verdict.
   * @param {Array<object>} assessments
   * @param {number} confidenceThreshold
   * @returns {object}
   */
  static aggregateVerdict(assessments, confidenceThreshold) {
    if (assessments.length === 0) {
      return {
        finalVerdict: "NOT_ENOUGH_INFO",
        aggregateConfidence: 0,
        supportingEvidenceCount: 0,
        refutingEvidenceCount: 0,
        neutralEvidenceCount: 0,
      };
    }

    // Count verdicts weighted by confidence
    let supportsWeight = 0;
    let refutesWeight = 0;
    let neutralWeight = 0;

    let supportsCount = 0;
    let refutesCount = 0;
    let neutralCount = 0;

    for (const a of assessments) {
      const weight = a.confidence || 0;
      if (a.verdict === "SUPPORTS") {
        supportsWeight += weight;
        supportsCount++;
      } else if (a.verdict === "REFUTES") {
        refutesWeight += weight;
        refutesCount++;
      } else {
        neutralWeight += weight;
        neutralCount++;
      }
    }

    // Determine final verdict based on weighted scores
    let finalVerdict;
    let aggregateConfidence;

    const totalWeight = supportsWeight + refutesWeight + neutralWeight;

    if (totalWeight === 0) {
      finalVerdict = "NOT_ENOUGH_INFO";
      aggregateConfidence = 0;
    } else if (supportsWeight > refutesWeight && supportsWeight > neutralWeight) {
      finalVerdict = "SUPPORTS";
      aggregateConfidence = Number((supportsWeight / totalWeight).toFixed(3));
    } else if (refutesWeight > supportsWeight && refutesWeight > neutralWeight) {
      finalVerdict = "REFUTES";
      aggregateConfidence = Number((refutesWeight / totalWeight).toFixed(3));
    } else {
      finalVerdict = "NOT_ENOUGH_INFO";
      aggregateConfidence = Number((neutralWeight / totalWeight).toFixed(3));
    }

    // Apply confidence threshold - if confidence is too low, downgrade to NOT_ENOUGH_INFO
    if (aggregateConfidence < confidenceThreshold && finalVerdict !== "NOT_ENOUGH_INFO") {
      finalVerdict = "NOT_ENOUGH_INFO";
      aggregateConfidence = Number((neutralWeight / totalWeight).toFixed(3));
    }

    return {
      finalVerdict,
      aggregateConfidence,
      supportingEvidenceCount: supportsCount,
      refutingEvidenceCount: refutesCount,
      neutralEvidenceCount: neutralCount,
    };
  }

  /**
   * Generates a human-readable summary of the verification result.
   * @param {string} verdict
   * @param {number} confidence
   * @param {number} supportsCount
   * @param {number} refutesCount
   * @param {number} neutralCount
   * @returns {string}
   */
  static generateSummary(verdict, confidence, supportsCount, refutesCount, neutralCount) {
    const total = supportsCount + refutesCount + neutralCount;
    const pct = (n) => total > 0 ? Math.round((n / total) * 100) : 0;

    const verdictLabels = {
      SUPPORTS: "Supported",
      REFUTES: "Refuted",
      NOT_ENOUGH_INFO: "Inconclusive",
    };

    return `${verdictLabels[verdict]} (${(confidence * 100).toFixed(0)}% confidence) — ` +
      `${supportsCount} supporting, ${refutesCount} refuting, ${neutralCount} inconclusive of ${total} evidence items`;
  }
}