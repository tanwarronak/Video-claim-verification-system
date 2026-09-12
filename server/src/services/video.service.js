import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

// Set binary paths for cross-platform compatibility
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}
if (ffprobeStatic && ffprobeStatic.path) {
  ffmpeg.setFfprobePath(ffprobeStatic.path);
}

export class VideoService {
  /**
   * Probes the media file to inspect streams and metadata.
   * @param {string} filePath
   * @returns {Promise<ffmpeg.FfprobeData>}
   */
  static probeMedia(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          return reject(new Error(`Failed to read video metadata: ${err.message}`));
        }
        resolve(metadata);
      });
    });
  }

  /**
   * Extracts a normalized 16kHz mono WAV audio stream from the video.
   * @param {string} videoFilePath - Path to source video file
   * @param {string} outputWavPath - Destination path for extracted audio
   * @returns {Promise<{ wavPath: string, duration: number }>}
   */
  static async extractAudio(videoFilePath, outputWavPath) {
    // 1. Probe video to verify stream validity and check for audio track
    const metadata = await this.probeMedia(videoFilePath);
    const audioStreams = (metadata.streams || []).filter(
      (s) => s.codec_type === "audio"
    );

    if (audioStreams.length === 0) {
      const err = new Error(
        "Uploaded video does not contain an audio track to transcribe."
      );
      err.code = "NO_AUDIO_STREAM";
      err.statusCode = 400;
      throw err;
    }

    const duration = metadata.format?.duration
      ? parseFloat(metadata.format.duration)
      : 0;

    // 2. Perform FFmpeg extraction
    return new Promise((resolve, reject) => {
      ffmpeg(videoFilePath)
        .noVideo() // -vn
        .audioCodec("pcm_s16le") // 16-bit PCM
        .audioFrequency(16000) // 16kHz sample rate optimal for Whisper
        .audioChannels(1) // Mono
        .output(outputWavPath)
        .on("start", (cmd) => {
          console.log(`[VideoService] FFmpeg started: ${cmd}`);
        })
        .on("error", (err) => {
          console.error(`[VideoService] FFmpeg extraction failed:`, err.message);
          const customErr = new Error(`Audio extraction failed: ${err.message}`);
          customErr.code = "FFMPEG_EXTRACTION_FAILED";
          customErr.statusCode = 500;
          reject(customErr);
        })
        .on("end", () => {
          console.log(`[VideoService] Audio extraction finished: ${outputWavPath}`);
          resolve({
            wavPath: outputWavPath,
            duration,
          });
        })
        .run();
    });
  }
}
