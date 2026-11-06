import unittest

import main


class WhisperApiTests(unittest.TestCase):
    def test_transcribe_accepts_an_optional_language_code(self):
        schema = main.app.openapi()
        request_schema = schema["paths"]["/transcribe"]["post"]["requestBody"][
            "content"
        ]["multipart/form-data"]["schema"]
        body_schema = schema["components"]["schemas"][
            request_schema["$ref"].split("/")[-1]
        ]

        self.assertIn("language", body_schema["properties"])
        self.assertNotIn("language", body_schema.get("required", []))
        self.assertIn("file", body_schema.get("required", []))


if __name__ == "__main__":
    unittest.main()
