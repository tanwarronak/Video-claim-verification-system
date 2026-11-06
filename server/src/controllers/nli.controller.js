import { NliVerificationService } from "../services/nli-verification.service.js";
import { validateNliVerificationRequest } from "../validators/nli.validator.js";
import { sendSuccess, sendError } from "../utils/response.utils.js";

export class NliController {
  /**
   * Endpoint handler for POST /api/nli/verify
   */
  static async verifyClaims(req, res, next) {
    try {
      // 1. Validate incoming request body
      const validation = validateNliVerificationRequest(req.body);
      if (!validation.success) {
        return sendError(
          res,
          validation.error,
          "INVALID_NLI_REQUEST",
          400,
          validation.details
        );
      }

      const { claims, options } = validation.data;

      // 2. Perform NLI verification
      console.log(
        `[NliController] Verifying ${claims.length} claim(s) against evidence...`
      );
      const { results, summary } = await NliVerificationService.verifyClaims(claims, options);

      // 3. Return standardized response envelope
      return sendSuccess(res, { results, summary }, 200);
    } catch (err) {
      next(err);
    }
  }
}