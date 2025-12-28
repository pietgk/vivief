/**
 * Comparison Reporter - compares two evaluation runs
 */

import { calculateImprovementScore, calculateWinRate } from "../judge/metrics.js";
import type { EvalRun, RunSummary } from "../types.js";
import type { ReportFormat } from "./summary-reporter.js";

export interface ComparisonReporterOptions {
  format: ReportFormat;
}

export interface RunComparison {
  run1: {
    id: string;
    benchmarkId: string;
    startedAt: string;
    summary: RunSummary;
    winRate: number;
    improvementScore: number;
  };
  run2: {
    id: string;
    benchmarkId: string;
    startedAt: string;
    summary: RunSummary;
    winRate: number;
    improvementScore: number;
  };
  comparison: {
    winRateDelta: number;
    improvementDelta: number;
    dimensionDeltas: {
      correctness: number;
      completeness: number;
      hallucination: number;
      comprehensibility: number;
    };
    better: "run1" | "run2" | "tie";
    explanation: string;
  };
}

/**
 * Compare two evaluation runs
 */
export class ComparisonReporter {
  private format: ReportFormat;

  constructor(options: ComparisonReporterOptions) {
    this.format = options.format;
  }

  /**
   * Compare two runs and generate report
   */
  compare(run1: EvalRun, run2: EvalRun): string {
    if (!run1.summary || !run2.summary) {
      throw new Error("Both runs must have summaries. Judge them first.");
    }

    const comparison = this.buildComparison(run1, run2);

    switch (this.format) {
      case "markdown":
        return this.generateMarkdown(comparison);
      case "json":
        return this.generateJSON(comparison);
      case "table":
        return this.generateTable(comparison);
    }
  }

  /**
   * Build comparison data
   */
  private buildComparison(run1: EvalRun, run2: EvalRun): RunComparison {
    // Caller (compare method) validates summaries exist before calling
    const summary1 = run1.summary as NonNullable<typeof run1.summary>;
    const summary2 = run2.summary as NonNullable<typeof run2.summary>;

    const winRate1 = calculateWinRate(summary1);
    const winRate2 = calculateWinRate(summary2);
    const improvement1 = calculateImprovementScore(summary1);
    const improvement2 = calculateImprovementScore(summary2);

    const winRateDelta = winRate2 - winRate1;
    const improvementDelta = improvement2 - improvement1;

    const dimensionDeltas = {
      correctness: summary2.deltas.correctness - summary1.deltas.correctness,
      completeness: summary2.deltas.completeness - summary1.deltas.completeness,
      hallucination: summary2.deltas.hallucination - summary1.deltas.hallucination,
      comprehensibility: summary2.deltas.comprehensibility - summary1.deltas.comprehensibility,
    };

    // Determine which run is better
    let better: "run1" | "run2" | "tie";
    let explanation: string;

    if (Math.abs(winRateDelta) < 0.05 && Math.abs(improvementDelta) < 0.1) {
      better = "tie";
      explanation = "Runs are statistically similar";
    } else if (winRateDelta > 0 || (winRateDelta === 0 && improvementDelta > 0)) {
      better = "run2";
      explanation =
        winRateDelta > 0
          ? `Run 2 has ${(winRateDelta * 100).toFixed(1)}% higher win rate`
          : "Run 2 has better improvement score";
    } else {
      better = "run1";
      explanation =
        winRateDelta < 0
          ? `Run 1 has ${(-winRateDelta * 100).toFixed(1)}% higher win rate`
          : "Run 1 has better improvement score";
    }

    return {
      run1: {
        id: run1.id,
        benchmarkId: run1.benchmarkId,
        startedAt: run1.startedAt,
        summary: summary1,
        winRate: winRate1,
        improvementScore: improvement1,
      },
      run2: {
        id: run2.id,
        benchmarkId: run2.benchmarkId,
        startedAt: run2.startedAt,
        summary: summary2,
        winRate: winRate2,
        improvementScore: improvement2,
      },
      comparison: {
        winRateDelta,
        improvementDelta,
        dimensionDeltas,
        better,
        explanation,
      },
    };
  }

