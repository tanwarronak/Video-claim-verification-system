# AI-Based Video Claim Verification System

An automated end-to-end system for detecting, verifying, and reporting factual claims in video content using Speech-to-Text, Natural Language Processing, Evidence Retrieval, and Natural Language Inference (NLI).

---

## Project Status

### Phase 1: Video to Timestamped Transcript (Completed)
- Securely ingest multi-format video files (`.mp4`, `.mov`, `.webm`, `.mkv`).
- Extract optimized 16kHz mono audio streams via FFmpeg.
- Transcribe speech with timestamped segments using configurable `faster-whisper` beam search, voice activity detection, and decode-time fallback.
- Optionally provide the video's language; transcript segments can be reviewed and corrected, then claims re-extracted.
- Phase 2 analyzes long transcripts in overlapping, bounded chunks to retain nearby context without asking the model to process an entire long video in one prompt.
- Return structured transcript segments via an extensible REST API.
- Auto-cleanup of temporary video and audio files.

### Phase 2: Transcript to Claim Detection & Classification (Completed)
- **Sentence Segmentation**: Atomic proposition extraction handling multi-claim segments and cross-segment spans.
- **Semantic Claim Classification**: Categorizes assertions into `FACTUAL`, `OPINION`, `PREDICTION`, and `NON_CLAIM` with concise semantic rationale.
- **Timestamp Preservation**: Accurate mapping of source segment boundaries to claim start/end times.
- **Claim Normalization**: Clean, self-contained declarative statements with disfluency removal and antecedent resolution without changing meaning or hallucinating facts.
- **Structured Schema & Validation**: NVIDIA NIM JSON output is validated with Zod schemas and checked against the exact source segments.
- **Pluggable LLM Provider**: NVIDIA NIM models or deterministic Mock provider for offline testing and CI.
- **REST API**: `POST /api/claims/extract`.
- **Interactive UI**: Category filter tabs, keyword search, summary metrics, and timestamped claim cards with video excerpt playback.

Claim extraction retries one malformed or ungrounded model response. It rejects source quotes that do not appear in the referenced transcript segments instead of assigning potentially misleading timestamps.

### Phase 3: Evidence Retrieval for Factual Claims (Completed)
- **Query Generation**: Creates targeted search queries per factual claim, including a balanced fact-check query intended to find evidence for and against it.
- **Pluggable Search Provider**: You.com or Brave Search API for live evidence; mock fixtures are reserved for offline tests.
- **Web Search Execution**: Searches configured provider, normalizes and deduplicates results across queries.
- **Safe Page Fetching**: Retrieves accessible source pages with SSRF protection (blocks private IPs, localhost, cloud metadata endpoints, validates redirects, limits size/time).
- **Passage Extraction**: Extracts relevant text passages from fetched pages using claim-term overlap scoring.
- **Evidence Ranking**: Transparent, deterministic baseline ranking combining lexical similarity (40%), entity overlap (25%), number/date matching (15%), source type weight (10%), and freshness (10%). Scores normalized 0–1.
- **Deduplication**: Removes duplicate URLs and near-identical passages; preserves original source attribution.
- **Structured Output**: Evidence items include title, URL, publisher, publication date, retrieval timestamp, snippet, source type, retrieval score, originating query, and extraction status.
- **Zod Validation**: Full request/response validation with explicit schemas for evidence items, claim results, and summary metrics.
- **REST API**: `POST /api/evidence/retrieve` accepting Phase 2 claim objects, returning evidence grouped by claim with status and error details.
- **Frontend Integration**: Automatically searches evidence for factual claims after extraction; shows clickable sources, scores, and metadata.
- **Mock Mode**: Deterministic synthetic fixtures for testing without API keys or internet access.

