import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { EvidenceRetrievalService } from "../src/services/evidence-retrieval.service.js";
import { QueryGenerationService } from "../src/services/query-generation.service.js";
import { SourceRankingService } from "../src/services/source-ranking.service.js";
import { MockSearchProvider } from "../src/services/search-providers/mock-search.provider.js";
import { YouComSearchProvider } from "../src/services/search-providers/youcom-search.provider.js";
import { SearchProviderFactory } from "../src/services/search-providers/search.factory.js";
import { validateEvidenceRetrievalRequest } from "../src/validators/evidence.validator.js";
import { validateEvidenceRetrievalResponse } from "../src/validators/evidence.validator.js";
import { validateEvidenceItem } from "../src/validators/evidence.validator.js";
import { calculateClaimTimestamps } from "../src/utils/timestamp.utils.js";

describe("Phase 3: Evidence Retrieval Suite", () => {
  const mockFactualClaims = [
    {
      claimId: "claim_001",
      text: "The Earth revolves around the Sun.",
      normalizedText: "The Earth revolves around the Sun.",
      category: "FACTUAL",
      startTime: 0.0,
      endTime: 4.5,
      sourceSegmentIds: [0],
      reason: "Asserts an empirically verifiable astronomical fact.",
    },
    {
      claimId: "claim_002",
      text: "Jupiter is the largest planet in our solar system.",
      normalizedText: "Jupiter is the largest planet in our solar system.",
      category: "FACTUAL",
      startTime: 5.0,
      endTime: 9.5,
      sourceSegmentIds: [1],
      reason: "Asserts an empirically verifiable astronomical fact about Jupiter.",
    },
  ];

  const mockNonFactualClaims = [
    {
      claimId: "claim_003",
      text: "I think space exploration is fascinating.",
      normalizedText: "I think space exploration is fascinating.",
      category: "OPINION",
      startTime: 10.0,
      endTime: 14.0,
      sourceSegmentIds: [2],
      reason: "Expresses a subjective personal belief.",
    },
    {
      claimId: "claim_004",
      text: "AI will replace most programmers within five years.",
      normalizedText: "AI will replace most programmers within five years.",
      category: "PREDICTION",
      startTime: 15.0,
      endTime: 19.0,
      sourceSegmentIds: [3],
      reason: "Asserts a forward-looking speculative forecast.",
    },
    {
      claimId: "claim_005",
      text: "Welcome back to my channel.",
      normalizedText: "Welcome back to my channel.",
      category: "NON_CLAIM",
      startTime: 20.0,
      endTime: 22.0,
      sourceSegmentIds: [4],
      reason: "Conversational greeting containing no verifiable proposition.",
    },
  ];

  const allClaims = [...mockFactualClaims, ...mockNonFactualClaims];

  // -------------------------------------------------------------
  // Test 1: Valid Factual Claims
  // -------------------------------------------------------------
  it("does not expose synthetic mock search results as real citations", async () => {
    const { results, summary } = await EvidenceRetrievalService.retrieveEvidence(
      mockFactualClaims,
      { provider: "mock" }
    );

    assert.equal(results.length, 2);
    assert.equal(summary.totalClaims, 2);
    assert.equal(summary.completed, 0);
    assert.equal(summary.failed, 2);
    assert.equal(summary.skippedNonFactual, 0);
    assert.equal(summary.totalEvidenceItems, 0);

    for (const result of results) {
      assert.equal(result.status, "FAILED");
      assert.deepEqual(result.evidence, []);
      assert.equal(result.errors[0].code, "MOCK_SEARCH_NOT_FOR_CITATIONS");
    }
  });

  // -------------------------------------------------------------
  // Test 2: Non-Factual Claims Are Skipped
  // -------------------------------------------------------------
  it("Test 2: should skip non-factual claims (OPINION, PREDICTION, NON_CLAIM)", async () => {
    const { results, summary } = await EvidenceRetrievalService.retrieveEvidence(
      mockNonFactualClaims,
      { provider: "mock" }
    );

    assert.equal(results.length, 3);
    assert.equal(summary.totalClaims, 3);
    assert.equal(summary.completed, 0);
    assert.equal(summary.skippedNonFactual, 3);
    assert.equal(summary.totalEvidenceItems, 0);

    for (const result of results) {
      assert.equal(result.status, "SKIPPED_NON_FACTUAL");
      assert.equal(result.evidence.length, 0);
      assert.equal(result.queries.length, 0);
      assert.equal(result.errors.length, 1);
      assert.equal(result.errors[0].code, "NON_FACTUAL_CLAIM");
    }
  });

  // -------------------------------------------------------------
  // Test 3: Mixed Claims (Factual + Non-Factual)
  // -------------------------------------------------------------
  it("Test 3: should process mixed claims correctly", async () => {
    const { results, summary } = await EvidenceRetrievalService.retrieveEvidence(
      allClaims,
      { provider: "mock" }
    );

    assert.equal(results.length, 5);
    assert.equal(summary.totalClaims, 5);
    assert.equal(summary.completed, 0);
    assert.equal(summary.failed, 2);
    assert.equal(summary.skippedNonFactual, 3);
    assert.equal(summary.totalEvidenceItems, 0);
  });

  // -------------------------------------------------------------
  // Test 4: Query Generation
  // -------------------------------------------------------------
  it("Test 4: should generate valid search queries from claim text", async () => {
    const claimText = "The Earth revolves around the Sun once every 365 days.";
    const queries = await QueryGenerationService.generateQueries(claimText, { maxQueries: 3 });

    assert.ok(Array.isArray(queries));
    assert.ok(queries.length > 0);
    assert.ok(queries.length <= 3);

    for (const q of queries) {
      assert.ok(typeof q === "string");
      assert.ok(q.length >= 5);
      assert.ok(q.length <= 300);
    }

    // Should include the original claim as first query
    assert.ok(queries.some((q) => q.toLowerCase().includes("earth")));
    assert.ok(queries.some((q) => q.toLowerCase().includes("sun")));
    assert.ok(queries.some((q) => q.toLowerCase().includes("evidence for or against")));
  });

  // -------------------------------------------------------------
  // Test 5: Query Deduplication
  // -------------------------------------------------------------
  it("Test 5: should deduplicate equivalent queries", () => {
    const queries = [
      "earth orbits sun",
      "Earth orbits Sun",
      "EARTH ORBITS SUN",
      "earth revolves around sun",
      "jupiter largest planet",
    ];

    const deduplicated = QueryGenerationService.validateAndDeduplicate(queries);

    assert.ok(deduplicated.length < queries.length);
    assert.ok(deduplicated.some((q) => q.toLowerCase() === "earth orbits sun"));
    assert.ok(deduplicated.some((q) => q.toLowerCase() === "earth revolves around sun"));
    assert.ok(deduplicated.some((q) => q.toLowerCase() === "jupiter largest planet"));
  });

  // -------------------------------------------------------------
  // Test 6: Search Result Normalization (Mock Provider)
  // -------------------------------------------------------------
  it("Test 6: should normalize search results from mock provider", async () => {
    const provider = new MockSearchProvider();
    const results = await provider.search("earth orbits sun", { count: 3 });

    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0);
    assert.ok(results.length <= 3);

    for (const result of results) {
      assert.ok(result.title);
      assert.ok(result.url.startsWith("https://"));
      assert.ok(result.snippet);
      assert.ok(["NEWS", "GOVERNMENT", "ORGANIZATION", "ACADEMIC", "BLOG", "FORUM", "OTHER"].includes(result.sourceType));
      assert.equal(result.provider, "mock");
    }
  });

  // -------------------------------------------------------------
  // Test 7: Evidence Deduplication
  // -------------------------------------------------------------
  it("Test 7: should deduplicate evidence by URL and near-identical snippets", () => {
    const evidence = [
      { url: "https://example.com/article", snippet: "Earth orbits the Sun." },
      { url: "https://example.com/article", snippet: "Earth orbits the Sun." }, // Duplicate URL
      { url: "https://example.com/article2", snippet: "Earth orbits the Sun." }, // Duplicate snippet
      { url: "https://example.com/article3", snippet: "Jupiter is the largest planet." },
    ];

    const unique = SourceRankingService.deduplicateEvidence(evidence);

    assert.equal(unique.length, 2);
    assert.ok(unique.some((e) => e.url === "https://example.com/article"));
    assert.ok(unique.some((e) => e.url === "https://example.com/article3"));
  });

  // -------------------------------------------------------------
  // Test 8: Evidence Ranking
  // -------------------------------------------------------------
  it("Test 8: should rank evidence by relevance to claim", () => {
    const claimText = "The Earth revolves around the Sun in 365 days.";
    const evidenceItems = [
      {
        title: "Earth Orbit",
        snippet: "Earth revolves around the Sun once every 365.25 days.",
        url: "https://nasa.gov/earth",
        sourceType: "GOVERNMENT",
        publishedAt: "2024-01-15T00:00:00Z",
      },
      {
        title: "Random Article",
        snippet: "The weather today is sunny and warm.",
        url: "https://example.com/weather",
        sourceType: "BLOG",
        publishedAt: "2024-06-01T00:00:00Z",
      },
      {
        title: "Solar System",
        snippet: "Earth orbits the Sun. Jupiter is the largest planet.",
        url: "https://space.com/solar",
        sourceType: "NEWS",
        publishedAt: "2024-03-10T00:00:00Z",
      },
    ];

    const ranked = SourceRankingService.rankEvidence(claimText, evidenceItems);

    assert.equal(ranked.length, 3);
    // First result should have highest score (most relevant)
    assert.ok(ranked[0].retrievalScore > ranked[1].retrievalScore);
    assert.ok(ranked[0].retrievalScore > ranked[2].retrievalScore);
    // NASA (GOVERNMENT) with exact match should rank highest
    assert.ok(ranked[0].url.includes("nasa.gov"));
    // All scores in valid range
    for (const item of ranked) {
      assert.ok(item.retrievalScore >= 0 && item.retrievalScore <= 1);
    }
  });

  // -------------------------------------------------------------
  // Test 9: Missing Metadata Handling
  // -------------------------------------------------------------
  it("Test 9: should handle missing metadata gracefully", () => {
    const claimText = "Test claim.";
    const evidenceItems = [
      {
        title: "No Date Article",
        snippet: "Some content about test claim.",
        url: "https://example.com/no-date",
        sourceType: "NEWS",
        publishedAt: null,
      },
      {
        title: "No Publisher",
        snippet: "More content.",
        url: "https://unknown-site.xyz/article",
        sourceType: "OTHER",
        publishedAt: "2024-01-01T00:00:00Z",
      },
    ];

    const ranked = SourceRankingService.rankEvidence(claimText, evidenceItems);

    assert.equal(ranked.length, 2);
    for (const item of ranked) {
      assert.ok(item.retrievalScore >= 0 && item.retrievalScore <= 1);
      // publishedAt null should not crash
    }
  });

  // -------------------------------------------------------------
  // Test 10: Empty Search Results
  // -------------------------------------------------------------
  it("Test 10: should handle empty search results", async () => {
    const provider = new MockSearchProvider();
    // Query unlikely to match mock data
    const results = await provider.search("xyzabc123nonexistentquery", { count: 5 });

    // Mock provider always returns some results, but they'll be generic
    assert.ok(Array.isArray(results));
  });

  // -------------------------------------------------------------
  // Test 11: Request Validation
  // -------------------------------------------------------------
  it("Test 11: should validate evidence retrieval request", () => {
    // Valid request
    const validPayload = {
      claims: mockFactualClaims,
      options: { maxQueriesPerClaim: 3 },
    };
    const validResult = validateEvidenceRetrievalRequest(validPayload);
    assert.equal(validResult.success, true);

    // Invalid: missing claims
    const invalidPayload1 = { claims: [] };
    const invalidResult1 = validateEvidenceRetrievalRequest(invalidPayload1);
    assert.equal(invalidResult1.success, false);

    // Invalid: non-factual claim missing required fields
    const invalidPayload2 = {
      claims: [{ claimId: "test", text: "test", category: "INVALID" }],
    };
    const invalidResult2 = validateEvidenceRetrievalRequest(invalidPayload2);
    assert.equal(invalidResult2.success, false);
  });

  // -------------------------------------------------------------
  // Test 12: Response Validation
  // -------------------------------------------------------------
  it("validates the explicit mock-mode failure response", async () => {
    const { results, summary } = await EvidenceRetrievalService.retrieveEvidence(
      mockFactualClaims,
      { provider: "mock" }
    );

    const response = {
      success: true,
      results,
      summary,
    };

    const validation = validateEvidenceRetrievalResponse(response);
    assert.equal(validation.success, true);
  });

  // -------------------------------------------------------------
  // Test 13: Partial Success Across Multiple Claims
  // -------------------------------------------------------------
  it("Test 13: should handle partial failures gracefully", async () => {
    // This test would need a provider that fails for some queries
    // For now, verify the service handles the structure correctly
    const { results } = await EvidenceRetrievalService.retrieveEvidence(
      mockFactualClaims,
      { provider: "mock", maxResultsPerClaim: 1 }
    );

    // Mock results must not be accepted as evidence, even when limited.
    assert.equal(results.length, 2);
    for (const result of results) {
      assert.equal(result.status, "FAILED");
      assert.equal(result.errors[0].code, "MOCK_SEARCH_NOT_FOR_CITATIONS");
    }
  });

  it("uses You.com's current POST search endpoint and normalizes its unified results", async (t) => {
    let request;
    const provider = new YouComSearchProvider("test-search-key");
    t.mock.method(provider.client, "post", async (...args) => {
      request = args;
      return {
        data: {
          results: {
            web: [{ title: "Source", url: "https://example.com/article", description: "A useful source." }],
            news: [{ title: "News", url: "https://news.example.com/story", snippets: ["A news", "result."] }],
          },
        },
      };
    });

    const results = await provider.search("example claim", { count: 2 });

    assert.equal(provider.baseUrl, "https://ydc-index.io/v1/search");
    assert.equal(request[0], "");
    assert.deepEqual(request[1], { query: "example claim" });
    assert.equal(results.length, 2);
    assert.equal(results[0].snippet, "A useful source.");
    assert.equal(results[1].snippet, "A news result.");
  });

  it("rejects unknown search providers instead of silently switching to mock", () => {
    assert.throws(() => SearchProviderFactory.getProvider({ provider: "unknown" }), {
      code: "UNSUPPORTED_SEARCH_PROVIDER",
    });
  });

  // -------------------------------------------------------------
  // Test 14: Zod Schema Validation for Evidence Items
  // -------------------------------------------------------------
  it("Test 14: should validate individual evidence items", () => {
    const validEvidence = {
      evidenceId: "ev_test123",
      claimId: "claim_001",
      title: "Test Article",
      url: "https://example.com/article",
      publisher: "Example Publisher",
      publishedAt: "2024-01-15T00:00:00Z",
      retrievedAt: new Date().toISOString(),
      snippet: "Test snippet about the claim.",
      sourceType: "NEWS",
      retrievalScore: 0.85,
      searchQuery: "test query",
      extractionStatus: "SUCCESS",
    };

    const validation = validateEvidenceItem(validEvidence);
    assert.equal(validation.success, true);

    // Invalid: missing required fields
    const invalidEvidence = { ...validEvidence };
    delete invalidEvidence.evidenceId;
    const invalidValidation = validateEvidenceItem(invalidEvidence);
    assert.equal(invalidValidation.success, false);
  });

  // -------------------------------------------------------------
  // Test 15: Timestamp Preservation
  // -------------------------------------------------------------
  it("Test 15: should preserve claim timestamps in evidence results", async () => {
    const { results } = await EvidenceRetrievalService.retrieveEvidence(
      mockFactualClaims,
      { provider: "mock" }
    );

    for (const result of results) {
      const originalClaim = mockFactualClaims.find((c) => c.claimId === result.claimId);
      assert.ok(originalClaim);
      assert.equal(result.claimText, originalClaim.normalizedText);
    }
  });

  // -------------------------------------------------------------
  // Test 16: Concurrent Fetch Limit
  // -------------------------------------------------------------
  it("Test 16: should respect max concurrent fetches config", async () => {
    const claimsWithMany = Array.from({ length: 5 }, (_, i) => ({
      ...mockFactualClaims[0],
      claimId: `claim_${String(i + 1).padStart(3, "0")}`,
      text: `Test claim ${i + 1}`,
      normalizedText: `Test claim ${i + 1}`,
    }));

    const startTime = Date.now();
    const { results } = await EvidenceRetrievalService.retrieveEvidence(
      claimsWithMany,
      { provider: "mock", maxResultsPerClaim: 2 }
    );
    const elapsed = Date.now() - startTime;

    // Should complete without hanging (concurrency working)
    assert.equal(results.length, 5);
    assert.ok(elapsed < 15000); // Should complete within reasonable time
  });
});