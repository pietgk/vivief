/**
 * Response Collector - collects and organizes evaluation responses
 */

import type { EvalMode, EvalResponse } from "../types.js";

export interface CollectedResponses {
  baseline: Map<string, EvalResponse>;
  enhanced: Map<string, EvalResponse>;
}

/**
 * Collects evaluation responses for a benchmark run
 */
export class ResponseCollector {
  private responses: CollectedResponses = {
    baseline: new Map(),
    enhanced: new Map(),
  };

  /**
   * Add a response to the collection
   */
  add(response: EvalResponse): void {
    const collection =
      response.mode === "baseline" ? this.responses.baseline : this.responses.enhanced;
    collection.set(response.questionId, response);
  }

  /**
   * Get a specific response
   */
  get(questionId: string, mode: EvalMode): EvalResponse | undefined {
    const collection = mode === "baseline" ? this.responses.baseline : this.responses.enhanced;
    return collection.get(questionId);
  }

  /**
   * Get all responses for a mode
   */
  getByMode(mode: EvalMode): EvalResponse[] {
    const collection = mode === "baseline" ? this.responses.baseline : this.responses.enhanced;
    return Array.from(collection.values());
  }

  /**
   * Get all responses
   */
  getAll(): EvalResponse[] {
    return [...this.responses.baseline.values(), ...this.responses.enhanced.values()];
  }

  /**
   * Get paired responses (both baseline and enhanced for same question)
   */
  getPairs(): Array<{ questionId: string; baseline: EvalResponse; enhanced: EvalResponse }> {
    const pairs: Array<{ questionId: string; baseline: EvalResponse; enhanced: EvalResponse }> = [];

    for (const [questionId, baseline] of this.responses.baseline) {
      const enhanced = this.responses.enhanced.get(questionId);
      if (enhanced) {
        pairs.push({ questionId, baseline, enhanced });
      }
    }

    return pairs;
  }

  /**
   * Check if we have both modes for a question
   */
  hasBoth(questionId: string): boolean {
    return this.responses.baseline.has(questionId) && this.responses.enhanced.has(questionId);
  }

  /**
   * Get statistics about collected responses
   */
  getStats(): {
    baselineCount: number;
    enhancedCount: number;
    pairedCount: number;
    totalTokens: { baseline: number; enhanced: number };
    avgLatency: { baseline: number; enhanced: number };
  } {
    const baselineResponses = Array.from(this.responses.baseline.values());
    const enhancedResponses = Array.from(this.responses.enhanced.values());

    const baselineTokens = baselineResponses.reduce((sum, r) => sum + r.metadata.totalTokens, 0);
    const enhancedTokens = enhancedResponses.reduce((sum, r) => sum + r.metadata.totalTokens, 0);

    const baselineLatency =
      baselineResponses.length > 0
        ? baselineResponses.reduce((sum, r) => sum + r.metadata.latencyMs, 0) /
          baselineResponses.length
        : 0;
    const enhancedLatency =
      enhancedResponses.length > 0
        ? enhancedResponses.reduce((sum, r) => sum + r.metadata.latencyMs, 0) /
          enhancedResponses.length
        : 0;

    return {
      baselineCount: this.responses.baseline.size,
      enhancedCount: this.responses.enhanced.size,
      pairedCount: this.getPairs().length,
      totalTokens: { baseline: baselineTokens, enhanced: enhancedTokens },
      avgLatency: { baseline: baselineLatency, enhanced: enhancedLatency },
    };
  }

  /**
   * Export all responses as an array
   */
  toArray(): EvalResponse[] {
    return this.getAll();
  }

  /**
   * Import responses from an array
   */
  fromArray(responses: EvalResponse[]): void {
    for (const response of responses) {
      this.add(response);
    }
  }

  /**
   * Clear all responses
   */
  clear(): void {
    this.responses.baseline.clear();
    this.responses.enhanced.clear();
  }
}
