import { Router } from "express";
import { VideoController } from "../controllers/video.controller.js";
import { uploadVideo } from "../middleware/upload.middleware.js";

const router = Router();

// POST /api/videos/transcribe
router.post("/transcribe", uploadVideo, VideoController.transcribeVideo);

export default router;
