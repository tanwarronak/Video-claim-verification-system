/**
 * Sends a standardized success JSON response.
 * @param {import('express').Response} res
 * @param {any} data
 * @param {number} statusCode
 */
export function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

/**
 * Sends a standardized error JSON response.
 * @param {import('express').Response} res
 * @param {string} message
 * @param {string} code
 * @param {number} statusCode
 * @param {any} details
 */
export function sendError(res, message, code = "INTERNAL_ERROR", statusCode = 500, details = null) {
  const errorPayload = {
    code,
    message,
  };

  if (details) {
    errorPayload.details = details;
  }

  return res.status(statusCode).json({
    success: false,
    error: errorPayload,
  });
}
