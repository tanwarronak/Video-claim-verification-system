import { config } from "../../config/env.config.js";
import { MockSearchProvider } from "./mock-search.provider.js";
import { BraveSearchProvider } from "./web-search.provider.js";
import { YouComSearchProvider } from "./youcom-search.provider.js";

/**
 * Search Provider Factory.
 * Returns an instance of the configured search provider.
 */
export class SearchProviderFactory {
  /**
   * @param {object} [options]
   * @param {"brave"|"youcom"|"mock"} [options.provider]
   * @param {string} [options.apiKey]
   */
  static getProvider(options = {}) {
    const providerType = (options.provider || config.searchProvider || "mock").toLowerCase();

    switch (providerType) {
      case "mock":
        return new MockSearchProvider();
      case "brave":
        return new BraveSearchProvider(options.apiKey);
      case "youcom":
        return new YouComSearchProvider(options.apiKey);
      default:
        {
          const err = new Error(`Unsupported search provider "${providerType}". Use "youcom", "brave", or "mock".`);
          err.code = "UNSUPPORTED_SEARCH_PROVIDER";
          err.statusCode = 400;
          throw err;
        }
    }
  }
}