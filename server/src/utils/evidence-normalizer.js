import axios from "axios";
import { config } from "../config/env.config.js";

/**
 * Evidence Normalizer Utility.
 * Handles safe URL fetching with SSRF protection, content extraction, and normalization.
 */

/**
 * Checks if an IP address is private/internal (RFC 1918, RFC 4193, RFC 3927, etc.).
 * @param {string} ip
 * @returns {boolean}
 */
function isPrivateIP(ip) {
  if (!ip) return false;

  // IPv4 private ranges
  const ipv4PrivateRanges = [
    /^10\./,                    // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
    /^192\.168\./,              // 192.168.0.0/16
    /^127\./,                   // 127.0.0.0/8 (loopback)
    /^169\.254\./,              // 169.254.0.0/16 (link-local)
    /^0\./,                     // 0.0.0.0/8
    /^22[4-9]\./,               // 224.0.0.0/4 (multicast)
    /^23[0-9]\./,               // 224.0.0.0/4 (multicast)
    /^24[0-9]\./,               // 224.0.0.0/4 (multicast)
    /^25[0-5]\./,               // 224.0.0.0/4 (multicast)
  ];

  // IPv6 private ranges
  const ipv6PrivatePrefixes = [
    "::1",           // loopback
    "fe80:",         // link-local
    "fc00:",         // unique local (fc00::/7)
    "fd00:",         // unique local
    "ff00:",         // multicast
  ];

  if (ip.includes(":")) {
    // IPv6
    const lowerIP = ip.toLowerCase();
    return ipv6PrivatePrefixes.some((prefix) => lowerIP.startsWith(prefix));
  }

  // IPv4
  return ipv4PrivateRanges.some((range) => range.test(ip));
}

/**
 * Resolves hostname to IP and checks if it's safe.
 * @param {string} hostname
 * @returns {Promise<{ safe: boolean, ip?: string, error?: string }>}
 */
async function resolveAndCheckHostname(hostname) {
  try {
    // Use dns.promises for resolution
    const dns = await import("dns");
    const addresses = await dns.promises.resolve4(hostname);

    for (const ip of addresses) {
      if (isPrivateIP(ip)) {
        return { safe: false, ip, error: `Resolved to private/internal IP: ${ip}` };
      }
    }

    return { safe: true, ip: addresses[0] };
  } catch (err) {
    return { safe: false, error: `DNS resolution failed: ${err.message}` };
  }
}

/**
 * Validates URL for SSRF protection.
 * @param {string} url
 * @returns {Promise<{ safe: boolean, error?: string, hostname?: string }>}
 */
export async function validateURL(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { safe: false, error: "Invalid URL format" };
  }

  // Only allow HTTP/HTTPS
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { safe: false, error: "Only HTTP/HTTPS protocols allowed" };
  }

  const hostname = parsed.hostname;

  // Block localhost and local hostnames
  const localhostPatterns = [
    "localhost",
    "localhost.localdomain",
    "local",
    "broadcasthost",
  ];
  if (localhostPatterns.includes(hostname.toLowerCase())) {
    return { safe: false, error: "Localhost URLs not allowed", hostname };
  }

  // Block cloud metadata endpoints
  const metadataIPs = [
    "169.254.169.254",  // AWS, GCE, Azure, DigitalOcean
    "169.254.170.2",    // AWS ECS
    "100.100.100.200",  // Alibaba Cloud
    "169.254.169.250",  // Azure IMDS
  ];
  // These will be caught by IP check after resolution

  // Resolve and check IP
  const resolution = await resolveAndCheckHostname(hostname);
  if (!resolution.safe) {
    return { safe: false, error: resolution.error, hostname };
  }

  return { safe: true, hostname, ip: resolution.ip };
}

/**
 * Fetches a URL with SSRF protection, size limits, and timeout.
 * @param {string} url
 * @param {object} options
 * @returns {Promise<{ success: boolean, content?: string, contentType?: string, error?: string, extractionStatus: string }>}
 */
