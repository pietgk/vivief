/**
 * Scoring prompts and rubrics for LLM-as-judge evaluation
 */

import type { EvalQuestion } from "../types.js";

/**
 * Dimension scoring rubric
 */
export const DIMENSION_RUBRICS = {
  correctness: `
## Correctness (1-5)
Rate the factual accuracy of the answer based on the ground truth facts provided.

1 = Mostly incorrect, contradicts ground truth
2 = Several major factual errors
3 = Some errors but mostly accurate
4 = Minor inaccuracies only
5 = Fully correct, matches all ground truth facts`,

  completeness: `
## Completeness (1-5)
Rate how thoroughly the answer covers the expected topics.

1 = Misses most expected topics
2 = Covers only 1-2 expected topics
3 = Covers about half of expected topics
4 = Covers most expected topics well
5 = Comprehensive coverage of all topics`,

  hallucination: `
## Hallucination (1-5)
Rate the absence of fabricated or unverifiable information.

1 = Contains many fabricated claims
2 = Several claims without evidence
3 = A few unverifiable statements
4 = Minimal speculation, mostly grounded
5 = No hallucinations, all claims verifiable`,

  comprehensibility: `
## Comprehensibility (1-5)
Rate the clarity, structure, and readability of the answer.

1 = Confusing, poorly organized
2 = Hard to follow in places
3 = Reasonably clear
4 = Well-structured and clear
5 = Exceptionally clear and well-organized`,

  contextUsage: `
## Context Usage (1-5) - Enhanced mode only
Rate how effectively the answer uses information from DevAC tools.

1 = Ignores tool output entirely
2 = Superficial use of tool data
3 = Uses some tool data effectively
4 = Good integration of tool information
5 = Excellent use of tools, grounded in code`,
};

/**
 * Build the pointwise scoring prompt
 */
export function buildPointwisePrompt(
  question: EvalQuestion,
  response: string,
  isEnhanced: boolean
): string {
  const groundTruthSection = question.groundTruth
    .map(
      (gt, i) =>
        `${i + 1}. [${gt.importance.toUpperCase()}] ${gt.fact}
   Evidence: ${gt.evidence.map((e) => e.filePath).join(", ")}`
    )
    .join("\n");

  const expectedCoverageSection = question.expectedCoverage
    .map((t, i) => `${i + 1}. ${t}`)
    .join("\n");

  const dimensionPrompts = [
    DIMENSION_RUBRICS.correctness,
    DIMENSION_RUBRICS.completeness,
    DIMENSION_RUBRICS.hallucination,
    DIMENSION_RUBRICS.comprehensibility,
  ];

  if (isEnhanced) {
    dimensionPrompts.push(DIMENSION_RUBRICS.contextUsage);
  }

  return `You are evaluating an LLM's answer to a code understanding question.

## Question
${question.question}

## Expected Coverage
${expectedCoverageSection}

## Ground Truth Facts
${groundTruthSection}

## Answer to Evaluate
${response}

---

Please evaluate this answer on the following dimensions. For each, provide:
1. A score from 1-5
2. Brief reasoning for the score

${dimensionPrompts.join("\n\n")}

---

Also provide:
- **Covered Facts**: List which ground truth facts are correctly addressed
- **Missed Facts**: List which ground truth facts are missing or incorrect
- **Hallucinations**: List any claims that appear fabricated or unverifiable

Respond in JSON format:
\`\`\`json
{
  "scores": {
    "correctness": <1-5>,
    "completeness": <1-5>,
    "hallucination": <1-5>,
    "comprehensibility": <1-5>${isEnhanced ? ',\n    "contextUsage": <1-5>' : ""}
  },
  "reasoning": "<overall reasoning for scores>",
  "coveredFacts": ["fact 1", "fact 2"],
  "missedFacts": ["fact 3"],
  "hallucinations": ["hallucinated claim 1"]${
    isEnhanced ? ',\n  "contextUsageObservations": ["observation 1", "observation 2"]' : ""
  }
}
\`\`\``;
}

