/**
 * Source Ranking Service.
 * Implements transparent, deterministic baseline ranking for evidence passages.
 * 
 * Ranking factors (weighted):
 * 1. Lexical/semantic similarity between claim and snippet (40%)
 * 2. Entity overlap (claim entities present in snippet) (25%)
 * 3. Date/quantity matching (15%)
 * 4. Source type authority (NEWS/GOVERNMENT/ACADEMIC > ORGANIZATION > BLOG/FORUM/OTHER) (10%)
 * 5. Freshness (recency of publication) (10%)
 * 
 * Score normalized to 0-1 range.
 */

export class SourceRankingService {
  // Source type authority weights (not truth authority, just retrieval relevance)
  static SOURCE_TYPE_WEIGHTS = {
    GOVERNMENT: 1.0,
    ACADEMIC: 0.95,
    NEWS: 0.9,
    ORGANIZATION: 0.85,
    BLOG: 0.6,
    FORUM: 0.5,
    OTHER: 0.5,
  };

  /**
   * Ranks evidence items by relevance to claim.
   * @param {string} claimText - Normalized claim text
   * @param {Array<{ snippet: string, title: string, url: string, sourceType: string, publishedAt: string|null }>} evidenceItems
   * @returns {Array<{ ...evidenceItem, retrievalScore: number }>}
   */
  static rankEvidence(claimText, evidenceItems) {
    if (!evidenceItems || evidenceItems.length === 0) return [];

    const claimLower = claimText.toLowerCase();
    const claimEntities = this.extractEntities(claimText);
    const claimNumbers = this.extractNumbers(claimText);
    const claimDates = this.extractDates(claimText);

    const scored = evidenceItems.map((item) => {
      const snippet = item.snippet || "";
      const title = item.title || "";
      const combinedText = `${title} ${snippet}`.toLowerCase();

      // 1. Lexical similarity (Jaccard-like token overlap)
      const lexicalScore = this.computeLexicalSimilarity(claimLower, combinedText);

      // 2. Entity overlap
      const entityScore = this.computeEntityOverlap(claimEntities, combinedText);

      // 3. Number/quantity matching
      const numberScore = this.computeNumberMatch(claimNumbers, combinedText);

      // 4. Date matching
      const dateScore = this.computeDateMatch(claimDates, combinedText);

      // 5. Source type weight
      const sourceWeight = this.SOURCE_TYPE_WEIGHTS[item.sourceType] || 0.5;

      // 6. Freshness score (0-1, more recent = higher)
      const freshnessScore = this.computeFreshness(item.publishedAt);

      // Weighted composite score
      const score =
        0.40 * lexicalScore +
        0.25 * entityScore +
        0.15 * numberScore +
        0.10 * sourceWeight +
        0.10 * freshnessScore;

      return {
        ...item,
        retrievalScore: Number(Math.min(1, Math.max(0, score)).toFixed(3)),
      };
    });

    // Sort by score descending
    scored.sort((a, b) => b.retrievalScore - a.retrievalScore);

    return scored;
  }

  /**
   * Extracts key entities from text (capitalized phrases, known patterns).
   * @param {string} text
   * @returns {string[]}
   */
  static extractEntities(text) {
    const entities = new Set();

    // Proper nouns (capitalized words, possibly multi-word)
    const properNouns = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
    for (const noun of properNouns) {
      if (noun.length > 2) entities.add(noun.toLowerCase());
    }

    // Acronyms (2+ uppercase letters)
    const acronyms = text.match(/\b[A-Z]{2,}\b/g) || [];
    for (const acr of acronyms) {
      entities.add(acr.toLowerCase());
    }

    // Quoted phrases
    const quoted = text.match(/"([^"]+)"/g) || [];
    for (const q of quoted) {
      const clean = q.replace(/"/g, "").toLowerCase();
      if (clean.length > 3) entities.add(clean);
    }

    return Array.from(entities);
  }

  /**
   * Extracts numbers with context from text.
   * @param {string} text
   * @returns {string[]}
   */
  static extractNumbers(text) {
    const numbers = [];

    // Numbers with units
    const withUnits = text.match(/\b\d+(?:[.,]\d+)?\s*(?:million|billion|trillion|thousand|km|miles|kg|%|percent|years?|days?|hours?|degrees?)\b/gi) || [];
    numbers.push(...withUnits.map((n) => n.toLowerCase()));

    // Standalone numbers (4+ digits likely years, or with decimal)
    const standalone = text.match(/\b\d{4,}\b|\b\d+[.,]\d+\b/g) || [];
    numbers.push(...standalone);

    return [...new Set(numbers)];
  }