export async function fetchPageContent(url, options = {}) {
  const maxSize = options.maxSize || config.evidenceMaxPageSizeMb * 1024 * 1024; // bytes
  const maxTextLength = options.maxTextLength || config.evidenceMaxTextLength || 5000;
  const timeout = options.timeout || config.evidenceRequestTimeoutMs || 10000;

  // Validate URL first
  const validation = await validateURL(url);
  if (!validation.safe) {
    return {
      success: false,
      error: validation.error,
      extractionStatus: "FAILED",
    };
  }

  try {
    const response = await axios.get(url, {
      timeout,
      maxContentLength: maxSize,
      maxBodyLength: maxSize,
      maxRedirects: 5,
      validateStatus: (status) => status < 500, // Don't throw on 4xx
      headers: {
        "User-Agent": "VideoClaimVerifier/1.0 (+https://github.com/video-claim-verification)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      responseType: "text",
    });

    // Check content type
    const contentType = response.headers["content-type"] || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml") && !contentType.includes("text/plain")) {
      return {
        success: false,
        error: `Unsupported content type: ${contentType}`,
        extractionStatus: "FAILED",
      };
    }

    // Check for redirect to unsafe location
    if (response.request?.res?.responseUrl) {
      const redirectValidation = await validateURL(response.request.res.responseUrl);
      if (!redirectValidation.safe) {
        return {
          success: false,
          error: `Redirect to unsafe URL: ${redirectValidation.error}`,
          extractionStatus: "FAILED",
        };
      }
    }

    let html = response.data;

    // Truncate if too large
    if (html.length > maxSize) {
      html = html.substring(0, maxSize);
    }

    // Extract text content
    const textContent = extractTextFromHTML(html);

    // Truncate text
    const truncatedText = textContent.length > maxTextLength
      ? textContent.substring(0, maxTextLength) + "..."
      : textContent;

    return {
      success: true,
      content: truncatedText,
      contentType,
      extractionStatus: "SUCCESS",
    };
  } catch (err) {
    if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") {
      return {
        success: false,
        error: "Request timeout",
        extractionStatus: "FAILED",
      };
    }

    if (err.response) {
      return {
        success: false,
        error: `HTTP ${err.response.status}: ${err.response.statusText}`,
        extractionStatus: "FAILED",
      };
    }

    if (err.code === "ENOTFOUND" || err.code === "ECONNREFUSED") {
      return {
        success: false,
        error: "Connection failed",
        extractionStatus: "FAILED",
      };
    }

    return {
      success: false,
      error: err.message || "Unknown fetch error",
      extractionStatus: "FAILED",
    };
  }
}

/**
 * Extracts readable text from HTML.
 * @param {string} html
 * @returns {string}
 */
function extractTextFromHTML(html) {
  // Remove scripts, styles, and other non-content elements
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ") // Comments
    .replace(/<[^>]+>/g, " ") // All other tags
    .replace(/&nbsp;/g, " ")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .replace(/&[a-z]+;/gi, " ") // Other entities
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();

  return text;
}

/**
 * Extracts relevant passages from page content related to a claim.
 * @param {string} pageContent
 * @param {string} claimText
 * @param {number} maxPassages
 * @param {number} passageLength
 * @returns {string[]}
 */
export function extractRelevantPassages(pageContent, claimText, maxPassages = 3, passageLength = 500) {
  if (!pageContent || !claimContent) return [];

  const claimLower = claimText.toLowerCase();
  const claimTerms = claimLower
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3);

  // Split into sentences
  const sentences = pageContent
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);

  // Score sentences by term overlap
  const scored = sentences.map((sentence) => {
    const sentLower = sentence.toLowerCase();
    let score = 0;
    for (const term of claimTerms) {
      if (sentLower.includes(term)) score++;
    }
    // Bonus for multiple terms in same sentence
    if (score > 1) score += score * 0.5;
    return { sentence, score };
  });

  // Sort by score and take top passages
  scored.sort((a, b) => b.score - a.score);

  const passages = [];
  let currentPassage = "";

  for (const { sentence, score } of scored) {
    if (score === 0 && passages.length > 0) break; // Stop at zero-score after finding relevant

    if (currentPassage.length + sentence.length > passageLength) {
      if (currentPassage) {
        passages.push(currentPassage.trim());
        currentPassage = "";
      }
      if (passages.length >= maxPassages) break;
    }

    currentPassage += (currentPassage ? " " : "") + sentence + ".";
  }

  if (currentPassage && passages.length < maxPassages) {
    passages.push(currentPassage.trim());
  }

  // If no relevant passages found, return first few sentences as fallback
  if (passages.length === 0 && sentences.length > 0) {
    return sentences.slice(0, maxPassages).map((s) => s + ".");
  }

  return passages;
}

/**
 * Generates a unique evidence ID.
 * @returns {string}
 */
export function generateEvidenceId() {
  return `ev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Gets current ISO timestamp.
 * @returns {string}
 */
export function getCurrentTimestamp() {
  return new Date().toISOString();
}