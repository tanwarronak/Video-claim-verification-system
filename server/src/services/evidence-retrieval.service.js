import { config } from "../config/env.config.js";
import { SearchProviderFactory } from "./search-providers/search.factory.js";
import { QueryGenerationService } from "./query-generation.service.js";
import { SourceRankingService } from "./source-ranking.service.js";
import {
  fetchPageContent,
  extractRelevantPassages,
  generateEvidenceId,
  getCurrentTimestamp,
} from "../utils/evidence-normalizer.js";

/**
 * Evidence Retrieval Service.
 * Orchestrates query generation, search, page fetching, extraction, and ranking.
 */
export class EvidenceRetrievalService {
  /**
   * Retrieves evidence for a list of claims.
   * Only processes FACTUAL claims; others are skipped.
   *
   * @param {Array<{ claimId: string, text: string, normalizedText?: string, category: string, startTime: number, endTime: number, sourceSegmentIds?: number[], reason?: string }>} claims
   * @param {object} [options]
   * @returns {Promise<{ results: Array<object>, summary: object }>}
   */
  static async retrieveEvidence(claims, options = {}) {
    const startTime = Date.now();
    const maxTotalTime = options.maxTotalTime || config.evidenceMaxTotalTimeMs || 30000;
    const maxQueriesPerClaim = options.maxQueriesPerClaim || config.evidenceMaxQueries || 3;
    const maxResultsPerClaim = options.maxResultsPerClaim || config.evidenceMaxResultsPerClaim || 8;
    const providerType = options.provider || config.searchProvider || "mock";

    const provider = SearchProviderFactory.getProvider({ provider: providerType });
    const isMockProvider = provider.getName() === "mock";
    const results = [];
    let completed = 0;
    let partial = 0;
    let failed = 0;
    let skippedNonFactual = 0;
    let totalEvidenceItems = 0;

    for (const claim of claims) {
      // Check timeout
      if (Date.now() - startTime > maxTotalTime) {
        console.warn("[EvidenceRetrievalService] Max total time exceeded, stopping early");
        break;
      }

      // Skip non-factual claims
      if (claim.category !== "FACTUAL") {
        results.push({
          claimId: claim.claimId,
          claimText: claim.normalizedText || claim.text,
          status: "SKIPPED_NON_FACTUAL",
          queries: [],
          evidence: [],
          errors: [{ code: "NON_FACTUAL_CLAIM", message: "Evidence retrieval only supports FACTUAL claims" }],
        });
        skippedNonFactual++;
        continue;
      }

      try {
        const claimResult = await this.retrieveEvidenceForClaim(
          claim,
          provider,
          isMockProvider,
          maxQueriesPerClaim,
          maxResultsPerClaim,
          maxTotalTime - (Date.now() - startTime)
        );

        results.push(claimResult);
        totalEvidenceItems += claimResult.evidence.length;

        if (claimResult.status === "COMPLETED") {
          completed++;
        } else if (claimResult.status === "PARTIAL") {
          partial++;
        } else {
          failed++;
        }
      } catch (err) {
        console.error(`[EvidenceRetrievalService] Failed to process claim ${claim.claimId}:`, err.message);
        results.push({
          claimId: claim.claimId,
          claimText: claim.normalizedText || claim.text,
          status: "FAILED",
          queries: [],
          evidence: [],
          errors: [{ code: "CLAIM_PROCESSING_ERROR", message: err.message }],
        });
        failed++;
      }
    }

    const summary = {
      totalClaims: claims.length,
      completed,
      partial,
      failed,
      skippedNonFactual,
      totalEvidenceItems,
    };

    return { results, summary };
  }

