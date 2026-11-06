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
  whisperRequestTimeoutMs: parseInt(process.env.WHISPER_REQUEST_TIMEOUT_MS || "1800000", 10),
  maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || "100", 10),
  uploadDir: path.join(serverRootDir, "uploads"),
  tempDir: path.join(serverRootDir, "temp"),

  // NVIDIA NIM Configuration for claim extraction and verification
  nvidiaApiKey: process.env.NVIDIA_API_KEY || "",
  nvidiaBaseUrl: process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1",
  nvidiaRequestTimeoutMs: parseInt(process.env.NVIDIA_REQUEST_TIMEOUT_MS || "600000", 10),
  claimLlmProvider: process.env.CLAIM_LLM_PROVIDER || "nvidia",
  claimLlmModel: process.env.CLAIM_LLM_MODEL || "nvidia/nemotron-3-ultra-550b-a55b",

  // Phase 3: Evidence Retrieval Configuration
  searchProvider: process.env.SEARCH_PROVIDER || "youcom",
  searchApiKey: process.env.SEARCH_API_KEY || "",
  evidenceMaxQueries: parseInt(process.env.EVIDENCE_MAX_QUERIES || "3", 10),
  evidenceResultsPerQuery: parseInt(process.env.EVIDENCE_RESULTS_PER_QUERY || "5", 10),
  evidenceMaxResultsPerClaim: parseInt(process.env.EVIDENCE_MAX_RESULTS_PER_CLAIM || "8", 10),
  evidenceRequestTimeoutMs: parseInt(process.env.EVIDENCE_REQUEST_TIMEOUT_MS || "10000", 10),
  evidenceMaxPageSizeMb: parseInt(process.env.EVIDENCE_MAX_PAGE_SIZE_MB || "2", 10),
  evidenceMaxTextLength: parseInt(process.env.EVIDENCE_MAX_TEXT_LENGTH || "5000", 10),
  evidenceMaxConcurrentFetches: parseInt(process.env.EVIDENCE_MAX_CONCURRENT_FETCHES || "3", 10),
  evidenceMaxTotalTimeMs: parseInt(process.env.EVIDENCE_MAX_TOTAL_TIME_MS || "30000", 10),

  // Phase 4: NLI Verification Configuration
  nliProvider: process.env.NLI_PROVIDER || "nvidia",
  nliLlmModel: process.env.NLI_LLM_MODEL || "meta/llama-3.3-70b-instruct",
  nliMaxEvidencePerClaim: parseInt(process.env.NLI_MAX_EVIDENCE_PER_CLAIM || "5", 10),
  nliConfidenceThreshold: parseFloat(process.env.NLI_CONFIDENCE_THRESHOLD || "0.7"),
};
