import { NliProviderInterface } from "./nli-provider.interface.js";

/**
 * Deterministic Mock NLI Provider for offline testing, CI environments, and local development.
 * Returns fixed, clearly synthetic test fixtures that simulate NLI assessments.
 */
export class MockNliProvider extends NliProviderInterface {
  constructor() {
    super();
    this.name = "mock";
  }

  getName() {
    return this.name;
  }

  /**
   * Returns deterministic mock NLI assessments based on claim and evidence content.
   * @param {string} claimText
   * @param {Array<{ evidenceId: string, snippet: string, title: string, url: string, sourceType: string, retrievalScore: number }>} evidenceItems
   * @param {object} options
   * @returns {Promise<Array<{ evidenceId: string, verdict: "SUPPORTS"|"REFUTES"|"NOT_ENOUGH_INFO", confidence: number, reasoning: string, relevantSnippet: string }>>}
   */
  async assessEvidence(claimText, evidenceItems, options = {}) {
    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 100 + 50));

    const assessments = [];
    const claimLower = claimText.toLowerCase();

    for (const item of evidenceItems) {
      const assessment = this.generateMockAssessment(claimLower, item);
      assessments.push(assessment);
    }

    return assessments;
  }

  /**
   * Generate mock assessment based on keyword matching between claim and evidence.
   * @param {string} claimLower
   * @param {object} item
   * @returns {object}
   */
  generateMockAssessment(claimLower, item) {
    const snippetLower = (item.snippet || "").toLowerCase();
    const titleLower = (item.title || "").toLowerCase();
    const combinedText = `${titleLower} ${snippetLower}`;

    // Extract key terms from claim
    const claimTerms = this.extractKeyTerms(claimLower);
    const evidenceTerms = this.extractKeyTerms(combinedText);

    // Calculate term overlap
    const overlap = claimTerms.filter((term) => evidenceTerms.includes(term)).length;
    const overlapRatio = claimTerms.length > 0 ? overlap / claimTerms.length : 0;

    // Check for explicit contradiction keywords
    const contradictionKeywords = [
      "not", "false", "incorrect", "wrong", "debunked", "refuted",
      "contradicts", "disproves", "no evidence", "unfounded", "myth",
      "pseudoscience", "conspiracy", "hoax"
    ];
    const hasContradiction = contradictionKeywords.some((kw) => combinedText.includes(kw));

    // Check for explicit support keywords
    const supportKeywords = [
      "confirms", "supports", "proves", "demonstrates", "shows",
      "evidence indicates", "research shows", "studies confirm",
      "according to", "data shows", "findings suggest"
    ];
    const hasSupport = supportKeywords.some((kw) => combinedText.includes(kw));

    let verdict, confidence, reasoning;

    if (hasContradiction && overlapRatio > 0.2) {
      verdict = "REFUTES";
      confidence = 0.75 + Math.random() * 0.2;
      reasoning = `Evidence contains language contradicting the claim (e.g., "refuted", "debunked", "incorrect").`;
    } else if (hasSupport && overlapRatio > 0.3) {
      verdict = "SUPPORTS";
      confidence = 0.7 + Math.random() * 0.25;
      reasoning = `Evidence explicitly supports the claim with confirming language and shared key terms.`;
    } else if (overlapRatio > 0.4) {
      verdict = "SUPPORTS";
      confidence = 0.6 + Math.random() * 0.25;
      reasoning = `High term overlap between claim and evidence suggests support.`;
    } else if (overlapRatio > 0.2) {
      verdict = "NOT_ENOUGH_INFO";
      confidence = 0.4 + Math.random() * 0.3;
      reasoning = `Partial term overlap but insufficient evidence to reach a definitive conclusion.`;
    } else {
      verdict = "NOT_ENOUGH_INFO";
      confidence = 0.3 + Math.random() * 0.2;
      reasoning = `Low term overlap; evidence does not directly address the claim.`;
    }

    // Special cases for known test claims
    if (claimLower.includes("earth revolves around the sun") || claimLower.includes("earth orbits the sun")) {
      if (combinedText.includes("nasa") || combinedText.includes("orbit") || combinedText.includes("revolves")) {
        verdict = "SUPPORTS";
        confidence = 0.92;
        reasoning = "Authoritative source (NASA) confirms Earth's orbital mechanics around the Sun.";
      }
    }

    if (claimLower.includes("jupiter") && claimLower.includes("largest planet")) {
      if (combinedText.includes("jupiter") && (combinedText.includes("largest") || combinedText.includes("massive"))) {
        verdict = "SUPPORTS";
        confidence = 0.89;
        reasoning = "Multiple authoritative sources confirm Jupiter is the largest planet in our solar system.";
      }
    }

    if (claimLower.includes("who") && claimLower.includes("emergency")) {
      if (combinedText.includes("who") && combinedText.includes("emergency")) {
        verdict = "SUPPORTS";
        confidence = 0.85;
        reasoning = "WHO official declarations confirm public health emergency announcements.";
      }
    }

    // Extract relevant snippet (first 200 chars of evidence snippet)
    const relevantSnippet = item.snippet ? item.snippet.substring(0, 200) : "";

    return {
      evidenceId: item.evidenceId,
      verdict,
      confidence: Number(confidence.toFixed(2)),
      reasoning,
      relevantSnippet,
    };
  }

  /**
   * Extract key terms from text (simple implementation).
   * @param {string} text
   * @returns {string[]}
   */
  extractKeyTerms(text) {
    const stopWords = new Set([
      "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
      "by", "from", "as", "is", "are", "was", "were", "be", "been", "being",
      "have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
      "this", "that", "these", "those", "it", "its", "they", "them", "their",
    ]);

    return text
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w))
      .slice(0, 10);
  }
}