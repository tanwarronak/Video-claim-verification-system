import { ClaimService } from "../services/claim.service.js";
import { validateExtractClaimsRequest } from "../validators/transcript.validator.js";
import { sendSuccess, sendError } from "../utils/response.utils.js";

export class ClaimController {
  /**
   * Endpoint handler for POST /api/claims/extract
   */
  static async extractClaims(req, res, next) {
    try {
      // 1. Validate incoming request body
      const validation = validateExtractClaimsRequest(req.body);
      if (!validation.success) {
        return sendError(
          res,
          validation.error,
          "INVALID_TRANSCRIPT_PAYLOAD",
          400,
          validation.details
        );
      }

      const { transcript, options } = validation.data;

      // 2. Perform claim extraction, classification, normalization, and alignment
      console.log(
        `[ClaimController] Extracting claims for transcript (${transcript.segments?.length || 0} segments)...`
      );
      const result = await ClaimService.extractClaims(transcript, options);

      // 3. Return standardized response envelope
      return sendSuccess(res, result, 200);
    } catch (err) {
      next(err);
    }
  }
}
