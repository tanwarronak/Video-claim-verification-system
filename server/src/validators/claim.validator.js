import { z } from "zod";

/**
 * Supported Claim Categories as per Phase 2 specification.
 */
export const ClaimTypeEnum = z.enum(["FACTUAL", "OPINION", "PREDICTION", "NON_CLAIM"]);

/**
 * Single Claim Schema.
 */
export const ClaimSchema = z.object({
  id: z.string().min(1, "Claim ID cannot be empty"),
  originalText: z.string().min(1, "Original text cannot be empty"),
  normalizedText: z.string().min(1, "Normalized text cannot be empty"),
  type: ClaimTypeEnum,
  startTime: z.number().min(0, "Start time must be non-negative"),
  endTime: z.number().min(0, "End time must be non-negative"),
  sourceSegmentIds: z.array(z.number().int().nonnegative()),
  reason: z.string().min(1, "Classification reason must be provided"),
});

/**
 * Raw Claim Extraction item emitted directly by LLMs.
 */
export const RawClaimItemSchema = z.object({
  originalText: z.string().min(1, "Original text cannot be empty"),
  normalizedText: z.string().min(1, "Normalized text cannot be empty"),
  type: ClaimTypeEnum,
  sourceSegmentIds: z.array(z.number().int().nonnegative()),
  reason: z.string().min(1, "Classification reason must be provided"),
});

export const RawLLMExtractionSchema = z.object({
  claims: z.array(RawClaimItemSchema),
});

/**
 * Claim Summary Metrics Schema.
 */
export const ClaimSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  factual: z.number().int().nonnegative(),
  opinion: z.number().int().nonnegative(),
  prediction: z.number().int().nonnegative(),
  nonClaim: z.number().int().nonnegative(),
});

/**
 * Complete Structured Output Result Schema.
 */
export const ClaimExtractionResultSchema = z.object({
  claims: z.array(ClaimSchema),
  summary: ClaimSummarySchema,
});

/**
 * Validates a list of claims and returns structured validation outcome.
 * @param {any} data
 */
export function validateClaimResult(data) {
  return ClaimExtractionResultSchema.safeParse(data);
}
