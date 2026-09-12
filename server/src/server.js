import app from "./app.js";
import { config } from "./config/env.config.js";
import { ensureDirectoriesExist } from "./utils/file.utils.js";

// Ensure upload and temp folders exist before accepting traffic
ensureDirectoriesExist([config.uploadDir, config.tempDir]);

const server = app.listen(config.port, () => {
  console.log(`=======================================================`);
  console.log(` AI Video Claim Verifier - Backend Service Running`);
  console.log(` Port:            ${config.port}`);
  console.log(` Environment:     ${config.nodeEnv}`);
  console.log(` Whisper URL:     ${config.whisperServiceUrl}`);
  console.log(` Max File Size:   ${config.maxFileSizeMb} MB`);
  console.log(`=======================================================`);
});

// Graceful shutdown handling
process.on("SIGTERM", () => {
  console.log("[Server] SIGTERM received. Shutting down gracefully...");
  server.close(() => {
    console.log("[Server] Process terminated.");
  });
});
