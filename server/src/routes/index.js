import { Router } from "express";
import videoRoutes from "./video.routes.js";
import claimRoutes from "./claim.routes.js";
import evidenceRoutes from "./evidence.routes.js";
import nliRoutes from "./nli.routes.js";
import { TranscriptionService } from "../services/transcription.service.js";
import { sendSuccess } from "../utils/response.utils.js";

const router = Router();

// Health check endpoint
router.get("/health", async (_req, res) => {
  const whisperHealth = await TranscriptionService.checkHealth();
  return sendSuccess(res, {
    status: "healthy",
    service: "video-claim-verifier-backend",
    whisperService: whisperHealth,
  });
});

// Mount video routes
router.use("/videos", videoRoutes);

// Mount claim routes (Phase 2)
router.use("/claims", claimRoutes);

// Mount evidence routes (Phase 3)
router.use("/evidence", evidenceRoutes);

// Mount NLI routes (Phase 4)
router.use("/nli", nliRoutes);

export default router;
