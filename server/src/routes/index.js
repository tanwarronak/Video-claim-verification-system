import { Router } from "express";
import videoRoutes from "./video.routes.js";
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

export default router;
