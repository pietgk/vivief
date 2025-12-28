/**
 * LLM Judge - evaluates responses using LLM-as-judge pattern
 * Uses Claude CLI for judging to work with Claude Max subscription
 */

import { ClaudeCLIExecutor } from "../runner/claude-cli-executor.js";
import type {
  DimensionScore,
  EvalMode,
  EvalQuestion,
  EvalResponse,
  EvalRun,
  PairwiseResult,
  PointwiseScore,
} from "../types.js";
import {
  buildPairwisePrompt,
  buildPointwisePrompt,
  parsePairwiseResponse,
  parsePointwiseResponse,
} from "./prompts.js";

/**
 * LLM-based judge for scoring responses
 * Uses Claude CLI subprocess for evaluation
 */
export class LLMJudge {
  private executor: ClaudeCLIExecutor;

  constructor() {
    this.executor = new ClaudeCLIExecutor();
  }

  /**
   * Score a single response
   */
  async scorePointwise(question: EvalQuestion, response: EvalResponse): Promise<PointwiseScore> {
    const startTime = Date.now();
    const isEnhanced = response.mode === "enhanced";

    const prompt = buildPointwisePrompt(question, response.response, isEnhanced);

    // Use Claude CLI for judging - no tools needed
    const result = await this.executor.execute(prompt, undefined, {
      allowTools: false,
    });

    const parsed = parsePointwiseResponse(result.response);
    const latencyMs = Date.now() - startTime;

    const score: PointwiseScore = {
      questionId: question.id,
      mode: response.mode,
      dimensions: {
        correctness: this.clampScore(parsed.scores.correctness),
        completeness: this.clampScore(parsed.scores.completeness),
        hallucination: this.clampScore(parsed.scores.hallucination),
        comprehensibility: this.clampScore(parsed.scores.comprehensibility),
      },
      reasoning: parsed.reasoning,
      coveredFacts: parsed.coveredFacts,
      missedFacts: parsed.missedFacts,
      hallucinations: parsed.hallucinations,
      metadata: {
        judgeModel: "claude-cli",
        timestamp: new Date().toISOString(),
        latencyMs,
      },
    };

    // Add context usage for enhanced responses
    if (isEnhanced && parsed.scores.contextUsage) {
      score.contextUsage = {
        score: this.clampScore(parsed.scores.contextUsage),
        observations: parsed.contextUsageObservations ?? [],
      };
    }

    return score;
  }

  /**
   * Compare two responses pairwise
   */
  async comparePairwise(
    question: EvalQuestion,
    baseline: EvalResponse,
    enhanced: EvalResponse
  ): Promise<PairwiseResult> {
    const startTime = Date.now();

    const prompt = buildPairwisePrompt(question, baseline.response, enhanced.response);

    // Use Claude CLI for judging - no tools needed
    const result = await this.executor.execute(prompt, undefined, {
      allowTools: false,
    });

    const parsed = parsePairwiseResponse(result.response);
    const latencyMs = Date.now() - startTime;

    // Map A/B to baseline/enhanced
    const mapWinner = (w: "A" | "B" | "tie"): EvalMode | "tie" => {
      if (w === "A") return "baseline";
      if (w === "B") return "enhanced";
      return "tie";
    };

    return {
      questionId: question.id,
      winner: mapWinner(parsed.overall.winner),
      confidence: parsed.overall.confidence,
      dimensionComparison: [
        {
          dimension: "correctness",
          winner: mapWinner(parsed.dimensions.correctness.winner),
          explanation: parsed.dimensions.correctness.explanation,
        },
        {
          dimension: "completeness",
          winner: mapWinner(parsed.dimensions.completeness.winner),
          explanation: parsed.dimensions.completeness.explanation,
        },
        {
          dimension: "hallucination",
          winner: mapWinner(parsed.dimensions.hallucination.winner),
          explanation: parsed.dimensions.hallucination.explanation,
        },
        {
          dimension: "comprehensibility",
          winner: mapWinner(parsed.dimensions.comprehensibility.winner),
          explanation: parsed.dimensions.comprehensibility.explanation,
        },
      ],
      reasoning: parsed.overall.reasoning,
      metadata: {
        judgeModel: "claude-cli",
        timestamp: new Date().toISOString(),
        latencyMs,
      },
    };
  }

  /**
   * Judge all responses in an evaluation run
   */
  async judgeRun(
    run: EvalRun,
    questions: Map<string, EvalQuestion>,
    onProgress?: (current: number, total: number, message: string) => void
  ): Promise<{ pointwiseScores: PointwiseScore[]; pairwiseResults: PairwiseResult[] }> {
    const pointwiseScores: PointwiseScore[] = [];
    const pairwiseResults: PairwiseResult[] = [];

    // Group responses by question
    const responsesByQuestion = new Map<
      string,
      { baseline?: EvalResponse; enhanced?: EvalResponse }
    >();
    for (const response of run.responses) {
      const existing = responsesByQuestion.get(response.questionId) ?? {};
      existing[response.mode] = response;
      responsesByQuestion.set(response.questionId, existing);
    }

    const entries = Array.from(responsesByQuestion.entries());
    let current = 0;
    const total = entries.length * 3; // 2 pointwise + 1 pairwise per question

    for (const [questionId, responses] of entries) {
      const question = questions.get(questionId);
      if (!question) {
        console.warn(`Question ${questionId} not found, skipping`);
        continue;
      }

      // Score baseline if present
      if (responses.baseline) {
        current++;
        onProgress?.(current, total, `Scoring ${questionId} (baseline)`);
        const score = await this.scorePointwise(question, responses.baseline);
        pointwiseScores.push(score);
      }

      // Score enhanced if present
      if (responses.enhanced) {
        current++;
        onProgress?.(current, total, `Scoring ${questionId} (enhanced)`);
        const score = await this.scorePointwise(question, responses.enhanced);
        pointwiseScores.push(score);
      }

      // Pairwise comparison if both present
      if (responses.baseline && responses.enhanced) {
        current++;
        onProgress?.(current, total, `Comparing ${questionId}`);
        const result = await this.comparePairwise(question, responses.baseline, responses.enhanced);
        pairwiseResults.push(result);
      }
    }

    return { pointwiseScores, pairwiseResults };
  }

  /**
   * Clamp score to valid range
   */
  private clampScore(score: number): DimensionScore {
    const clamped = Math.max(1, Math.min(5, Math.round(score)));
    return clamped as DimensionScore;
  }
}
