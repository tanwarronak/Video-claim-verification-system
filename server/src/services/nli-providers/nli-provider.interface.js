/**
 * NLI Provider Interface.
 * All NLI providers must implement this interface.
 */
export class NliProviderInterface {
  /**
   * Assesses evidence against a claim using Natural Language Inference.
   * @param {string} claimText - The normalized claim text
   * @param {Array<{ evidenceId: string, snippet: string, title: string, url: string, sourceType: string, retrievalScore: number }>} evidenceItems
   * @param {object} options
   * @returns {Promise<Array<{ evidenceId: string, verdict: "SUPPORTS"|"REFUTES"|"NOT_ENOUGH_INFO", confidence: number, reasoning: string, relevantSnippet: string }>>}
   */
  async assessEvidence(claimText, evidenceItems, options = {}) {
    throw new Error("assessEvidence() must be implemented by subclass");
  }

  /**
   * Get the provider name for logging and identification.
   * @returns {string}
   */
  getName() {
    throw new Error("getName() must be implemented by subclass");
  }
}