### Phase 4: NLI Verification Engine (Completed)
- **Natural Language Inference**: Compares each factual claim against its retrieved evidence to produce `SUPPORTS`, `REFUTES`, or `NOT_ENOUGH_INFO` verdicts.
- **Per-Evidence Assessment**: Each evidence item individually assessed with confidence score (0–1) and reasoning.
- **Verdict Aggregation**: Weighted aggregation of per-evidence verdicts using confidence scores; applies configurable confidence threshold (default 0.7) to downgrade low-confidence verdicts to `NOT_ENOUGH_INFO`.
- **Pluggable NLI Provider**: NVIDIA NIM models or deterministic Mock provider for offline/CI.
- **Confidence Calibration**: Aggregate confidence reflects weighted proportion of supporting/refuting evidence; not a truth probability.
- **Structured Output**: Per-claim verdict with aggregate confidence, evidence assessments, supporting/refuting/neutral counts, and human-readable summary.
- **Zod Validation**: Full request/response validation with explicit schemas for assessments, claim verdicts, and summary metrics.
- **REST API**: `POST /api/nli/verify` accepting claims with evidence (from Phase 3), returning verdicts grouped by claim.
- **Frontend Integration**: Automatically assesses retrieved factual-claim evidence; displays the verdict, confidence, supporting and contradicting source counts, per-source reasoning, and source links.
- **Mock Mode**: Deterministic synthetic assessments based on term overlap for testing without API keys.

After video transcription, claim extraction starts automatically. Factual claims then trigger search and NLI verification. Each factual claim shows its timestamp and a **Play excerpt** control for the corresponding video section. Claims with fetched-page passages and search-result snippets may both be assessed; snippets from pages that could not be fetched are marked as partial evidence in the UI.

---

## Architecture Overview

```text
[ React UI (Vite) ]
       │
       ├─► 1. POST /api/videos/transcribe (Video Upload)
       │         │
       │         ▼
       │   [ Express Server ] ──► FFmpeg (16kHz WAV) ──► Whisper Service (faster-whisper)
       │         │
       │         ▼
       │   [ Structured Timestamped Transcript ]
       │
       ├─► 2. POST /api/claims/extract (Phase 2 Claim Extraction)
       │         │
       │         ▼
       │   [ ClaimService & LLM Provider ]
       │         │
       │         ├─► Sentence Segmentation
       │         ├─► Claim Classification (FACTUAL, OPINION, PREDICTION, NON_CLAIM)
       │         ├─► Timestamp Alignment & Propagation
       │         ├─► Normalization & De-contextualization
       │         │
       │         ▼
       │   [ Structured Claims Response & UI Visualization ]
       │
       ├─► 3. POST /api/evidence/retrieve (Phase 3 Evidence Retrieval)
       │         │
       │         ▼
       │   [ EvidenceRetrievalService ]
       │         │
       │         ├─► QueryGenerationService (2–3 queries/claim)
       │         ├─► SearchProvider (You.com | Brave Search | Mock)
       │         │       │
       │         │       ├─► Web Search
       │         │       └─► Normalize & Deduplicate
       │         │
       │         ├─► Safe Page Fetching (SSRF-protected)
       │         │       └─► Passage Extraction
       │         │
       │         └─► SourceRankingService
       │                 │
       │                 ├─► Lexical Similarity (40%)
       │                 ├─► Entity Overlap (25%)
       │                 ├─► Number/Date Match (15%)
       │                 ├─► Source Type Weight (10%)
       │                 └─► Freshness (10%)
       │                 │
       │                 ▼
       │       [ Ranked Evidence per Claim → API Response → UI ]
       │
       └─► 4. POST /api/nli/verify (Phase 4 NLI Verification)
                 │
                 ▼
           [ NliVerificationService ]
                 │
                 ├─► NliProvider (NVIDIA NIM | Mock)
                 │       │
                 │       ├─► Per-Evidence Assessment
                 │       │       (SUPPORTS / REFUTES / NOT_ENOUGH_INFO)
                 │       │
                 │       └─► JSON output validated by Zod
                 │
                 └─► Verdict Aggregation
                         │
                         ├─► Weighted by confidence scores
                         ├─► Confidence threshold (default 0.7)
                         └─► Downgrade low-confidence to NOT_ENOUGH_INFO
                         │
                         ▼
           [ Final Verdicts per Claim → API Response → UI ]
```

---

## Directory Structure

