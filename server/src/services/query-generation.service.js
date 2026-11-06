import { config } from "../config/env.config.js";
import { LLMFactory } from "./llm/llm.factory.js";

/**
 * Query Generation Service.
 * Generates targeted search queries from normalized factual claims.
 */
export class QueryGenerationService {
  /**
   * Generates search queries for a factual claim.
   * Uses deterministic fallback by default; LLM-based generation available if configured.
   *
   * @param {string} claimText - Normalized claim text
   * @param {object} [options]
   * @param {number} [options.maxQueries] - Maximum number of queries to generate (default: config.evidenceMaxQueries)
   * @param {boolean} [options.useLLM] - Whether to use LLM for query generation (default: false)
   * @returns {Promise<string[]>}
   */
  static async generateQueries(claimText, options = {}) {
    const maxQueries = options.maxQueries || config.evidenceMaxQueries || 3;
    const useLLM = options.useLLM || false;

    if (useLLM) {
      return this.generateQueriesWithLLM(claimText, maxQueries);
    }

    return this.generateQueriesDeterministic(claimText, maxQueries);
  }

  /**
   * Deterministic query generation without LLM.
   * Extracts key entities and creates focused search queries.
   *
   * @param {string} claimText
   * @param {number} maxQueries
   * @returns {string[]}
   */
  static generateQueriesDeterministic(claimText, maxQueries) {
    const queries = new Set();
    const text = claimText.trim();

    // Query 1: Full normalized claim as-is (most precise)
    queries.add(text);

    // Add a balanced search intended to surface sources for and against the claim.
    queries.add(`fact check ${text} evidence for or against`);

    // Query 3: Extract key entities and create entity-focused query
    const entityQuery = this.extractEntityQuery(text);
    if (entityQuery && entityQuery !== text) {
      queries.add(entityQuery);
    }

    // Query 3: Create a question-form query for better search results
    const questionQuery = this.toQuestionQuery(text);
    if (questionQuery && questionQuery !== text && !queries.has(questionQuery)) {
      queries.add(questionQuery);
    }

    // Query 4: Key facts/statistics focused query
    const factQuery = this.extractFactQuery(text);
    if (factQuery && factQuery !== text && !queries.has(factQuery)) {
      queries.add(factQuery);
    }

    // Convert to array, filter valid, limit
    const result = Array.from(queries)
      .filter((q) => q.length >= 5 && q.length <= 300)
      .slice(0, maxQueries);

    return result.length > 0 ? result : [text];
  }

  /**
   * Extracts key entities (proper nouns, numbers, dates, organizations) and builds a focused query.
   * @param {string} text
   * @returns {string}
   */
  static extractEntityQuery(text) {
    // Extract capitalized words (potential proper nouns)
    const properNouns = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];

    // Extract numbers with units or standalone
    const numbers = text.match(/\b\d+(?:[.,]\d+)?\s*(?:million|billion|trillion|thousand|km|miles|kg|%|percent|years?|days?|hours?)\b/gi) || [];

    // Extract years
    const years = text.match(/\b(?:19|20)\d{2}\b/g) || [];

    // Extract quoted phrases
    const quoted = text.match(/"([^"]+)"/g) || [];

    const entities = [
      ...properNouns.slice(0, 5),
      ...numbers.slice(0, 3),
      ...years.slice(0, 2),
      ...quoted.slice(0, 2).map((q) => q.replace(/"/g, "")),
    ];

    if (entities.length === 0) return "";

    // Build query: entities + key verbs/nouns from claim
    const keyTerms = this.extractKeyTerms(text);
    const combined = [...entities, ...keyTerms.slice(0, 3)].join(" ");

    return combined.length > 300 ? combined.substring(0, 300) : combined;
  }

  /**
   * Extracts key terms (verbs, nouns) that indicate the core assertion.
   * @param {string} text
   * @returns {string[]}
   */
  static extractKeyTerms(text) {
    const stopWords = new Set([
      "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
      "by", "from", "as", "is", "are", "was", "were", "be", "been", "being",
      "have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
      "this", "that", "these", "those", "it", "its", "they", "them", "their",
      "he", "she", "his", "her", "we", "us", "our", "you", "your",
    ]);

    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    // Count frequency and return top terms
    const freq = {};
    for (const w of words) {
      freq[w] = (freq[w] || 0) + 1;
    }

    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .map(([w]) => w);
  }

  /**
   * Converts a claim statement into a question form for search.
   * @param {string} text
   * @returns {string}
   */
  static toQuestionQuery(text) {
    const lower = text.toLowerCase();

    // "X is Y" -> "Is X Y?" or "X Y"
    if (/^\w+\s+is\s+/.test(lower)) {
      const parts = text.match(/^(\w+)\s+is\s+(.+)$/i);
      if (parts) return `${parts[1]} ${parts[2].replace(/\.$/, "")}`;
    }

    // "X has Y" -> "Does X have Y?"
    if (/^\w+\s+has\s+/.test(lower)) {
      const parts = text.match(/^(\w+)\s+has\s+(.+)$/i);
      if (parts) return `${parts[1]} ${parts[2].replace(/\.$/, "")}`;
    }

    // "X [verb] Y" -> "X [verb] Y"
    const match = text.match(/^(\w+)\s+(\w+)\s+(.+)$/i);
    if (match) {
      return `${match[1]} ${match[2]} ${match[3].replace(/\.$/, "")}`;
    }

    // Default: remove trailing period
    return text.replace(/\.$/, "");
  }

  /**
   * Creates a fact/statistics focused query.
   * @param {string} text
   * @returns {string}
   */
  static extractFactQuery(text) {
    const lower = text.toLowerCase();

    // Look for statistical language
    if (/\b(?:percent|%|million|billion|trillion|thousand|ratio|rate|average|mean|median)\b/.test(lower)) {
      return `${this.extractEntityQuery(text)} statistics data`;
    }

    // Look for date/event language
    if (/\b(?:in|on|during|since|from)\s+\d{4}\b/.test(lower) || /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/.test(lower)) {
      return `${this.extractEntityQuery(text)} date`;
    }

    // Look for comparison
    if (/\b(?:largest|smallest|biggest|fastest|slowest|most|least|more than|less than|greater|fewer)\b/.test(lower)) {
      return `${this.extractEntityQuery(text)} comparison`;
    }

    return "";
  }

  /**
   * Generates queries using LLM for more sophisticated query generation.
   * @param {string} claimText
   * @param {number} maxQueries
   * @returns {Promise<string[]>}
   */
  static async generateQueriesWithLLM(claimText, maxQueries) {
    try {
      const provider = LLMFactory.getProvider();
      // Use a simpler prompt for query generation
      const response = await provider.generateSearchQueries?.(claimText, maxQueries);
      if (response && Array.isArray(response)) {
        return response.slice(0, maxQueries);
      }
    } catch (err) {
      console.warn("[QueryGenerationService] LLM query generation failed, falling back to deterministic:", err.message);
    }

    return this.generateQueriesDeterministic(claimText, maxQueries);
  }

  /**
   * Validates and deduplicates queries.
   * @param {string[]} queries
   * @returns {string[]}
   */
  static validateAndDeduplicate(queries) {
    const seen = new Set();
    const valid = [];

    for (const q of queries) {
      const normalized = q.trim().toLowerCase();
      if (normalized.length >= 5 && normalized.length <= 300 && !seen.has(normalized)) {
        seen.add(normalized);
        valid.push(q.trim());
      }
    }

    return valid;
  }
}