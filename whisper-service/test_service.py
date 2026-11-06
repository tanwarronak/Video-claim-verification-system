import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from service import WhisperService


class WhisperServiceTests(unittest.TestCase):
    @patch("service.is_cuda_available", return_value=False)
    @patch("service.WhisperModel")
    def test_defaults_to_small_int8_on_cpu(self, model_factory, _cuda_available):
        with patch.dict(
            os.environ,
            {
                "WHISPER_DEVICE": "auto",
                "WHISPER_COMPUTE_TYPE": "auto",
                "WHISPER_INITIAL_PROMPT": "",
            },
            clear=True,
        ):
            service = WhisperService()

        self.assertEqual(service.model_size, "small")
        self.assertEqual(service.device, "cpu")
        self.assertEqual(service.compute_type, "int8")
        self.assertEqual(model_factory.call_args.args[0], "small")

    @patch("service.is_cuda_available", return_value=False)
    @patch("service.WhisperModel")
    def test_transcribe_uses_accuracy_settings_and_optional_language(
        self, model_factory, _cuda_available
    ):
        model = model_factory.return_value
        model.transcribe.return_value = (
            iter(
                [
                    SimpleNamespace(start=0.25, end=1.5, text="  The claim is spoken. "),
                    SimpleNamespace(start=1.5, end=2.0, text=" "),
                ]
            ),
            SimpleNamespace(
                duration=2.0, language="en", language_probability=0.97
            ),
        )

        service = WhisperService(
            model_size="small", device="cpu", compute_type="int8", beam_size=5
        )
        with tempfile.NamedTemporaryFile(delete=False) as audio_file:
            audio_path = audio_file.name

        try:
            result = service.transcribe(audio_path, language="en")
        finally:
            os.remove(audio_path)

        options = model.transcribe.call_args.kwargs
        self.assertEqual(options["language"], "en")
        self.assertEqual(options["beam_size"], 5)
        self.assertEqual(options["temperature"], (0.0, 0.2, 0.4, 0.6, 0.8, 1.0))
        self.assertEqual(options["compression_ratio_threshold"], 2.4)
        self.assertEqual(options["log_prob_threshold"], -1.0)
        self.assertEqual(options["no_speech_threshold"], 0.6)
        self.assertTrue(options["condition_on_previous_text"])
        self.assertTrue(options["vad_filter"])
        self.assertEqual(result["text"], "The claim is spoken.")
        self.assertEqual(result["segments"][0]["id"], 0)
        self.assertEqual(result["language_probability"], 0.97)

    @patch("service.is_cuda_available", return_value=False)
    @patch("service.WhisperModel")
    def test_reads_optional_initial_prompt_from_environment(
        self, model_factory, _cuda_available
    ):
        with patch.dict(os.environ, {"WHISPER_INITIAL_PROMPT": "NASA, Artemis"}):
            service = WhisperService(
                model_size="small", device="cpu", compute_type="int8", beam_size=5
            )
        model = model_factory.return_value
        model.transcribe.return_value = (
            iter([]),
            SimpleNamespace(duration=0.0, language="en", language_probability=1.0),
        )
        with tempfile.NamedTemporaryFile(delete=False) as audio_file:
            audio_path = audio_file.name

        try:
            service.transcribe(audio_path)
        finally:
            os.remove(audio_path)

        self.assertEqual(service.initial_prompt, "NASA, Artemis")
        self.assertEqual(model.transcribe.call_args.kwargs["initial_prompt"], "NASA, Artemis")

    def test_rejects_non_positive_beam_size(self):
        with self.assertRaisesRegex(ValueError, "positive integer"):
            WhisperService(
                model_size="small", device="cpu", compute_type="int8", beam_size=0
            )


if __name__ == "__main__":
    unittest.main()