  /**
   * Extracts dates from text.
   * @param {string} text
   * @returns {string[]}
   */
  static extractDates(text) {
    const dates = [];

    // Full dates
    const fullDates = text.match(/\b\d{1,2}\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/gi) || [];
    dates.push(...fullDates.map((d) => d.toLowerCase()));

    // Month year
    const monthYear = text.match(/\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/gi) || [];
    dates.push(...monthYear.map((d) => d.toLowerCase()));

    // Years
    const years = text.match(/\b(?:19|20)\d{2}\b/g) || [];
    dates.push(...years);

    return [...new Set(dates)];
  }

  /**
   * Computes lexical similarity using token overlap (Jaccard-like).
   * @param {string} claimText
   * @param {string} evidenceText
   * @returns {number} 0-1
   */
  static computeLexicalSimilarity(claimText, evidenceText) {
    const stopWords = new Set([
      "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
      "by", "from", "as", "is", "are", "was", "were", "be", "been", "being",
      "have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
      "this", "that", "these", "those", "it", "its", "they", "them", "their",
    ]);

    const claimTokens = new Set(
      claimText
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 2 && !stopWords.has(t))
    );

    const evidenceTokens = new Set(
      evidenceText
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 2 && !stopWords.has(t))
    );

    if (claimTokens.size === 0) return 0;

    let overlap = 0;
    for (const token of claimTokens) {
      if (evidenceTokens.has(token)) overlap++;
    }

    // Jaccard-like: overlap / claim tokens (focus on claim coverage)
    return overlap / claimTokens.size;
  }

  /**
   * Computes entity overlap score.
   * @param {string[]} claimEntities
   * @param {string} evidenceText
   * @returns {number} 0-1
   */
  static computeEntityOverlap(claimEntities, evidenceText) {
    if (claimEntities.length === 0) return 0.5; // Neutral if no entities

    let matches = 0;
    for (const entity of claimEntities) {
      if (evidenceText.includes(entity)) matches++;
    }

    return matches / claimEntities.length;
  }

  /**
   * Computes number/quantity match score.
   * @param {string[]} claimNumbers
   * @param {string} evidenceText
   * @returns {number} 0-1
   */
  static computeNumberMatch(claimNumbers, evidenceText) {
    if (claimNumbers.length === 0) return 0.5; // Neutral

    let matches = 0;
    for (const num of claimNumbers) {
      if (evidenceText.includes(num)) matches++;
    }

    return matches / claimNumbers.length;
  }

  /**
   * Computes date match score.
   * @param {string[]} claimDates
   * @param {string} evidenceText
   * @returns {number} 0-1
   */
  static computeDateMatch(claimDates, evidenceText) {
    if (claimDates.length === 0) return 0.5; // Neutral

    let matches = 0;
    for (const date of claimDates) {
      if (evidenceText.includes(date)) matches++;
    }

    return matches / claimDates.length;
  }

  /**
   * Computes freshness score based on publication date.
   * @param {string|null} publishedAt
   * @returns {number} 0-1
   */
  static computeFreshness(publishedAt) {
    if (!publishedAt) return 0.5; // Unknown date = neutral

    try {
      const pubDate = new Date(publishedAt);
      const now = new Date();
      const ageMs = now - pubDate;
      const ageDays = ageMs / (1000 * 60 * 60 * 24);

      // Decay function: 1.0 at 0 days, ~0.5 at 365 days, ~0.1 at 10 years
      if (ageDays < 0) return 1.0; // Future date (data error) = max
      if (ageDays <= 30) return 1.0;
      if (ageDays <= 90) return 0.9;
      if (ageDays <= 180) return 0.8;
      if (ageDays <= 365) return 0.7;
      if (ageDays <= 730) return 0.6;
      if (ageDays <= 1825) return 0.5; // 5 years
      if (ageDays <= 3650) return 0.3; // 10 years
      return 0.1;
    } catch {
      return 0.5;
    }
  }

  /**
   * Deduplicates evidence by URL and near-identical snippets.
   * @param {Array<object>} evidenceItems
   * @returns {Array<object>}
   */
  static deduplicateEvidence(evidenceItems) {
    const seenUrls = new Set();
    const seenSnippets = new Set();
    const unique = [];

    for (const item of evidenceItems) {
      const urlKey = item.url?.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
      const snippetKey = (item.snippet || "").toLowerCase().replace(/\s+/g, " ").substring(0, 200);

      if (urlKey && seenUrls.has(urlKey)) continue;
      if (snippetKey && seenSnippets.has(snippetKey)) continue;

      if (urlKey) seenUrls.add(urlKey);
      if (snippetKey) seenSnippets.add(snippetKey);
      unique.push(item);
    }

    return unique;
  }
}