```text
video-claim-verification-system/
├── client/                      # React + Vite frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── VideoUploader.jsx
│   │   │   ├── TranscriptViewer.jsx
│   │   │   ├── ClaimViewer.jsx
│   │   │   └── ClaimBadge.jsx
│   │   ├── styles/
│   │   └── App.jsx
├── server/                      # Node.js + Express backend
│   ├── src/
│   │   ├── config/              # Environment config
│   │   ├── controllers/         # Video, Claim, Evidence & NLI controllers
│   │   ├── routes/              # Express route definitions
│   │   ├── services/
│   │   │   ├── claim.service.js
│   │   │   ├── video.service.js
│   │   │   ├── transcription.service.js
│   │   │   ├── evidence-retrieval.service.js
│   │   │   ├── query-generation.service.js
│   │   │   ├── source-ranking.service.js
│   │   │   ├── nli-verification.service.js
│   │   │   ├── llm/             # NVIDIA NIM provider & Mock provider
│   │   │   ├── nvidia.client.js
│   │   │   ├── search-providers/
│   │   │   │   ├── search-provider.interface.js
│   │   │   │   ├── web-search.provider.js     # Brave Search
│   │   │   │   ├── youcom-search.provider.js  # You.com Search
│   │   │   │   ├── mock-search.provider.js
│   │   │   │   └── search.factory.js
│   │   │   └── nli-providers/
│   │   │       ├── nli-provider.interface.js
│   │   │       ├── nvidia-nli.provider.js
│   │   │       ├── mock-nli.provider.js
│   │   │       └── nli.factory.js
│   │   ├── validators/          # Zod schemas (Transcript, Claim, Evidence, NLI)
│   │   └── utils/               # Timestamp, Response, Evidence Normalizer utilities
│   └── test/                    # Automated unit & integration tests
├── whisper-service/             # Python FastAPI + faster-whisper service
├── .gitignore
└── README.md
```

---

## Prerequisites

- **Node.js**: v18+ recommended
- **Python**: v3.9+ recommended
- **FFmpeg**: Handled automatically via `ffmpeg-static` in the Node backend

---

## Quickstart Guide

### 1. Start the Whisper Service (Python)
```powershell
cd whisper-service
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
python --version   # must show Python 3.13.x
pip install -r requirements.txt
python main.py
```

On Linux/macOS, create and activate the environment with Python 3.13 explicitly:

```bash
cd whisper-service
python3.13 -m venv .venv
source .venv/bin/activate
python --version   # must show Python 3.13.x
pip install -r requirements.txt
python main.py
```

Use Python 3.13 for this service. Do not use an unqualified `py -m venv .venv` on Windows: it may select Python 3.14, whose Pydantic compiled extension is incompatible with the installed Python 3.13 wheel.

If `.venv` was already created with the wrong Python version, in PowerShell run:

```powershell
deactivate
py -3.13 -m venv --upgrade .venv
.\.venv\Scripts\Activate.ps1
python --version   # must show Python 3.13.x
python main.py
```
*Runs on `http://localhost:8000` (Swagger docs at `http://localhost:8000/docs`).*

For transcription accuracy and latency tuning, `whisper-service/.env.example` contains:

```env
WHISPER_MODEL_SIZE=small
WHISPER_DEVICE=auto
WHISPER_COMPUTE_TYPE=auto
WHISPER_BEAM_SIZE=5
WHISPER_INITIAL_PROMPT=
```

`small` is the default accuracy/CPU-cost balance; use `medium` or `large-v3` if your machine can run them and you prefer slower, potentially more accurate transcription. Set `WHISPER_INITIAL_PROMPT` to domain names or terminology that is likely to occur in your videos. The frontend also lets you supply a two- or three-letter language code such as `en` or `hi` for each upload. After transcription, correct segment text in the UI before extracting claims; edits preserve the original timestamps.

### 2. Start the Backend Server (Node.js / Express)
```bash
cd server
npm install
npm run dev
```
*Runs on `http://localhost:5000`.*

The backend allows up to 100 MB per video by default. Whisper processing may take several minutes for long videos, especially on CPU; its request timeout defaults to 30 minutes. To change it, set `WHISPER_REQUEST_TIMEOUT_MS` in `server/.env` (for example, `3600000` for one hour) and restart the backend.

