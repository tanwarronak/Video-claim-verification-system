import os
from typing import List, Dict, Any, Optional
import ctranslate2
from faster_whisper import WhisperModel


def is_cuda_available() -> bool:
    """Checks if CUDA is available via ctranslate2 without requiring PyTorch."""
    try:
        return ctranslate2.get_cuda_device_count() > 0
    except Exception:
        return False


class WhisperService:
    _instance: Optional["WhisperService"] = None

    def __init__(
        self,
        model_size: Optional[str] = None,
        device: Optional[str] = None,
        compute_type: Optional[str] = None,
    ):
        self.model_size = model_size or os.getenv("WHISPER_MODEL_SIZE", "base")
        requested_device = device or os.getenv("WHISPER_DEVICE", "auto")
        requested_compute = compute_type or os.getenv("WHISPER_COMPUTE_TYPE", "auto")

        # Determine optimal device
        if requested_device == "auto":
            self.device = "cuda" if is_cuda_available() else "cpu"
        else:
            self.device = requested_device

        # Determine optimal compute type
        if requested_compute == "auto":
            if self.device == "cuda":
                self.compute_type = "float16"
            else:
                self.compute_type = "int8"
        else:
            self.compute_type = requested_compute

        print(
            f"[WhisperService] Loading model='{self.model_size}' on device='{self.device}' with compute_type='{self.compute_type}'..."
        )
        self.model = WhisperModel(
            self.model_size,
            device=self.device,
            compute_type=self.compute_type,
            cpu_threads=os.cpu_count() or 4,
        )
        print("[WhisperService] Model successfully loaded and ready.")

    @classmethod
    def get_instance(cls) -> "WhisperService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def transcribe(self, audio_path: str) -> Dict[str, Any]:
        """
        Transcribe an audio file and return full text and timestamped segments.
        """
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found at path: {audio_path}")

        # beam_size=5 for balanced speed & accuracy, word_timestamps=False (segment level is optimal for claims)
        segments_gen, info = self.model.transcribe(
            audio_path,
            beam_size=5,
            word_timestamps=False,
            vad_filter=True,  # Voice Activity Detection filter to skip non-speech regions
        )

        segments: List[Dict[str, Any]] = []
        full_text_parts: List[str] = []

        for idx, segment in enumerate(segments_gen):
            cleaned_text = segment.text.strip()
            if cleaned_text:
                segments.append(
                    {
                        "id": idx,
                        "start": round(segment.start, 2),
                        "end": round(segment.end, 2),
                        "text": cleaned_text,
                    }
                )
                full_text_parts.append(cleaned_text)

        full_text = " ".join(full_text_parts)
        duration = round(info.duration, 2) if info.duration else 0.0

        return {
            "text": full_text,
            "duration": duration,
            "language": info.language,
            "language_probability": round(info.language_probability, 2)
            if info.language_probability
            else 0.0,
            "segments": segments,
        }
