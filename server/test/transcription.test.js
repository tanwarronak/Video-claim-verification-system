import { describe, it } from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import fs from "fs";
import os from "os";
import path from "path";
import { config } from "../src/config/env.config.js";
import { TranscriptionService } from "../src/services/transcription.service.js";

function createAudioFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "video-claim-transcription-"));
  const audioPath = path.join(directory, "audio.wav");
  fs.writeFileSync(audioPath, "test audio");
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return audioPath;
}

describe("TranscriptionService", () => {
  it("uses the configured timeout when calling Whisper", async (t) => {
    const audioPath = createAudioFixture(t);
    let requestOptions;
    t.mock.method(axios, "post", async (_url, _form, options) => {
      requestOptions = options;
      return { data: { success: true, data: { text: "hello", segments: [] } } };
    });

    await TranscriptionService.transcribeAudio(audioPath);

    assert.equal(requestOptions.timeout, config.whisperRequestTimeoutMs);
    assert.ok(requestOptions.timeout > 300000);
  });

  it("converts Whisper request timeout into an actionable gateway-timeout error", async (t) => {
    const audioPath = createAudioFixture(t);
    t.mock.method(axios, "post", async () => {
      throw Object.assign(new Error(`timeout of ${config.whisperRequestTimeoutMs}ms exceeded`), {
        code: "ECONNABORTED",
      });
    });

    await assert.rejects(TranscriptionService.transcribeAudio(audioPath), (error) => {
      assert.equal(error.code, "TRANSCRIPTION_TIMEOUT");
      assert.equal(error.statusCode, 504);
      assert.match(error.message, /increase WHISPER_REQUEST_TIMEOUT_MS/i);
      return true;
    });
  });
});
