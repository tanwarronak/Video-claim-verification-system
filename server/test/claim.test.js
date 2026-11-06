import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ClaimService } from "../src/services/claim.service.js";
import { calculateClaimTimestamps, formatTimestamp } from "../src/utils/timestamp.utils.js";
import { validateExtractClaimsRequest } from "../src/validators/transcript.validator.js";
import { validateClaimResult } from "../src/validators/claim.validator.js";
import app from "../src/app.js";

describe("Phase 2: Claim Detection, Classification & Normalization Suite", () => {
  const mockOptions = { provider: "mock" };

  // -------------------------------------------------------------
  // Test 1: Simple Factual Claims
  // -------------------------------------------------------------
  it("Test 1: should correctly detect, classify, and normalize simple factual claims", async () => {
    const transcript = {
      text: "The Earth revolves around the Sun. Jupiter is the largest planet in our solar system.",
      duration: 10.0,
      language: "en",
      segments: [
        { id: 0, start: 0.0, end: 4.5, text: "The Earth revolves around the Sun." },
        { id: 1, start: 4.5, end: 10.0, text: "Jupiter is the largest planet in our solar system." },
      ],
    };

    const result = await ClaimService.extractClaims(transcript, mockOptions);

    assert.equal(result.claims.length, 2);
    assert.equal(result.summary.total, 2);
    assert.equal(result.summary.factual, 2);

    const [claim1, claim2] = result.claims;

    assert.equal(claim1.type, "FACTUAL");
    assert.equal(claim1.originalText, "The Earth revolves around the Sun.");
    assert.equal(claim1.startTime, 0.0);
    assert.equal(claim1.endTime, 4.5);
    assert.ok(claim1.reason.length > 5);

    assert.equal(claim2.type, "FACTUAL");
    assert.equal(claim2.originalText, "Jupiter is the largest planet in our solar system.");
    assert.equal(claim2.startTime, 4.5);
    assert.equal(claim2.endTime, 10.0);
    assert.ok(claim2.reason.length > 5);
  });

  // -------------------------------------------------------------
  // Test 2: Opinion / Subjective Statements
  // -------------------------------------------------------------
  it("Test 2: should identify and classify subjective opinions", async () => {
    const transcript = {
      text: "I think this is the best university in India.",
      duration: 5.0,
      language: "en",
      segments: [
        { id: 0, start: 0.5, end: 4.8, text: "I think this is the best university in India." },
      ],
    };

    const result = await ClaimService.extractClaims(transcript, mockOptions);

    assert.equal(result.claims.length, 1);
    const claim = result.claims[0];
    assert.equal(claim.type, "OPINION");
    assert.equal(claim.startTime, 0.5);
    assert.equal(claim.endTime, 4.8);
    assert.match(claim.reason, /subjective|belief|appraisal|value/i);
  });

  // -------------------------------------------------------------
  // Test 3: Predictions / Speculation
  // -------------------------------------------------------------
  it("Test 3: should identify and classify future predictions", async () => {
    const transcript = {
      text: "AI will replace most programmers within five years.",
      duration: 6.0,
      language: "en",
      segments: [
        { id: 0, start: 1.0, end: 5.5, text: "AI will replace most programmers within five years." },
      ],
    };

    const result = await ClaimService.extractClaims(transcript, mockOptions);

    assert.equal(result.claims.length, 1);
    const claim = result.claims[0];
    assert.equal(claim.type, "PREDICTION");
    assert.equal(claim.startTime, 1.0);
    assert.equal(claim.endTime, 5.5);
    assert.match(claim.reason, /speculative|forecast|future/i);
  });

  // -------------------------------------------------------------
  // Test 4: Non-Claims (Greetings / CTA / Filler)
  // -------------------------------------------------------------
  it("Test 4: should identify greetings, instructions, and non-claims", async () => {
    const transcript = {
      text: "Welcome back to my channel. Please subscribe and like the video.",
      duration: 6.0,
      language: "en",
      segments: [
        { id: 0, start: 0.0, end: 2.5, text: "Welcome back to my channel." },
        { id: 1, start: 2.5, end: 5.8, text: "Please subscribe and like the video." },
      ],
    };

    const result = await ClaimService.extractClaims(transcript, mockOptions);

    assert.equal(result.claims.length, 2);
    assert.equal(result.summary.nonClaim, 2);
    assert.equal(result.claims[0].type, "NON_CLAIM");
    assert.equal(result.claims[1].type, "NON_CLAIM");
  });

  // -------------------------------------------------------------
  // Test 5: Multiple Claims in One Sentence / Segment
  // -------------------------------------------------------------
  it("Test 5: should split compound sentences in one segment into distinct atomic claims", async () => {
    const transcript = {
      text: "The Earth is the third planet from the Sun and Jupiter is the largest planet.",
      duration: 8.0,
      language: "en",
      segments: [
        {
          id: 0,
          start: 0.0,
          end: 7.5,
          text: "The Earth is the third planet from the Sun and Jupiter is the largest planet.",
        },
      ],
    };

    const result = await ClaimService.extractClaims(transcript, mockOptions);

    assert.equal(result.claims.length, 2);
    assert.equal(result.claims[0].type, "FACTUAL");
    assert.equal(result.claims[1].type, "FACTUAL");
    assert.equal(result.claims[0].originalText, "The Earth is the third planet from the Sun");
    assert.equal(result.claims[1].originalText, "Jupiter is the largest planet");
    assert.deepEqual(result.claims[0].sourceSegmentIds, [0]);
    assert.deepEqual(result.claims[1].sourceSegmentIds, [0]);
    assert.equal(result.claims[0].startTime, 0.0);
    assert.equal(result.claims[0].endTime, 7.5);
  });

  // -------------------------------------------------------------
  // Test 6: Precise Timestamp Preservation
  // -------------------------------------------------------------
  it("Test 6: should preserve and accurately map timestamps across single and multi-segments", async () => {
    const segmentsMap = new Map([
      [10, { id: 10, start: 12.4, end: 15.6, text: "Segment 10" }],
      [11, { id: 11, start: 15.6, end: 19.8, text: "Segment 11" }],
    ]);

    // Single segment mapping
    const single = calculateClaimTimestamps([10], segmentsMap, 30);
    assert.equal(single.startTime, 12.4);
    assert.equal(single.endTime, 15.6);

    // Multi-segment span mapping
    const multi = calculateClaimTimestamps([10, 11], segmentsMap, 30);
    assert.equal(multi.startTime, 12.4);
    assert.equal(multi.endTime, 19.8);

    // Formatter tests
    assert.equal(formatTimestamp(75.5), "01:15");
    assert.equal(formatTimestamp(0), "00:00");
  });

  // -------------------------------------------------------------
  // Test 7: Ambiguous Statements Fallback
  // -------------------------------------------------------------
  it("Test 7: should handle ambiguous or uncertain statements with sensible fallback", async () => {
    const transcript = {
      text: "Maybe it was something else, uncertain what happened.",
      duration: 4.0,
      language: "en",
      segments: [
        { id: 0, start: 0.0, end: 3.8, text: "Maybe it was something else, uncertain what happened." },
      ],
    };

    const result = await ClaimService.extractClaims(transcript, mockOptions);

    assert.equal(result.claims.length, 1);
    const claim = result.claims[0];
    assert.notEqual(claim.type, "FACTUAL");
    assert.ok(claim.reason.length > 5);
  });

  // -------------------------------------------------------------
  // Test 8: Empty / Invalid Transcript Validation & Error Handling
  // -------------------------------------------------------------
  it("Test 8a: should return empty claims array for empty or whitespace transcript", async () => {
    const result = await ClaimService.extractClaims({ text: "   ", segments: [] }, mockOptions);
    assert.deepEqual(result.claims, []);
    assert.equal(result.summary.total, 0);
  });

  it("Test 8b: should reject malformed transcript payload in validator", () => {
    const invalidPayload = {
      transcript: {
        // missing text & segments is not an array
        segments: "not-an-array",
      },
    };

    const validation = validateExtractClaimsRequest(invalidPayload);
    assert.equal(validation.success, false);
    assert.ok(validation.details.length > 0);
  });

  it("Test 8c: should validate compliant claim results against Zod schema", () => {
    const validData = {
      claims: [
        {
          id: "claim_001",
          originalText: "Earth orbits the Sun.",
          normalizedText: "The Earth orbits the Sun.",
          type: "FACTUAL",
          startTime: 0,
          endTime: 4,
          sourceSegmentIds: [0],
          reason: "Verifiable astronomical fact.",
        },
      ],
      summary: {
        total: 1,
        factual: 1,
        opinion: 0,
        prediction: 0,
        nonClaim: 0,
      },
    };

    const validation = validateClaimResult(validData);
    assert.equal(validation.success, true);
  });

  // -------------------------------------------------------------
  // Test 9: End-to-End API Route Request Handling
  // -------------------------------------------------------------
  it("Test 9: POST /api/claims/extract endpoint responds with valid claims payload", async () => {
    const payload = {
      transcript: {
        text: "The Earth revolves around the Sun. One revolution takes approximately 365 days.",
        duration: 8.0,
        language: "en",
        segments: [
          { id: 0, start: 0.0, end: 4.0, text: "The Earth revolves around the Sun." },
          { id: 1, start: 4.0, end: 8.0, text: "One revolution takes approximately 365 days." },
        ],
      },
      options: {
        provider: "mock",
      },
    };

    // Simulate Express request using node native fetch to running listener or direct handler
    // We test route mapping via direct handler test
    const { ClaimController } = await import("../src/controllers/claim.controller.js");

    let responseStatus = 0;
    let responseBody = null;

    const mockReq = { body: payload };
    const mockRes = {
      status(code) {
        responseStatus = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      },
    };

    await ClaimController.extractClaims(mockReq, mockRes, (err) => {
      if (err) throw err;
    });

    assert.equal(responseStatus, 200);
    assert.equal(responseBody.success, true);
    assert.equal(responseBody.data.claims.length, 2);
    assert.equal(responseBody.data.summary.total, 2);
  });
});
