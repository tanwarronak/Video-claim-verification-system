import os
import shutil
import tempfile
import uuid
from contextlib import asynccontextmanager
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool
import uvicorn

from service import WhisperService

load_dotenv()


# Pydantic Response Models
class SegmentSchema(BaseModel):
    id: int
    start: float = Field(..., description="Start timestamp in seconds")
    end: float = Field(..., description="End timestamp in seconds")
    text: str = Field(..., description="Transcribed segment text")


class TranscriptData(BaseModel):
    text: str
    duration: float
    language: str
    language_probability: float
    segments: List[SegmentSchema]


class TranscribeResponse(BaseModel):
    success: bool
    data: TranscriptData


class HealthResponse(BaseModel):
    status: str
    service: str
    model_size: str
    device: str
    compute_type: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    WhisperService.get_instance()
    yield


app = FastAPI(
    title="Whisper ASR Microservice",
    description="Dedicated speech-to-text service with timestamp extraction using faster-whisper",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for local cross-service communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
def health_check():
    svc = WhisperService.get_instance()
    return HealthResponse(
        status="healthy",
        service="whisper-service",
        model_size=svc.model_size,
        device=svc.device,
        compute_type=svc.compute_type,
    )


@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio(
    file: UploadFile = File(...),
    language: Optional[str] = Form(
        None, min_length=2, max_length=3, pattern=r"^[a-zA-Z]{2,3}$"
    ),
):
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must have a valid filename",
        )

    # Save to a temporary file for Whisper processing
    file_ext = os.path.splitext(file.filename)[1] or ".wav"
    temp_dir = tempfile.gettempdir()
    temp_file_path = os.path.join(temp_dir, f"whisper_audio_{uuid.uuid4().hex}{file_ext}")

    try:
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        svc = WhisperService.get_instance()
        result = await run_in_threadpool(
            svc.transcribe, temp_file_path, language.lower() if language else None
        )

        return TranscribeResponse(
            success=True,
            data=TranscriptData(**result),
        )

    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception as exc:
        print(f"[ERROR] Transcription failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Transcription failed: {str(exc)}",
        )
    finally:
        # Guarantee cleanup of temporary uploaded audio file
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except OSError as cleanup_err:
                print(f"[WARN] Failed to delete temp audio file {temp_file_path}: {cleanup_err}")


if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host=host, port=port, reload=False)
