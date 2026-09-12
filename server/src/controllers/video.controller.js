import path from "path";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config/env.config.js";
import { VideoService } from "../services/video.service.js";
import { TranscriptionService } from "../services/transcription.service.js";
import { safeDeleteFile } from "../utils/file.utils.js";
import { sendSuccess } from "../utils/response.utils.js";

export class VideoController {
  /**
   * Endpoint handler for POST /api/videos/transcribe
   */
  static async transcribeVideo(req, res, next) {
    if (!req.file) {
      const err = new Error("No video file uploaded. Please provide a video in the 'video' field.");
      err.code = "MISSING_FILE";
      err.statusCode = 400;
      return next(err);
    }

    const uploadedVideoPath = req.file.path;
    const tempWavPath = path.join(config.tempDir, `audio_${uuidv4()}.wav`);

    try {
      console.log(`[VideoController] Processing uploaded video: ${req.file.originalname} (${req.file.size} bytes)`);

      // 1. Extract audio via FFmpeg
      const extractionResult = await VideoService.extractAudio(uploadedVideoPath, tempWavPath);

      // 2. Send extracted audio to Whisper microservice
      const transcriptData = await TranscriptionService.transcribeAudio(extractionResult.wavPath);

      // 3. Assemble and return structured response
      return sendSuccess(
        res,
        {
          transcript: {
            text: transcriptData.text,
            duration: transcriptData.duration || extractionResult.duration,
            language: transcriptData.language,
            languageProbability: transcriptData.language_probability,
            segments: transcriptData.segments,
          },
          meta: {
            originalName: req.file.originalname,
            fileSize: req.file.size,
            mimetype: req.file.mimetype,
          },
        },
        200
      );
    } catch (err) {
      next(err);
    } finally {
      // 4. Guarantee cleanup of temporary uploaded video and extracted audio WAV
      await safeDeleteFile(uploadedVideoPath);
      await safeDeleteFile(tempWavPath);
      console.log("[VideoController] Temporary video and audio files cleaned up.");
    }
  }
}