  /**
   * Retrieves evidence for a single claim.
   * @param {object} claim
   * @param {object} provider
   * @param {boolean} isMockProvider
   * @param {number} maxQueries
   * @param {number} maxResults
   * @param {number} remainingTimeMs
   * @returns {Promise<object>}
   */
  static async retrieveEvidenceForClaim(claim, provider, isMockProvider, maxQueries, maxResults, remainingTimeMs) {
    const claimText = claim.normalizedText || claim.text;
    const errors = [];
    const claimStartTime = Date.now();

    if (isMockProvider) {
      return {
        claimId: claim.claimId,
        claimText,
        status: "FAILED",
        queries: [],
        evidence: [],
        errors: [{
          code: "MOCK_SEARCH_NOT_FOR_CITATIONS",
          message: "Mock search returns synthetic demo data, not real sources. Set SEARCH_PROVIDER to \"youcom\" or \"brave\" and configure SEARCH_API_KEY for real evidence.",
        }],
      };
    }

    // 1. Generate search queries
    let queries;
    try {
      queries = await QueryGenerationService.generateQueries(claimText, { maxQueries });
      queries = QueryGenerationService.validateAndDeduplicate(queries);
    } catch (err) {
      errors.push({ code: "QUERY_GENERATION_FAILED", message: err.message });
      queries = [claimText]; // Fallback
    }

    if (queries.length === 0) {
      queries = [claimText];
    }

    // 2. Execute searches
    const allSearchResults = [];
    for (const query of queries) {
      // Check timeout
      if (Date.now() - claimStartTime > remainingTimeMs) break;

      try {
        const searchResults = await provider.search(query, {
          count: config.evidenceResultsPerQuery || 5,
        });

        allSearchResults.push({
          query,
          results: searchResults,
        });
      } catch (err) {
        errors.push({
          code: "SEARCH_FAILED",
          message: err.message,
          query,
        });
      }
    }

    // 3. Flatten and deduplicate search results
    const flatResults = allSearchResults.flatMap(({ query, results }) =>
      results.map((r) => ({ ...r, searchQuery: query }))
    );

    const uniqueResults = SourceRankingService.deduplicateEvidence(flatResults);

    // 4. Fetch real result pages and extract passages.
    const evidenceItems = [];

    const urlsToFetch = uniqueResults.slice(0, Math.min(maxResults * 2, 10));
    const fetchResults = await this.fetchWithConcurrency(
      urlsToFetch,
      config.evidenceMaxConcurrentFetches || 3,
      claimText
    );

    for (const { searchResult, fetchResult, query } of fetchResults) {
      if (!fetchResult.success) {
        evidenceItems.push({
          evidenceId: generateEvidenceId(),
          claimId: claim.claimId,
          title: searchResult.title,
          url: searchResult.url,
          publisher: this.extractPublisher(searchResult.url),
          publishedAt: searchResult.publishedAt,
          retrievedAt: getCurrentTimestamp(),
          snippet: searchResult.snippet || "Page content could not be retrieved",
          sourceType: searchResult.sourceType,
          retrievalScore: 0,
          searchQuery: query,
          extractionStatus: searchResult.snippet
            ? "PARTIAL"
            : fetchResult.extractionStatus || "FAILED",
        });
        continue;
      }

      const passages = extractRelevantPassages(
        fetchResult.content,
        claimText,
        3,
        500
      );

      for (const passage of passages) {
        evidenceItems.push({
          evidenceId: generateEvidenceId(),
          claimId: claim.claimId,
          title: searchResult.title,
          url: searchResult.url,
          publisher: this.extractPublisher(searchResult.url),
          publishedAt: searchResult.publishedAt,
          retrievedAt: getCurrentTimestamp(),
          snippet: passage,
          sourceType: searchResult.sourceType,
          retrievalScore: 0,
          searchQuery: query,
          extractionStatus: "SUCCESS",
        });
      }

      if (passages.length === 0) {
        evidenceItems.push({
          evidenceId: generateEvidenceId(),
          claimId: claim.claimId,
          title: searchResult.title,
          url: searchResult.url,
          publisher: this.extractPublisher(searchResult.url),
          publishedAt: searchResult.publishedAt,
          retrievedAt: getCurrentTimestamp(),
          snippet: searchResult.snippet || fetchResult.content.substring(0, 500),
          sourceType: searchResult.sourceType,
          retrievalScore: 0,
          searchQuery: query,
          extractionStatus: "PARTIAL",
        });
      }
    }

    // 5. Rank evidence by relevance
    const rankedEvidence = SourceRankingService.rankEvidence(claimText, evidenceItems);

    // 6. Limit results per claim
    const finalEvidence = rankedEvidence.slice(0, maxResults);

    // Determine overall status
    let status = "COMPLETED";
    const hasErrors = errors.length > 0;
    const hasPartialExtractions = finalEvidence.some((e) => e.extractionStatus !== "SUCCESS");

    if (hasErrors && finalEvidence.length === 0) {
      status = "FAILED";
    } else if (hasErrors || hasPartialExtractions) {
      status = "PARTIAL";
    }

    return {
      claimId: claim.claimId,
      claimText,
      status,
      queries,
      evidence: finalEvidence,
      errors,
    };
  }

  /**
   * Fetches multiple URLs with controlled concurrency.
   * @param {Array<object>} searchResults
   * @param {number} maxConcurrent
   * @param {string} claimText
   * @returns {Promise<Array<{ searchResult: object, fetchResult: object, query: string }>>}
   */
  static async fetchWithConcurrency(searchResults, maxConcurrent, claimText) {
    const results = [];

    // Simple concurrency control using a queue
    const queue = [...searchResults];
    const executing = new Set();

    async function processNext() {
      if (queue.length === 0) return;

      const searchResult = queue.shift();
      const query = searchResult.searchQuery;

      const promise = fetchPageContent(searchResult.url).then((fetchResult) => ({
        searchResult,
        fetchResult,
        query,
      }));

      executing.add(promise);

      try {
        const result = await promise;
        results.push(result);
      } finally {
        executing.delete(promise);
        // Process next item
        if (queue.length > 0) {
          await processNext();
        }
      }
    }

    // Start initial concurrent workers
    const workers = Array.from({ length: Math.min(maxConcurrent, searchResults.length) }, () => processNext());

    await Promise.all(workers);

    // Wait for any remaining executing promises
    if (executing.size > 0) {
      await Promise.all(executing);
    }

    return results;
  }

  /**
   * Extracts publisher name from URL.
   * @param {string} url
   * @returns {string|null}
   */
  static extractPublisher(url) {
    try {
      const hostname = new URL(url).hostname;
      // Remove www. and common TLDs for cleaner display
      return hostname
        .replace(/^www\./, "")
        .replace(/\.(com|org|net|gov|edu|io|co|uk|au|ca|de|fr|jp)$/, "");
    } catch {
      return null;
    }
  }
}