To run backend tests:
```bash
npm test
```

### NVIDIA Model Configuration

The backend sends claim extraction, optional LLM query generation, and evidence verification requests to NVIDIA NIM's OpenAI-compatible chat-completions endpoint. It does not require the OpenAI SDK or an OpenAI key. Create an NVIDIA API key, then set these values in `server/.env`:

```env
NVIDIA_API_KEY=your_nvidia_api_key_here
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_REQUEST_TIMEOUT_MS=600000
CLAIM_LLM_PROVIDER=nvidia
CLAIM_LLM_MODEL=nvidia/nemotron-3-ultra-550b-a55b
NLI_PROVIDER=nvidia
NLI_LLM_MODEL=meta/llama-3.3-70b-instruct
```

You can select a different model available on your NVIDIA endpoint by changing both model variables. NVIDIA requests time out after 10 minutes by default; adjust `NVIDIA_REQUEST_TIMEOUT_MS` in `server/.env` if your hosted model needs longer. A longer timeout does not make a slow or rate-limited endpoint faster. Use `mock` for `CLAIM_LLM_PROVIDER` or `NLI_PROVIDER` to run those features without a hosted model or API key. Model responses are requested in JSON mode and validated by the application.

### 3. Start the Frontend Client (React)
```bash
cd client
npm install
npm run dev
```
*Runs on `http://localhost:5173`.*

The frontend has two views that share the current upload and analysis: **Quick fact-check** at `http://localhost:5173/simple-check` shows concise claim verdicts and source links, while **Detailed workspace** at `/` retains transcript editing and the full claim/evidence diagnostics. Switching views does not restart evidence retrieval or verification.

---

## Phase 3: Evidence Retrieval Configuration

### Environment Variables (server/.env)

```env
# Search Provider: "youcom", "brave", or "mock" (mock is synthetic test data only)
SEARCH_PROVIDER=youcom

# Search API Key (required for "youcom" or "brave")
SEARCH_API_KEY=your_search_api_key_here

# Evidence Retrieval Limits
EVIDENCE_MAX_QUERIES=3              # Max search queries per claim (default: 3)
EVIDENCE_RESULTS_PER_QUERY=5        # Results per search query (default: 5)
EVIDENCE_MAX_RESULTS_PER_CLAIM=8    # Max final evidence items per claim (default: 8)
EVIDENCE_REQUEST_TIMEOUT_MS=10000   # HTTP request timeout (default: 10s)
EVIDENCE_MAX_PAGE_SIZE_MB=2         # Max page size to fetch (default: 2MB)
EVIDENCE_MAX_TEXT_LENGTH=5000       # Max extracted text length (default: 5000)
EVIDENCE_MAX_CONCURRENT_FETCHES=3   # Concurrent page fetches (default: 3)
EVIDENCE_MAX_TOTAL_TIME_MS=30000    # Max total processing time (default: 30s)
```

### Live Search API Setup
1. Obtain a You.com or Brave Search API key.
2. Set `SEARCH_PROVIDER=youcom` or `SEARCH_PROVIDER=brave` and configure `SEARCH_API_KEY` in `server/.env`.
3. Restart the backend. Mock mode is only for offline development; the application does not return its synthetic fixtures as evidence.