  /**
   * Generate markdown comparison
   */
  private generateMarkdown(c: RunComparison): string {
    return `# Run Comparison Report

## Runs Compared

| Property | Run 1 | Run 2 |
|----------|-------|-------|
| ID | ${c.run1.id.slice(0, 8)} | ${c.run2.id.slice(0, 8)} |
| Benchmark | ${c.run1.benchmarkId} | ${c.run2.benchmarkId} |
| Date | ${c.run1.startedAt.split("T")[0]} | ${c.run2.startedAt.split("T")[0]} |
| Questions | ${c.run1.summary.totalQuestions} | ${c.run2.summary.totalQuestions} |

## Overall Results

| Metric | Run 1 | Run 2 | Delta |
|--------|-------|-------|-------|
| Win Rate | ${(c.run1.winRate * 100).toFixed(1)}% | ${(c.run2.winRate * 100).toFixed(1)}% | ${this.formatDelta(c.comparison.winRateDelta * 100)}% |
| Improvement Score | ${c.run1.improvementScore.toFixed(2)} | ${c.run2.improvementScore.toFixed(2)} | ${this.formatDelta(c.comparison.improvementDelta)} |
| Enhanced Wins | ${c.run1.summary.enhancedWins} | ${c.run2.summary.enhancedWins} | ${this.formatDelta(c.run2.summary.enhancedWins - c.run1.summary.enhancedWins)} |

## Dimension Changes

How each dimension's improvement changed between runs:

| Dimension | Run 1 Delta | Run 2 Delta | Change |
|-----------|-------------|-------------|--------|
| Correctness | ${this.formatDelta(c.run1.summary.deltas.correctness)} | ${this.formatDelta(c.run2.summary.deltas.correctness)} | ${this.formatDelta(c.comparison.dimensionDeltas.correctness)} |
| Completeness | ${this.formatDelta(c.run1.summary.deltas.completeness)} | ${this.formatDelta(c.run2.summary.deltas.completeness)} | ${this.formatDelta(c.comparison.dimensionDeltas.completeness)} |
| Hallucination | ${this.formatDelta(c.run1.summary.deltas.hallucination)} | ${this.formatDelta(c.run2.summary.deltas.hallucination)} | ${this.formatDelta(c.comparison.dimensionDeltas.hallucination)} |
| Comprehensibility | ${this.formatDelta(c.run1.summary.deltas.comprehensibility)} | ${this.formatDelta(c.run2.summary.deltas.comprehensibility)} | ${this.formatDelta(c.comparison.dimensionDeltas.comprehensibility)} |

## Conclusion

**${c.comparison.better === "tie" ? "No significant difference" : `Run ${c.comparison.better === "run1" ? "1" : "2"} is better`}**

${c.comparison.explanation}

---
*Generated by DevAC Eval Framework*
`;
  }

  /**
   * Generate JSON comparison
   */
  private generateJSON(c: RunComparison): string {
    return JSON.stringify(c, null, 2);
  }

  /**
   * Generate table comparison
   */
  private generateTable(c: RunComparison): string {
    return `
Run Comparison
==============

                    Run 1       Run 2       Delta
ID                  ${c.run1.id.slice(0, 8).padEnd(12)}${c.run2.id.slice(0, 8).padEnd(12)}
Benchmark           ${c.run1.benchmarkId.slice(0, 10).padEnd(12)}${c.run2.benchmarkId.slice(0, 10).padEnd(12)}
Win Rate            ${(c.run1.winRate * 100).toFixed(1).padEnd(12)}${(c.run2.winRate * 100).toFixed(1).padEnd(12)}${this.formatDelta(c.comparison.winRateDelta * 100)}%
Improvement         ${c.run1.improvementScore.toFixed(2).padEnd(12)}${c.run2.improvementScore.toFixed(2).padEnd(12)}${this.formatDelta(c.comparison.improvementDelta)}

Conclusion: ${c.comparison.better === "tie" ? "No significant difference" : `Run ${c.comparison.better === "run1" ? "1" : "2"} is better`}
`;
  }

  /**
   * Format delta with sign
   */
  private formatDelta(delta: number): string {
    const sign = delta > 0 ? "+" : "";
    return `${sign}${delta.toFixed(2)}`;
  }
}
