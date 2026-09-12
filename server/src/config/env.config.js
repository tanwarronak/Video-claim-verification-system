import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRootDir = path.resolve(__dirname, "../../");

export const config = {
  port: parseInt(process.env.PORT || "5000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  whisperServiceUrl: process.env.WHISPER_SERVICE_URL || "http://localhost:8000",
  maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || "100", 10),
  uploadDir: path.join(serverRootDir, "uploads"),
  tempDir: path.join(serverRootDir, "temp"),
};
