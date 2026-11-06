import { config } from "../../config/env.config.js";
import { NvidiaProvider } from "./nvidia.provider.js";
import { MockProvider } from "./mock.provider.js";

export class LLMFactory {
  /**
   * Returns an instance of the configured LLM provider.
   * @param {object} [options]
   * @param {"nvidia"|"mock"} [options.provider]
   * @param {string} [options.model]
   * @param {string} [options.apiKey]
   */
  static getProvider(options = {}) {
    const providerType = (options.provider || config.claimLlmProvider || "nvidia").toLowerCase();
    const model = options.model || config.claimLlmModel;

    switch (providerType.toLowerCase()) {
      case "mock":
        return new MockProvider();
      case "nvidia":
        return new NvidiaProvider(options.apiKey, model);
      default: {
        const err = new Error(`Unsupported claim LLM provider "${providerType}". Use "nvidia" or "mock".`);
        err.code = "UNSUPPORTED_LLM_PROVIDER";
        err.statusCode = 500;
        throw err;
      }
    }
  }
}
