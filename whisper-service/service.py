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
        beam_size: Optional[int] = None,
    ):
        self.model_size = model_size or os.getenv("WHISPER_MODEL_SIZE") or "small"
        requested_device = device or os.getenv("WHISPER_DEVICE") or "auto"
        requested_compute = compute_type or os.getenv("WHISPER_COMPUTE_TYPE") or "auto"
        self.beam_size = int(
            beam_size if beam_size is not None else os.getenv("WHISPER_BEAM_SIZE", "5")
        )
        if self.beam_size < 1:
            raise ValueError("WHISPER_BEAM_SIZE must be a positive integer.")
        self.initial_prompt = os.getenv("WHISPER_INITIAL_PROMPT", "").strip() or None

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

    def transcribe(self, audio_path: str, language: Optional[str] = None) -> Dict[str, Any]:
        """
        Transcribe an audio file and return full text and timestamped segments.
        """
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found at path: {audio_path}")

        options = {
            "language": language,
            "beam_size": self.beam_size,
            "word_timestamps": False,
            "vad_filter": True,
            "temperature": (0.0, 0.2, 0.4, 0.6, 0.8, 1.0),
            "compression_ratio_threshold": 2.4,
            "log_prob_threshold": -1.0,
            "no_speech_threshold": 0.6,
            "condition_on_previous_text": True,
        }
        if self.initial_prompt:
            options["initial_prompt"] = self.initial_prompt

        segments_gen, info = self.model.transcribe(
            audio_path,
            **options,
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
