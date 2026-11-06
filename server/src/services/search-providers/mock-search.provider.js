import { SearchProviderInterface, SearchResult } from "./search-provider.interface.js";

/**
 * Deterministic Mock Search Provider for offline testing, CI environments, and local development.
 * Returns fixed, clearly synthetic test fixtures that simulate real search results.
 */
export class MockSearchProvider extends SearchProviderInterface {
  constructor() {
    super();
    this.name = "mock";
  }

  getName() {
    return this.name;
  }

  /**
   * Returns deterministic mock search results based on query keywords.
   * @param {string} query
   * @param {object} options
   * @returns {Promise<SearchResult[]>}
   */
  async search(query, options = {}) {
    const count = options.count || 5;
    const lowerQuery = query.toLowerCase();

    // Simulate network delay for realistic behavior
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 100 + 50));

    // Generate deterministic but varied mock results based on query content
    const results = this.generateMockResults(lowerQuery, count);
    return results.map((r) => new SearchResult({ ...r, provider: this.name }));
  }

  /**
   * Generate mock results based on query keywords.
   * @param {string} lowerQuery
   * @param {number} count
   * @returns {Array<object>}
   */
  generateMockResults(lowerQuery, count) {
    const results = [];

    // Earth/Sun/Planet related queries
    if (lowerQuery.includes("earth") && (lowerQuery.includes("sun") || lowerQuery.includes("orbit") || lowerQuery.includes("revolve"))) {
      results.push({
        title: "NASA - Earth's Orbit Around the Sun",
        url: "https://solarsystem.nasa.gov/planets/earth/in-depth/",
        snippet: "Earth orbits the Sun at an average distance of 93 million miles (150 million km). One complete orbit takes 365.25 days.",
        sourceType: "GOVERNMENT",
        publishedAt: "2024-01-15T00:00:00Z",
      });
      results.push({
        title: "Earth's Revolution - National Geographic",
        url: "https://www.nationalgeographic.com/science/article/earth-revolution-orbit-sun",
        snippet: "The Earth revolves around the Sun once every 365.25 days. This orbital motion is the basis for our calendar year.",
        sourceType: "ORGANIZATION",
        publishedAt: "2023-11-20T00:00:00Z",
      });
      results.push({
        title: "How Long Does Earth Take to Orbit the Sun? - Space.com",
        url: "https://www.space.com/earth-orbit-sun",
        snippet: "Earth takes 365 days, 6 hours, 9 minutes to complete one orbit around the Sun. This is known as a sidereal year.",
        sourceType: "NEWS",
        publishedAt: "2024-03-10T00:00:00Z",
      });
    }

    // Jupiter related queries
    if (lowerQuery.includes("jupiter") && (lowerQuery.includes("largest") || lowerQuery.includes("biggest") || lowerQuery.includes("planet"))) {
      results.push({
        title: "Jupiter - The Largest Planet - NASA Solar System Exploration",
        url: "https://solarsystem.nasa.gov/planets/jupiter/overview/",
        snippet: "Jupiter is the largest planet in our solar system. It has a radius of 43,440.7 miles (69,911 km), making it 11 times wider than Earth.",
        sourceType: "GOVERNMENT",
        publishedAt: "2024-02-01T00:00:00Z",
      });
      results.push({
        title: "Jupiter Facts - Britannica",
        url: "https://www.britannica.com/science/Jupiter-planet",
        snippet: "Jupiter is the most massive planet in the solar system, more than twice as massive as all other planets combined.",
        sourceType: "ORGANIZATION",
        publishedAt: "2023-09-12T00:00:00Z",
      });
    }

    // WHO / Public Health Emergency queries
    if (lowerQuery.includes("world health organization") || lowerQuery.includes("who") && lowerQuery.includes("emergency")) {
      results.push({
        title: "WHO declares Public Health Emergency of International Concern",
        url: "https://www.who.int/news/item/2024-08-14-who-declares-public-health-emergency",
        snippet: "The World Health Organization declared a Public Health Emergency of International Concern on August 14, 2024, regarding mpox outbreak.",
        sourceType: "ORGANIZATION",
        publishedAt: "2024-08-14T00:00:00Z",
      });
      results.push({
        title: "Public Health Emergency declarations - WHO Archives",
        url: "https://www.who.int/emergencies/public-health-emergency",
        snippet: "List of all Public Health Emergencies of International Concern declared by WHO since 2005 under the IHR (2005).",
        sourceType: "ORGANIZATION",
        publishedAt: "2024-01-01T00:00:00Z",
      });
    }

    // AI/Programmers prediction queries
    if (lowerQuery.includes("ai") && (lowerQuery.includes("programmer") || lowerQuery.includes("replace") || lowerQuery.includes("job"))) {
      results.push({
        title: "Will AI Replace Programmers? - MIT Technology Review",
        url: "https://www.technologyreview.com/2024/03/15/ai-programmers-jobs/",
        snippet: "Experts debate whether AI will replace programmers. Most agree AI will augment rather than replace human developers in the near term.",
        sourceType: "NEWS",
        publishedAt: "2024-03-15T00:00:00Z",
      });
      results.push({
        title: "AI Impact on Software Engineering Jobs - World Economic Forum",
        url: "https://www.weforum.org/reports/ai-software-jobs-2024",
        snippet: "Report predicts AI will transform 40% of programming tasks by 2028, but create new roles in AI oversight and prompt engineering.",
        sourceType: "ORGANIZATION",
        publishedAt: "2024-01-20T00:00:00Z",
      });
    }

    // Generic fallback results for any query
    if (results.length === 0) {
      results.push({
        title: `Research Article: ${lowerQuery}`,
        url: `https://example.org/research/${encodeURIComponent(lowerQuery.substring(0, 50))}`,
        snippet: `This academic article discusses ${lowerQuery} with supporting evidence and citations from peer-reviewed sources.`,
        sourceType: "ACADEMIC",
        publishedAt: "2024-01-01T00:00:00Z",
      });
      results.push({
        title: `News Report: ${lowerQuery}`,
        url: `https://news.example.com/article/${encodeURIComponent(lowerQuery.substring(0, 50))}`,
        snippet: `Recent news coverage examining ${lowerQuery} with expert commentary and data analysis.`,
        sourceType: "NEWS",
        publishedAt: "2024-06-15T00:00:00Z",
      });
      results.push({
        title: `Government Report on ${lowerQuery}`,
        url: `https://gov.example.gov/reports/${encodeURIComponent(lowerQuery.substring(0, 50))}`,
        snippet: `Official government publication providing authoritative information on ${lowerQuery}.`,
        sourceType: "GOVERNMENT",
        publishedAt: "2023-12-01T00:00:00Z",
      });
    }

    // Return requested count
    return results.slice(0, count);
  }
}