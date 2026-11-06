import { z } from "zod";

/**
 * Evidence Source Type Enum.
 */
export const SourceTypeEnum = z.enum(["NEWS", "ACADEMIC", "GOVERNMENT", "ORGANIZATION", "BLOG", "FORUM", "OTHER"]);

/**
 * Evidence Extraction Status Enum.
 */
export const ExtractionStatusEnum = z.enum(["SUCCESS", "PARTIAL", "FAILED", "SKIPPED"]);

/**
 * Single Evidence Item Schema.
 */
export const EvidenceItemSchema = z.object({
  evidenceId: z.string().min(1, "Evidence ID cannot be empty"),
  claimId: z.string().min(1, "Claim ID cannot be empty"),
  title: z.string().min(1, "Title cannot be empty"),
  url: z.string().url("URL must be a valid HTTP/HTTPS URL"),
  publisher: z.string().nullable().optional(),
  publishedAt: z.string().datetime({ offset: true }).nullable().optional(),
  retrievedAt: z.string().datetime({ offset: true }),
  snippet: z.string().min(1, "Snippet cannot be empty"),
  sourceType: SourceTypeEnum,
  retrievalScore: z.number().min(0).max(1, "Retrieval score must be between 0 and 1"),
  searchQuery: z.string().min(1, "Search query cannot be empty"),
  extractionStatus: ExtractionStatusEnum,
});

/**
 * Evidence Retrieval Result for a Single Claim.
 */
export const ClaimEvidenceResultSchema = z.object({
  claimId: z.string().min(1),
  claimText: z.string().min(1),
  status: z.enum(["COMPLETED", "PARTIAL", "FAILED", "SKIPPED_NON_FACTUAL"]),
  queries: z.array(z.string().min(1)).max(10),
  evidence: z.array(EvidenceItemSchema).max(20),
  errors: z.array(z.object({
    code: z.string(),
    message: z.string(),
    query: z.string().optional(),
    url: z.string().optional(),
  })).default([]),
});

/**
 * Evidence Retrieval Request Schema.
 */
export const EvidenceRetrievalRequestSchema = z.object({
  claims: z.array(z.object({
    claimId: z.string().min(1),
    text: z.string().min(1),
    normalizedText: z.string().min(1).optional(),
    category: z.enum(["FACTUAL", "OPINION", "PREDICTION", "NON_CLAIM"]),
    startTime: z.number().min(0),
    endTime: z.number().min(0),
    sourceSegmentIds: z.array(z.number().int().nonnegative()).optional(),
    reason: z.string().optional(),
  })).min(1, "At least one claim is required").max(50, "Too many claims in a single request"),
  options: z.object({
    maxQueriesPerClaim: z.number().int().positive().max(10).optional(),
    maxResultsPerClaim: z.number().int().positive().max(50).optional(),
    provider: z.enum(["brave", "youcom", "mock"]).optional(),
  }).optional(),
});

/**
 * Evidence Retrieval Response Schema.
 */
export const EvidenceRetrievalResponseSchema = z.object({
  success: z.boolean(),
  results: z.array(ClaimEvidenceResultSchema),
  summary: z.object({
    totalClaims: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    partial: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skippedNonFactual: z.number().int().nonnegative(),
    totalEvidenceItems: z.number().int().nonnegative(),
  }),
});

/**
 * Validates evidence retrieval request payload.
 * @param {any} data
 */
export function validateEvidenceRetrievalRequest(data) {
  const result = EvidenceRetrievalRequestSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues || result.error.errors || [];
    const errorDetails = issues.map((err) => ({
      field: (err.path || []).join("."),
      issue: err.message,
    }));
    return {
      success: false,
      error: "Invalid request payload. Please provide valid claims array.",
      details: errorDetails,
    };
  }
  return {
    success: true,
    data: result.data,
  };
}

/**
 * Validates evidence retrieval response.
 * @param {any} data
 */
export function validateEvidenceRetrievalResponse(data) {
  return EvidenceRetrievalResponseSchema.safeParse(data);
}

/**
 * Validates a single evidence item.
 * @param {any} data
 */
export function validateEvidenceItem(data) {
  return EvidenceItemSchema.safeParse(data);
}

export const OPENAI_EVIDENCE_JSON_SCHEMA = {
  type: "object",
  properties: {
    claims: {
      type: "array",
      description: "List of claims for which to generate search queries.",
      items: {
        type: "object",
        properties: {
          claimId: { type: "string" },
          normalizedText: { type: "string" },
        },
        required: ["claimId", "normalizedText"],
        additionalProperties: false,
      },
    },
  },
  required: ["claims"],
  additionalProperties: false,
};