import axios from "axios";
import { config } from "../config/env.config.js";

export async function nvidiaChatCompletion(
  messages,
  model,
  apiKey = config.nvidiaApiKey,
  temperature = 0.1
) {
  if (!apiKey) {
    const err = new Error("NVIDIA API key is missing. Set NVIDIA_API_KEY in server/.env.");
    err.code = "NVIDIA_API_KEY_MISSING";
    err.statusCode = 500;
    throw err;
  }

  let response;
  try {
    response = await axios.post(
      `${config.nvidiaBaseUrl.replace(/\/+$/, "")}/chat/completions`,
      {
        model,
        messages,
        response_format: { type: "json_object" },
        temperature,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: config.nvidiaRequestTimeoutMs,
      }
    );
  } catch (cause) {
    const status = cause.response?.status;
    const err = new Error("NVIDIA model request failed.");
    err.statusCode = status || 502;

    if (status === 401 || status === 403) {
      err.message = "NVIDIA authentication failed. Check NVIDIA_API_KEY.";
      err.code = "NVIDIA_AUTH_FAILED";
    } else if (status === 429) {
      err.message = "NVIDIA API rate limit or quota exceeded. Try again later.";
      err.code = "NVIDIA_RATE_LIMIT";
    } else if (cause.code === "ECONNABORTED" || cause.code === "ETIMEDOUT") {
      err.message = "NVIDIA model request timed out. Try again.";
      err.code = "NVIDIA_TIMEOUT";
      err.statusCode = 504;
    } else {
      err.code = "NVIDIA_REQUEST_FAILED";
    }

    throw err;
  }

  const content = response.data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    const err = new Error("NVIDIA returned an empty model response.");
    err.code = "NVIDIA_EMPTY_RESPONSE";
    err.statusCode = 502;
    throw err;
  }

  try {
    return JSON.parse(content);
  } catch {
    const err = new Error("NVIDIA returned invalid JSON.");
    err.code = "NVIDIA_INVALID_JSON";
    err.statusCode = 502;
    throw err;
  }
}
