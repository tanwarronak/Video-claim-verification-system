import axios from "axios";
import { SearchProviderInterface, SearchResult } from "./search-provider.interface.js";
import { config } from "../../config/env.config.js";

/**
 * You.com Search API Provider.
 * Documentation: https://api.you.com/docs
 */
export class YouComSearchProvider extends SearchProviderInterface {
  constructor(apiKey) {
    super();
    this.name = "youcom";
    this.apiKey = apiKey || config.searchApiKey;
    this.baseUrl = "https://ydc-index.io/v1/search";
    this.timeout = config.evidenceRequestTimeoutMs || 10000;

    if (!this.apiKey) {
      const err = new Error(
        "You.com API key is missing. Please set SEARCH_API_KEY in your environment or server/.env."
      );
      err.code = "SEARCH_API_KEY_MISSING";
      err.statusCode = 500;
      throw err;
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        "Accept": "application/json",
        "X-API-Key": this.apiKey,
        "User-Agent": "VideoClaimVerifier/1.0",
      },
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => this.handleError(error)
    );
  }

  getName() {
    return this.name;
  }

  /**
   * Handles and normalizes API errors.
   * @param {Error} error
   * @returns {Promise<never>}
   */
  handleError(error) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      if (status === 401) {
        const err = new Error("Invalid You.com API key. Please check SEARCH_API_KEY.");
        err.code = "SEARCH_AUTH_FAILED";
        err.statusCode = 401;
        throw err;
      }

      if (status === 429) {
        const err = new Error("You.com API rate limit exceeded or quota exhausted.");
        err.code = "SEARCH_RATE_LIMIT";
        err.statusCode = 429;
        if (data?.retry_after) {
          err.retryAfter = data.retry_after;
        }
        throw err;
      }

      if (status >= 500) {
        const err = new Error(`You.com API server error: ${status}`);
        err.code = "SEARCH_SERVER_ERROR";
        err.statusCode = 502;
        throw err;
      }

      const err = new Error(`You.com API error: ${data?.message || error.message}`);
      err.code = "SEARCH_API_ERROR";
      err.statusCode = status;
      throw err;
    }

    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      const err = new Error("You.com API request timed out.");
      err.code = "SEARCH_TIMEOUT";
      err.statusCode = 504;
      throw err;
    }

    if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
      const err = new Error("Unable to connect to You.com API. Check network connectivity.");
      err.code = "SEARCH_NETWORK_ERROR";
      err.statusCode = 503;
      throw err;
    }

    throw error;
  }

  /**
   * Search the web using You.com API.
   * @param {string} query
   * @param {object} options
   * @param {number} [options.count] - Number of results (max 10 for You.com)
   * @param {string} [options.recency] - "day", "week", "month", "year"
   * @returns {Promise<SearchResult[]>}
   */
  async search(query, options = {}) {
    const count = Math.min(options.count || config.evidenceResultsPerQuery || 5, 10);
    try {
      const response = await this.client.post("", {
        query,
      });

      const data = response.data;
      const results = [];
      const webResults = data.results?.web || data.web || data.hits || [];
      const newsResults = data.results?.news || data.news?.results || data.news || [];

      for (const item of webResults) {
        const url = item.url || item.link || "";
        if (url && /^https?:\/\//i.test(url)) {
          results.push(new SearchResult({
            title: item.title || "Untitled",
            url,
            snippet: item.snippet || item.description || (Array.isArray(item.snippets) ? item.snippets.join(" ") : item.snippets) || "",
            sourceType: this.inferSourceType(url),
            publishedAt: item.publishedAt || item.datePublished || null,
            provider: this.name,
          }));
        }
      }

      for (const item of newsResults) {
        const url = item.url || item.link || "";
        if (url && /^https?:\/\//i.test(url)) {
          results.push(new SearchResult({
            title: item.title || "Untitled",
            url,
            snippet: item.description || item.snippet || (Array.isArray(item.snippets) ? item.snippets.join(" ") : item.snippets) || "",
            sourceType: "NEWS",
            publishedAt: item.publishedAt || item.datePublished || null,
            provider: this.name,
          }));
        }
      }

      return results.slice(0, count);
    } catch (err) {
      // Re-throw already handled errors
      if (err.code && err.code.startsWith("SEARCH_")) {
        throw err;
      }
      // Wrap unexpected errors
      const wrappedErr = new Error(`You.com Search failed: ${err.message}`);
      wrappedErr.code = "SEARCH_UNEXPECTED_ERROR";
      wrappedErr.statusCode = 500;
      throw wrappedErr;
    }
  }

  /**
   * Infers source type from URL domain.
   * @param {string} url
   * @returns {string}
   */
  inferSourceType(url) {
    if (!url) return "OTHER";

    try {
      const hostname = new URL(url).hostname.toLowerCase();

      // Government domains
      if (/\.gov(\.|$)/.test(hostname) || /\.mil(\.|$)/.test(hostname) || hostname === "who.int") {
        return "GOVERNMENT";
      }

      // Educational/Academic
      if (/\.edu(\.|$)/.test(hostname) || hostname.includes("scholar.google") || hostname.includes("arxiv.org") || hostname.includes("pubmed")) {
        return "ACADEMIC";
      }

      // Major news organizations
      const newsDomains = [
        "reuters.com", "apnews.com", "bbc.com", "bbc.co.uk", "cnn.com",
        "nytimes.com", "washingtonpost.com", "theguardian.com", "wsj.com",
        "ft.com", "economist.com", "bloomberg.com", "abcnews.go.com",
        "cbsnews.com", "nbcnews.com", "pbs.org", "npr.org", "aljazeera.com",
        "france24.com", "dw.com", "nhk.or.jp", "cbc.ca", "abc.net.au"
      ];
      if (newsDomains.some((d) => hostname.includes(d))) {
        return "NEWS";
      }

      // Major organizations
      const orgDomains = [
        "who.int", "un.org", "unesco.org", "worldbank.org", "imf.org",
        "oecd.org", "wto.org", "nato.int", "europa.eu", "ecb.europa.eu"
      ];
      if (orgDomains.some((d) => hostname.includes(d))) {
        return "ORGANIZATION";
      }

      // Blog platforms
      if (hostname.includes("medium.com") || hostname.includes("substack.com") || hostname.includes("blogspot.com") || hostname.includes("wordpress.com")) {
        return "BLOG";
      }

      // Forums
      if (hostname.includes("reddit.com") || hostname.includes("stackoverflow.com") || hostname.includes("quora.com") || hostname.includes("github.com")) {
        return "FORUM";
      }

      return "OTHER";
    } catch {
      return "OTHER";
    }
  }
}