### Brave Search API Setup
1. Sign up at [Brave Search API](https://api.search.brave.com/)
2. Get your API key from the dashboard
3. Set `SEARCH_PROVIDER=brave` and `SEARCH_API_KEY=your_key` in `server/.env`
4. Restart the backend server

### Mock Mode (Default)
No API key required. Returns deterministic synthetic fixtures for offline development and CI testing.

---

## Phase 4: NLI Verification Configuration

### Environment Variables (server/.env)

```env
# NLI Provider: "nvidia" or "mock"
NLI_PROVIDER=nvidia

# NLI Verification Limits
NLI_LLM_MODEL=meta/llama-3.3-70b-instruct
NLI_MAX_EVIDENCE_PER_CLAIM=5           # Max evidence items to assess per claim (default: 5)
NLI_CONFIDENCE_THRESHOLD=0.7           # Min confidence to accept verdict (default: 0.7)
```

### Mock Mode
No NVIDIA API key is required when `NLI_PROVIDER=mock`. It returns deterministic synthetic assessments for offline development and CI testing.

---

## NLI Verification API (Phase 4)

### Endpoint
```
POST /api/nli/verify
```

### Request
```json
{
  "claims": [
    {
      "claimId": "claim_001",
      "text": "The Earth revolves around the Sun.",
      "normalizedText": "The Earth revolves around the Sun.",
      "category": "FACTUAL",
      "startTime": 12.5,
      "endTime": 15.2,
      "sourceSegmentIds": [0],
      "reason": "Asserts an empirically verifiable astronomical fact.",
      "evidence": [
        {
          "evidenceId": "ev_abc123",
          "claimId": "claim_001",
          "title": "NASA - Earth's Orbit Around the Sun",
          "url": "https://solarsystem.nasa.gov/planets/earth/in-depth/",
          "publisher": "solarsystem.nasa.gov",
          "publishedAt": "2024-01-15T00:00:00.000Z",
          "retrievedAt": "2025-01-15T10:30:00.000Z",
          "snippet": "Earth orbits the Sun at an average distance of 93 million miles (150 million km). One complete orbit takes 365.25 days.",
          "sourceType": "GOVERNMENT",
          "retrievalScore": 0.92,
          "searchQuery": "Earth orbit Sun",
          "extractionStatus": "SUCCESS"
        }
      ]
    }
  ],
  "options": {
    "maxEvidencePerClaim": 5,
    "confidenceThreshold": 0.7,
    "provider": "mock"
  }
}
```

**Notes:**
- Only `FACTUAL` claims with evidence are processed; others return `SKIPPED_NO_EVIDENCE` status.
- Request validates against Zod schema; max 50 claims per request.
- `options` is optional; defaults come from environment config.
- Evidence must come from Phase 3 `/api/evidence/retrieve` output.

### Response
```json
{
  "success": true,
  "results": [
    {
      "claimId": "claim_001",
      "claimText": "The Earth revolves around the Sun.",
      "finalVerdict": "SUPPORTS",
      "aggregateConfidence": 0.92,
      "evidenceAssessments": [
        {
          "evidenceId": "ev_abc123",
          "verdict": "SUPPORTS",
          "confidence": 0.95,
          "reasoning": "Authoritative source (NASA) confirms Earth's orbital mechanics around the Sun.",
          "relevantSnippet": "Earth orbits the Sun at an average distance of 93 million miles..."
        }
      ],
      "supportingEvidenceCount": 1,
      "refutingEvidenceCount": 0,
      "neutralEvidenceCount": 0,
      "summary": "Supported (92% confidence) — 1 supporting, 0 refuting, 0 inconclusive of 1 evidence items",
      "status": "COMPLETED",
      "errors": []
    }
  ],
  "summary": {
    "totalClaims": 1,
    "supports": 1,
    "refutes": 0,
    "notEnoughInfo": 0,
    "skipped": 0,
    "averageConfidence": 0.92
  }
}
```

### Verdict Values
| Verdict | Meaning |
|---------|---------|
| `SUPPORTS` | Evidence confirms the claim |
| `REFUTES` | Evidence contradicts the claim |
| `NOT_ENOUGH_INFO` | Evidence insufficient to determine |

### Claim Result Status Values
| Status | Meaning |
|--------|---------|
| `COMPLETED` | Verification completed successfully |
| `PARTIAL` | Some assessments completed but with errors |
| `FAILED` | Verification failed |
| `SKIPPED_NO_EVIDENCE` | Claim was not FACTUAL or had no evidence |

### Assessment Confidence
Each evidence assessment includes a confidence score (0–1) reflecting how certain the NLI engine is of that specific verdict. The aggregate confidence is a weighted average based on individual assessment confidences. **This is a retrieval/verification confidence, not a truth probability.**

## Evidence Retrieval API (Phase 3)

### Endpoint
```
POST /api/evidence/retrieve
```

### Request
```json
{
  "claims": [
    {
      "claimId": "claim_001",
      "text": "The Earth revolves around the Sun.",
      "normalizedText": "The Earth revolves around the Sun.",
      "category": "FACTUAL",
      "startTime": 12.5,
      "endTime": 15.2,
      "sourceSegmentIds": [0],
      "reason": "Asserts an empirically verifiable astronomical fact."
    }
  ],
  "options": {
    "maxQueriesPerClaim": 3,
    "maxResultsPerClaim": 8,
    "provider": "mock"
  }
}
```

**Notes:**
- Only `FACTUAL` claims are processed; others return `SKIPPED_NON_FACTUAL` status.
- Request validates against Zod schema; max 50 claims per request.
- `options` is optional; defaults come from environment config.
- Mock search mode returns a clear per-claim failure and no evidence because its fixtures are synthetic, not citations.

### Response
```json
{
  "success": true,
  "results": [
    {
      "claimId": "claim_001",
      "claimText": "The Earth revolves around the Sun.",
      "status": "COMPLETED",
      "queries": [
        "The Earth revolves around the Sun.",
        "Earth orbit Sun",
        "Earth revolves Sun 365 days"
      ],
      "evidence": [
        {
          "evidenceId": "ev_abc123",
          "claimId": "claim_001",
          "title": "NASA - Earth's Orbit Around the Sun",
          "url": "https://solarsystem.nasa.gov/planets/earth/in-depth/",
          "publisher": "solarsystem.nasa.gov",
          "publishedAt": "2024-01-15T00:00:00.000Z",
          "retrievedAt": "2025-01-15T10:30:00.000Z",
          "snippet": "Earth orbits the Sun at an average distance of 93 million miles (150 million km). One complete orbit takes 365.25 days.",
          "sourceType": "GOVERNMENT",
          "retrievalScore": 0.92,
          "searchQuery": "Earth orbit Sun",
          "extractionStatus": "SUCCESS"
        }
      ],
      "errors": []
    }
  ],
  "summary": {
    "totalClaims": 1,
    "completed": 1,
    "partial": 0,
    "failed": 0,
    "skippedNonFactual": 0,
    "totalEvidenceItems": 1
  }
}
```

### Evidence Item Fields
| Field | Type | Description |
|-------|------|-------------|
| `evidenceId` | string | Unique evidence identifier (`ev_<timestamp>_<random>`) |
| `claimId` | string | Original claim ID |
| `title` | string | Source page title |
| `url` | string | Source URL (HTTPS) |
| `publisher` | string\|null | Extracted publisher/domain name |
| `publishedAt` | string\|null | Publication date (ISO 8601) or null if unavailable |
| `retrievedAt` | string | Retrieval timestamp (ISO 8601) |
| `snippet` | string | Relevant passage extracted from source |
| `sourceType` | enum | `NEWS`, `ACADEMIC`, `GOVERNMENT`, `ORGANIZATION`, `BLOG`, `FORUM`, `OTHER` |
| `retrievalScore` | number | Relevance score 0–1 (not a truth probability) |
| `searchQuery` | string | Query that produced this result |
| `extractionStatus` | enum | `SUCCESS`, `PARTIAL`, `FAILED`, `SKIPPED` |

### Claim Result Status Values
| Status | Meaning |
|--------|---------|
| `COMPLETED` | Evidence retrieved successfully |
| `PARTIAL` | Some evidence found but with errors/partial extractions |
| `FAILED` | All searches/extractions failed |
| `SKIPPED_NON_FACTUAL` | Claim was not FACTUAL category |

---

## Claim Classification Schema (Phase 2)

| Category | Description | Example |
| :--- | :--- | :--- |
| `FACTUAL` | Empirically verifiable proposition that can be proven true or false with external evidence. | *"The Earth revolves around the Sun."* |
| `OPINION` | Subjective assessment, personal belief, or aesthetic appraisal not testable with empirical evidence. | *"I think space exploration is fascinating."* |
| `PREDICTION` | Speculative forecast or future-oriented assertion about what will or might happen. | *"AI will replace most programmers within five years."* |
| `NON_CLAIM` | Conversational greeting, call-to-action, question, or speech filler conveying no proposition. | *"Welcome back to my channel. Please subscribe."* |

---

## Testing

### Backend Tests
```bash
cd server
npm test
```

Runs the Node.js built-in test runner on `server/test/*.test.js`:
- **Phase 2 tests** (`claim.test.js`): Claim extraction, classification, timestamp preservation, validation
- **Phase 3 tests** (`evidence.test.js`): Query generation, search normalization, evidence deduplication, ranking, missing metadata, empty results, request/response validation, partial failures, concurrent fetches
- **Phase 4 tests** (`nli.test.js`): NLI assessments, verdict aggregation, confidence thresholding, non-factual claim skipping, empty evidence handling, failed extraction handling, request/response validation, mock provider behavior

### Mock Provider
All tests use the deterministic `MockSearchProvider`, `MockProvider` (LLM), and `MockNliProvider`. No API keys or internet access required.

### Test Coverage
- Valid factual claims → evidence retrieval
- Non-factual claims (OPINION, PREDICTION, NON_CLAIM) → skipped
- Mixed claim batches → correct summary counts
- Query generation & deduplication
- Search result normalization
- Evidence deduplication (URL + snippet)
- Ranking by relevance (lexical, entity, number, date, source type, freshness)
- Missing metadata (null publishedAt, unknown sourceType)
- Empty search results handling
- Zod request/response validation
- Partial success across multiple claims
- Individual evidence item schema validation
- Timestamp preservation
- Concurrent fetch limits
- NLI assessments per evidence item
- Verdict aggregation with confidence weighting
- Confidence threshold downgrade logic
- Non-factual claim skipping in NLI
- Empty/failed evidence handling in NLI
- NLI request/response validation

---

## Security Considerations

### SSRF Protection (Server-Side Request Forgery)
The evidence retrieval service implements defense-in-depth URL fetching safety:

1. **Protocol Restriction**: Only HTTP/HTTPS allowed
2. **Hostname Blocklist**: `localhost`, `local`, `broadcasthost` rejected
3. **DNS Resolution + IP Validation**: Resolves hostname, checks against private ranges:
   - IPv4: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`, multicast
   - IPv6: `::1`, `fe80::/10`, `fc00::/7`, `ff00::/8`
4. **Cloud Metadata Endpoint Blocking**: `169.254.169.254` (AWS/GCE/Azure), `100.100.100.200` (Alibaba), etc.
5. **Redirect Validation**: Re-validates destination IP after each redirect (max 5 redirects)
6. **Response Limits**: Max 2MB page size, 5000 chars extracted text, 10s timeout
7. **Content-Type Restriction**: Only `text/html`, `application/xhtml+xml`, `text/plain` accepted
8. **No JavaScript Execution**: Pure HTML parsing, no headless browser

### Credentials
- API keys loaded from environment variables only
- Never hardcoded or committed
- `.env.example` documents required variables
- Mock provider works without any credentials

---

## Known Limitations

1. **Search API Key Required**: Real evidence requires a configured You.com or Brave Search API key. Mock mode is for tests and does not return synthetic results as evidence.
2. **No Full-Text Search**: Passage extraction uses simple term overlap; not semantic search.
3. **No Paywall Handling**: Cannot fetch content behind authentication or paywalls.
4. **English-Focused**: Query generation and ranking optimized for English claims.
5. **Single-Page Extraction**: Does not crawl linked pages or follow pagination.
6. **No Caching**: Each request performs fresh searches and fetches.
7. **Rate Limits**: Search API providers may have tiered rate limits; configure accordingly.
8. **NLI Confidence ≠ Truth Probability**: The aggregate confidence reflects verification consistency, not the probability that a claim is true.
9. **English-Focused NLI**: Assessment quality may degrade for non-English claims.
10. **Single-Pass NLI**: Does not iterate or seek additional evidence based on initial assessments.

---

## Future Phases (Planned)

- **Phase 5**: Report Generation — Aggregate claim verdicts into structured verification reports with citations.
- **Phase 6**: Web Dashboard — Multi-video management, historical comparisons, export formats.
- **Phase 7**: Multilingual Support — Extend NLI and search to non-English languages.
- **Phase 8**: Active Learning — Iterative evidence seeking based on initial NLI assessments.
