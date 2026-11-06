/**
 * Search Provider Interface.
 * All search providers must implement this interface.
 */
export class SearchProviderInterface {
  /**
   * Search for web results given a query.
   * @param {string} query - Search query string
   * @param {object} options - Search options
   * @param {number} [options.count] - Number of results to return
   * @param {string} [options.safeSearch] - Safe search level
   * @returns {Promise<Array<{ title: string, url: string, snippet: string, sourceType?: string, publishedAt?: string }>>}
   */
  async search(query, options = {}) {
    throw new Error("search() must be implemented by subclass");
  }

  /**
   * Get the provider name for logging and identification.
   * @returns {string}
   */
  getName() {
    throw new Error("getName() must be implemented by subclass");
  }
}

/**
 * Normalized search result from any provider.
 */
export class SearchResult {
  constructor(data) {
    this.title = data.title || "Untitled";
    this.url = data.url || "";
    this.snippet = data.snippet || data.description || "";
    this.sourceType = data.sourceType || "OTHER";
    this.publishedAt = data.publishedAt || data.datePublished || data.age || null;
    this.provider = data.provider || "unknown";
  }
}