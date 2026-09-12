# AI-Based Video Claim Verification System

An automated end-to-end system for detecting, verifying, and reporting factual claims in video content using Speech-to-Text, Natural Language Processing, Evidence Retrieval, and Natural Language Inference (NLI).

---

## Project Status: Phase 1 — Video to Timestamped Transcript

This repository is being developed incrementally. In **Phase 1**, the objective is:
- Securely ingest multi-format video files (`.mp4`, `.mov`, `.webm`, `.mkv`).
- Extract optimized 16kHz mono audio streams via FFmpeg.
- Transcribe speech with precise start/end timestamps using `faster-whisper` (CTranslate2).
- Return structured transcript segments via an extensible REST API.
- Provide a clean, minimal React interface for testing video transcription.

---

## Architecture Overview (Phase 1)

```text
[ React UI (Vite) ]
       │ POST /api/videos/transcribe (multipart/form-data)
       ▼
[ Express.js Server (Port 5000) ]
       │
       ├─► 1. Validate & Store Temporary Video (`server/uploads/`)
       ├─► 2. FFmpeg: Extract 16kHz Mono WAV (`server/temp/`)
       ├─► 3. Internal HTTP Request to Whisper Service (`http://localhost:8000/transcribe`)
       │
       ▼
[ Whisper FastAPI Microservice (Port 8000) ]
       │ Run faster-whisper (CTranslate2 INT8/FP16)
       ▼
[ Structured Timestamped JSON Response ]
       │
       ▼
[ Auto-cleanup temporary video & audio files ]
```

---

## Directory Structure

```text
video-claim-verification-system/
├── client/              # React + Vite frontend
├── server/              # Node.js + Express backend
├── whisper-service/     # Python FastAPI + faster-whisper service
├── .gitignore
└── README.md
```

---

## Prerequisites

- **Node.js**: v18+ recommended
- **Python**: v3.9+ recommended
- **FFmpeg**: Handled automatically via `ffmpeg-static` in the Node backend (or system-installed FFmpeg)

---

## Quickstart Guide

### 1. Start the Whisper Service (Python)
```bash
cd whisper-service
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
python main.py
```
*Runs on `http://localhost:8000` (Swagger docs available at `http://localhost:8000/docs`).*

### 2. Start the Backend Server (Node.js / Express)
```bash
cd server
npm install
npm run dev
```
*Runs on `http://localhost:5000`.*

### 3. Start the Frontend Client (React)
```bash
cd client
npm install
npm run dev
```
*Runs on `http://localhost:5173`.*
