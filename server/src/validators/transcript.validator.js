import { z } from "zod";

/**
 * Segment Schema representing a single timestamped Whisper segment.
 */
export const SegmentSchema = z.object({
  id: z.union([z.number(), z.string()]).transform((val) => Number(val)),
  start: z.number().min(0, "Segment start timestamp must be non-negative"),
  end: z.number().min(0, "Segment end timestamp must be non-negative"),
  text: z.string().trim(),
});

/**
 * Full Transcript Schema representing Phase 1 output.
 */
export const TranscriptSchema = z.object({
  text: z.string().default(""),
  duration: z.number().min(0).optional(),
  language: z.string().optional(),
  languageProbability: z.number().min(0).max(1).optional(),
  segments: z.array(SegmentSchema).default([]),
});

/**
 * Extract Claims Request Schema.
 */
export const ExtractClaimsRequestSchema = z.object({
  transcript: TranscriptSchema,
  options: z
    .object({
      provider: z.enum(["nvidia", "mock"]).optional(),
      model: z.string().optional(),
    })
    .optional(),
});

/**
 * Validates request payload against ExtractClaimsRequestSchema.
 * @param {any} data
 * @returns {{ success: boolean, data?: z.infer<typeof ExtractClaimsRequestSchema>, error?: string, details?: any }}
 */
export function validateExtractClaimsRequest(data) {
  const result = ExtractClaimsRequestSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues || result.error.errors || [];
    const errorDetails = issues.map((err) => ({
      field: (err.path || []).join("."),
      issue: err.message,
    }));
    return {
      success: false,
      error: "Invalid request payload. Please provide a valid transcript object.",
      details: errorDetails,
    };
  }
  return {
    success: true,
    data: result.data,
  };
}