/**
 * Build the pairwise comparison prompt
 */
export function buildPairwisePrompt(
  question: EvalQuestion,
  baselineResponse: string,
  enhancedResponse: string
): string {
  const groundTruthSection = question.groundTruth
    .map((gt, i) => `${i + 1}. [${gt.importance.toUpperCase()}] ${gt.fact}`)
    .join("\n");

  return `You are comparing two LLM answers to the same code understanding question.

## Question
${question.question}

## Ground Truth Facts
${groundTruthSection}

## Answer A (Baseline - no code tools)
${baselineResponse}

## Answer B (Enhanced - with DevAC code analysis tools)
${enhancedResponse}

---

Compare these two answers on each dimension and determine which is better:

1. **Correctness**: Which answer is more factually accurate?
2. **Completeness**: Which answer covers more expected topics?
3. **Hallucination**: Which answer has fewer fabricated claims?
4. **Comprehensibility**: Which answer is clearer and better organized?

For each dimension, respond with:
- "A" if Answer A (Baseline) is better
- "B" if Answer B (Enhanced) is better
- "tie" if they are equally good

Then provide an overall winner based on all dimensions combined.

Respond in JSON format:
\`\`\`json
{
  "dimensions": {
    "correctness": {
      "winner": "A" | "B" | "tie",
      "explanation": "<brief explanation>"
    },
    "completeness": {
      "winner": "A" | "B" | "tie",
      "explanation": "<brief explanation>"
    },
    "hallucination": {
      "winner": "A" | "B" | "tie",
      "explanation": "<brief explanation>"
    },
    "comprehensibility": {
      "winner": "A" | "B" | "tie",
      "explanation": "<brief explanation>"
    }
  },
  "overall": {
    "winner": "A" | "B" | "tie",
    "confidence": <0.0-1.0>,
    "reasoning": "<overall reasoning>"
  }
}
\`\`\``;
}

/**
 * Parse pointwise score response
 */
export interface PointwiseParseResult {
  scores: {
    correctness: number;
    completeness: number;
    hallucination: number;
    comprehensibility: number;
    contextUsage?: number;
  };
  reasoning: string;
  coveredFacts: string[];
  missedFacts: string[];
  hallucinations: string[];
  contextUsageObservations?: string[];
}

export function parsePointwiseResponse(response: string): PointwiseParseResult {
  // Extract JSON from response
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
  if (!jsonMatch) {
    // Try parsing the whole response as JSON
    try {
      return JSON.parse(response);
    } catch {
      throw new Error("Could not extract JSON from pointwise response");
    }
  }

  const jsonContent = jsonMatch[1];
  if (!jsonContent) {
    throw new Error("Could not extract JSON content from pointwise response");
  }

  try {
    return JSON.parse(jsonContent);
  } catch (error) {
    throw new Error(`Failed to parse pointwise JSON: ${error}`);
  }
}

/**
 * Parse pairwise comparison response
 */
export interface PairwiseParseResult {
  dimensions: {
    correctness: { winner: "A" | "B" | "tie"; explanation: string };
    completeness: { winner: "A" | "B" | "tie"; explanation: string };
    hallucination: { winner: "A" | "B" | "tie"; explanation: string };
    comprehensibility: { winner: "A" | "B" | "tie"; explanation: string };
  };
  overall: {
    winner: "A" | "B" | "tie";
    confidence: number;
    reasoning: string;
  };
}

export function parsePairwiseResponse(response: string): PairwiseParseResult {
  // Extract JSON from response
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
  if (!jsonMatch) {
    try {
      return JSON.parse(response);
    } catch {
      throw new Error("Could not extract JSON from pairwise response");
    }
  }

  const jsonContent = jsonMatch[1];
  if (!jsonContent) {
    throw new Error("Could not extract JSON content from pairwise response");
  }

  try {
    return JSON.parse(jsonContent);
  } catch (error) {
    throw new Error(`Failed to parse pairwise JSON: ${error}`);
  }
}
