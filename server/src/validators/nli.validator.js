import { z } from "zod";

/**
 * NLI Verdict Enum.
 */
export const VerdictEnum = z.enum(["SUPPORTS", "REFUTES", "NOT_ENOUGH_INFO"]);

/**
 * Single Evidence Assessment Schema.
 */
export const EvidenceAssessmentSchema = z.object({
  evidenceId: z.string().min(1),
  verdict: VerdictEnum,
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
  relevantSnippet: z.string().optional(),
});

export const NliAssessmentsSchema = z.object({
  assessments: z.array(EvidenceAssessmentSchema),
});

/**
 * Claim Verification Result Schema.
 */
export const ClaimVerificationSchema = z.object({
  claimId: z.string().min(1),
  claimText: z.string().min(1),
  finalVerdict: VerdictEnum,
  aggregateConfidence: z.number().min(0).max(1),
  evidenceAssessments: z.array(EvidenceAssessmentSchema).max(20),
  supportingEvidenceCount: z.number().int().nonnegative(),
  refutingEvidenceCount: z.number().int().nonnegative(),
  neutralEvidenceCount: z.number().int().nonnegative(),
  summary: z.string().min(1),
  status: z.enum(["COMPLETED", "PARTIAL", "FAILED", "SKIPPED_NO_EVIDENCE"]),
  errors: z.array(z.object({
    code: z.string(),
    message: z.string(),
    evidenceId: z.string().optional(),
  })).default([]),
});

/**
 * NLI Verification Request Schema.
 */
export const NliVerificationRequestSchema = z.object({
  claims: z.array(z.object({
    claimId: z.string().min(1),
    text: z.string().min(1),
    normalizedText: z.string().min(1).optional(),
    category: z.enum(["FACTUAL", "OPINION", "PREDICTION", "NON_CLAIM"]),
    startTime: z.number().min(0),
    endTime: z.number().min(0),
    sourceSegmentIds: z.array(z.number().int().nonnegative()).optional(),
    reason: z.string().optional(),
    evidence: z.array(z.object({
      evidenceId: z.string().min(1),
      claimId: z.string().min(1),
      title: z.string().min(1),
      url: z.string().url(),
      publisher: z.string().nullable().optional(),
      publishedAt: z.string().datetime({ offset: true }).nullable().optional(),
      retrievedAt: z.string().datetime({ offset: true }),
      snippet: z.string().min(1),
      sourceType: z.enum(["NEWS", "ACADEMIC", "GOVERNMENT", "ORGANIZATION", "BLOG", "FORUM", "OTHER"]),
      retrievalScore: z.number().min(0).max(1),
      searchQuery: z.string().min(1),
      extractionStatus: z.enum(["SUCCESS", "PARTIAL", "FAILED", "SKIPPED"]),
    })).max(20).optional(),
  })).min(1).max(50),
  options: z.object({
    maxEvidencePerClaim: z.number().int().positive().max(20).optional(),
    confidenceThreshold: z.number().min(0).max(1).optional(),
    provider: z.enum(["nvidia", "mock"]).optional(),
  }).optional(),
});

/**
 * NLI Verification Response Schema.
 */
export const NliVerificationResponseSchema = z.object({
  success: z.boolean(),
  results: z.array(ClaimVerificationSchema),
  summary: z.object({
    totalClaims: z.number().int().nonnegative(),
    supports: z.number().int().nonnegative(),
    refutes: z.number().int().nonnegative(),
    notEnoughInfo: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    averageConfidence: z.number().min(0).max(1),
  }),
});

/**
 * Validates NLI verification request payload.
 * @param {any} data
 */
export function validateNliVerificationRequest(data) {
  const result = NliVerificationRequestSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues || result.error.errors || [];
    const errorDetails = issues.map((err) => ({
      field: (err.path || []).join("."),
      issue: err.message,
    }));
    return {
      success: false,
      error: "Invalid request payload. Please provide valid claims array with evidence.",
      details: errorDetails,
    };
  }
  return {
    success: true,
    data: result.data,
  };
}

/**
 * Validates NLI verification response.
 * @param {any} data
 */
export function validateNliVerificationResponse(data) {
  return NliVerificationResponseSchema.safeParse(data);
}

/**
 * Validates a single claim verification result.
 * @param {any} data
 */
export function validateClaimVerification(data) {
  return ClaimVerificationSchema.safeParse(data);
}
