/**
 * Metrics aggregation and calculation
 */

import type {
  DimensionScores,
  EvalRun,
  PairwiseResult,
  PointwiseScore,
  RunSummary,
} from "../types.js";

/**
 * Calculate average scores for a dimension across multiple pointwise scores
 */
function averageScore(scores: PointwiseScore[], dimension: keyof DimensionScores): number {
  if (scores.length === 0) return 0;
  const sum = scores.reduce((acc, s) => acc + s.dimensions[dimension], 0);
  return sum / scores.length;
}

/**
 * Calculate metrics for an evaluation run
 */
export function calculateMetrics(run: EvalRun): RunSummary {
  const baselineScores = run.pointwiseScores.filter((s) => s.mode === "baseline");
  const enhancedScores = run.pointwiseScores.filter((s) => s.mode === "enhanced");

  // Count pairwise results
  let enhancedWins = 0;
  let baselineWins = 0;
  let ties = 0;

  for (const result of run.pairwiseResults) {
    if (result.winner === "enhanced") enhancedWins++;
    else if (result.winner === "baseline") baselineWins++;
    else ties++;
  }

  // Calculate average scores
  const baselineAvg = {
    correctness: averageScore(baselineScores, "correctness"),
    completeness: averageScore(baselineScores, "completeness"),
    hallucination: averageScore(baselineScores, "hallucination"),
    comprehensibility: averageScore(baselineScores, "comprehensibility"),
  };

  const enhancedAvg = {
    correctness: averageScore(enhancedScores, "correctness"),
    completeness: averageScore(enhancedScores, "completeness"),
    hallucination: averageScore(enhancedScores, "hallucination"),
    comprehensibility: averageScore(enhancedScores, "comprehensibility"),
    contextUsage:
      enhancedScores.length > 0
        ? enhancedScores.reduce((acc, s) => acc + (s.contextUsage?.score ?? 0), 0) /
          enhancedScores.length
        : 0,
  };

  // Calculate deltas (positive = enhanced is better)
  const deltas = {
    correctness: enhancedAvg.correctness - baselineAvg.correctness,
    completeness: enhancedAvg.completeness - baselineAvg.completeness,
    hallucination: enhancedAvg.hallucination - baselineAvg.hallucination,
    comprehensibility: enhancedAvg.comprehensibility - baselineAvg.comprehensibility,
  };

  return {
    totalQuestions: run.pairwiseResults.length,
    enhancedWins,
    baselineWins,
    ties,
    averageScores: {
      baseline: baselineAvg,
      enhanced: enhancedAvg,
    },
    deltas,
  };
}

/**
 * Calculate win rate for enhanced mode
 */
export function calculateWinRate(summary: RunSummary): number {
  const total = summary.enhancedWins + summary.baselineWins + summary.ties;
  if (total === 0) return 0;
  return summary.enhancedWins / total;
}

/**
 * Calculate overall improvement score (average delta)
 */
export function calculateImprovementScore(summary: RunSummary): number {
  const { deltas } = summary;
  return (
    (deltas.correctness + deltas.completeness + deltas.hallucination + deltas.comprehensibility) / 4
  );
}

/**
 * Get dimension with highest improvement
 */
export function getBestImprovement(summary: RunSummary): {
  dimension: keyof typeof summary.deltas;
  delta: number;
} {
  const { deltas } = summary;
  const entries = Object.entries(deltas) as [keyof typeof deltas, number][];
  const best = entries.reduce(
    (max, [dim, val]) => (val > max.delta ? { dimension: dim, delta: val } : max),
    { dimension: "correctness" as keyof typeof deltas, delta: Number.NEGATIVE_INFINITY }
  );
  return best;
}

/**
 * Get dimension with lowest improvement
 */
export function getWorstImprovement(summary: RunSummary): {
  dimension: keyof typeof summary.deltas;
  delta: number;
} {
  const { deltas } = summary;
  const entries = Object.entries(deltas) as [keyof typeof deltas, number][];
  const worst = entries.reduce(
    (min, [dim, val]) => (val < min.delta ? { dimension: dim, delta: val } : min),
    { dimension: "correctness" as keyof typeof deltas, delta: Number.POSITIVE_INFINITY }
  );
  return worst;
}

/**
 * Calculate per-question dimension analysis
 */
export function analyzeByQuestion(
  pointwiseScores: PointwiseScore[],
  pairwiseResults: PairwiseResult[]
): Map<
  string,
  {
    baselineScore?: PointwiseScore;
    enhancedScore?: PointwiseScore;
    pairwise?: PairwiseResult;
    deltaSum: number;
  }
> {
  const analysis = new Map<
    string,
    {
      baselineScore?: PointwiseScore;
      enhancedScore?: PointwiseScore;
      pairwise?: PairwiseResult;
      deltaSum: number;
    }
  >();

  // Group pointwise scores
  for (const score of pointwiseScores) {
    const entry = analysis.get(score.questionId) ?? { deltaSum: 0 };
    if (score.mode === "baseline") {
      entry.baselineScore = score;
    } else {
      entry.enhancedScore = score;
    }
    analysis.set(score.questionId, entry);
  }

  // Add pairwise results
  for (const result of pairwiseResults) {
    const entry = analysis.get(result.questionId) ?? { deltaSum: 0 };
    entry.pairwise = result;
    analysis.set(result.questionId, entry);
  }

  // Calculate delta sums
  for (const [questionId, entry] of analysis) {
    if (entry.baselineScore && entry.enhancedScore) {
      const baseline = entry.baselineScore.dimensions;
      const enhanced = entry.enhancedScore.dimensions;
      entry.deltaSum =
        enhanced.correctness -
        baseline.correctness +
        (enhanced.completeness - baseline.completeness) +
        (enhanced.hallucination - baseline.hallucination) +
        (enhanced.comprehensibility - baseline.comprehensibility);
    }
    analysis.set(questionId, entry);
  }

  return analysis;
}

/**
 * Get questions where enhanced significantly outperformed baseline
 */
export function getTopImprovements(
  analysis: ReturnType<typeof analyzeByQuestion>,
  limit = 5
): string[] {
  return Array.from(analysis.entries())
    .sort((a, b) => b[1].deltaSum - a[1].deltaSum)
    .slice(0, limit)
    .map(([id]) => id);
}

/**
 * Get questions where enhanced performed worse than baseline
 */
export function getRegressions(analysis: ReturnType<typeof analyzeByQuestion>): string[] {
  return Array.from(analysis.entries())
    .filter(([_, entry]) => entry.deltaSum < 0)
    .map(([id]) => id);
}
