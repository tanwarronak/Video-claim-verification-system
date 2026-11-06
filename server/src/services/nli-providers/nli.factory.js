import { MockNliProvider } from "./mock-nli.provider.js";
import { NvidiaNliProvider } from "./nvidia-nli.provider.js";

/**
 * NLI Provider Factory.
 * Returns an instance of the configured NLI provider.
 */
export class NliProviderFactory {
  /**
   * @param {object} [options]
   * @param {"nvidia"|"mock"} [options.provider] - Provider type (required)
   * @param {string} [options.apiKey]
   * @param {string} [options.model]
   */
  static getProvider(options = {}) {
    const providerType = (options.provider || "nvidia").toLowerCase();

    switch (providerType) {
      case "mock":
        return new MockNliProvider();
      case "nvidia":
        return new NvidiaNliProvider(options.apiKey, options.model);
      default: {
        const err = new Error(`Unsupported NLI provider "${providerType}". Use "nvidia" or "mock".`);
        err.code = "UNSUPPORTED_NLI_PROVIDER";
        err.statusCode = 500;
        throw err;
      }
    }
  }
}