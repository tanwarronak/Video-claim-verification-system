import { EvidenceRetrievalService } from "../services/evidence-retrieval.service.js";
import { validateEvidenceRetrievalRequest } from "../validators/evidence.validator.js";
import { sendSuccess, sendError } from "../utils/response.utils.js";

export class EvidenceController {
  /**
   * Endpoint handler for POST /api/evidence/retrieve
   */
  static async retrieveEvidence(req, res, next) {
    try {
      // 1. Validate incoming request body
      const validation = validateEvidenceRetrievalRequest(req.body);
      if (!validation.success) {
        return sendError(
          res,
          validation.error,
          "INVALID_EVIDENCE_REQUEST",
          400,
          validation.details
        );
      }

      const { claims, options } = validation.data;

      // 2. Perform evidence retrieval
      console.log(
        `[EvidenceController] Retrieving evidence for ${claims.length} claim(s)...`
      );
      const { results, summary } = await EvidenceRetrievalService.retrieveEvidence(claims, options);

      // 3. Return standardized response envelope
      return sendSuccess(res, { results, summary }, 200);
    } catch (err) {
      next(err);
    }
  }
}