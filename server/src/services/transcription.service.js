import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import { config } from "../config/env.config.js";

export class TranscriptionService {
  /**
   * Sends the audio file to the Whisper microservice for timestamped transcription.
   * @param {string} audioFilePath - Absolute path to the 16kHz WAV file
   * @returns {Promise<{ text: string, duration: number, language: string, segments: Array<{ id: number, start: number, end: number, text: string }> }>}
   */
  static async transcribeAudio(audioFilePath, language) {
    if (!fs.existsSync(audioFilePath)) {
      const err = new Error(`Audio file not found: ${audioFilePath}`);
      err.code = "AUDIO_FILE_NOT_FOUND";
      err.statusCode = 500;
      throw err;
    }

    const form = new FormData();
    form.append("file", fs.createReadStream(audioFilePath), {
      filename: path.basename(audioFilePath),
      contentType: "audio/wav",
    });
    if (language) {
      form.append("language", language);
    }

    const endpoint = `${config.whisperServiceUrl}/transcribe`;

    try {
      console.log(`[TranscriptionService] Sending audio to Whisper service at ${endpoint}...`);
      const response = await axios.post(endpoint, form, {
        headers: {
          ...form.getHeaders(),
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: config.whisperRequestTimeoutMs,
      });

      if (!response.data || !response.data.success) {
        throw new Error(response.data?.error?.message || "Invalid response from Whisper service");
      }

      return response.data.data;
    } catch (err) {
      if (err.code === "ECONNREFUSED") {
        const connErr = new Error(
          `Whisper microservice is not reachable at ${config.whisperServiceUrl}. Please ensure the Python service is running.`
        );
        connErr.code = "WHISPER_SERVICE_UNAVAILABLE";
        connErr.statusCode = 503;
        throw connErr;
      }

      if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") {
        const timeoutMinutes = Math.round(config.whisperRequestTimeoutMs / 60000);
        const timeoutErr = new Error(
          `Whisper transcription exceeded its ${timeoutMinutes}-minute time limit. For long videos, increase WHISPER_REQUEST_TIMEOUT_MS in server/.env or use a faster device/model.`
        );
        timeoutErr.code = "TRANSCRIPTION_TIMEOUT";
        timeoutErr.statusCode = 504;
        throw timeoutErr;
      }

      console.error("[TranscriptionService] Error during transcription request:", err.message);
      const customErr = new Error(
        err.response?.data?.detail || err.message || "Failed to transcribe audio."
      );
      customErr.code = "TRANSCRIPTION_FAILED";
      customErr.statusCode = err.response?.status || 500;
      throw customErr;
    }
  }

  /**
   * Health check for Whisper microservice.
   */
  static async checkHealth() {
    try {
      const response = await axios.get(`${config.whisperServiceUrl}/health`, { timeout: 5000 });
      return response.data;
    } catch (err) {
      return { status: "unreachable", error: err.message };
    }
  }
}
