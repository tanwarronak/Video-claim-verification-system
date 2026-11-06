import multer from "multer";
import { sendError } from "../utils/response.utils.js";
import { config } from "../config/env.config.js";

/**
 * Centralized error-handling middleware.
 */
export function errorHandler(err, _req, res, _next) {
  // Handle Multer-specific upload errors
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return sendError(
        res,
        `File too large. Maximum allowed size is ${config.maxFileSizeMb} MB.`,
        "FILE_TOO_LARGE",
        400
      );
    }
    return sendError(res, err.message, "UPLOAD_ERROR", 400);
  }

  // Handle custom validation or bad request errors
  if (err.statusCode && err.statusCode < 500) {
    return sendError(
      res,
      err.message,
      err.code || "BAD_REQUEST",
      err.statusCode,
      err.details || null
    );
  }

  // Log server errors internally
  console.error("[ServerError]", err);

  const message =
    config.nodeEnv === "development"
      ? err.message || "An internal server error occurred."
      : "An unexpected internal server error occurred.";
  const statusCode = Number.isInteger(err.statusCode) && err.statusCode >= 500 && err.statusCode <= 599
    ? err.statusCode
    : 500;

  return sendError(
    res,
    message,
    err.code || "INTERNAL_SERVER_ERROR",
    statusCode,
    config.nodeEnv === "development" ? err.stack : null
  );
}
