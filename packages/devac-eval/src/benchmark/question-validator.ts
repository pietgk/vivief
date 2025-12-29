/**
 * Validate benchmark question schemas
 */

import { z } from "zod";
import type { BenchmarkSet, EvalQuestion } from "../types.js";

// ============================================================================
// Zod Schemas
// ============================================================================

const questionCategorySchema = z.enum([
  "architecture",
  "data-flow",
  "dependencies",
  "implementation",
  "integration",
  "debugging",
  "refactoring",
]);

const difficultySchema = z.enum(["easy", "medium", "hard"]);

const importanceSchema = z.enum(["critical", "important", "nice-to-have"]);

const groundTruthEvidenceSchema = z.object({
  filePath: z.string().min(1),
  lineStart: z.number().int().positive().optional(),
  lineEnd: z.number().int().positive().optional(),
  snippet: z.string().optional(),
});

const groundTruthItemSchema = z.object({
  fact: z.string().min(1),
  importance: importanceSchema,
  evidence: z.array(groundTruthEvidenceSchema).min(1),
});

const evalQuestionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/i, "ID must be alphanumeric with dashes"),
  title: z.string().min(3).max(100),
  question: z.string().min(10),
  category: questionCategorySchema,
  difficulty: difficultySchema,
  expectedCoverage: z.array(z.string().min(1)).min(1),
  groundTruth: z.array(groundTruthItemSchema).min(1),
  relevantTools: z.array(z.string()).optional(),
  expectedReferences: z.array(z.string()).optional(),
  tags: z.array(z.string()),
});

const benchmarkMetadataSchema = z.object({
  version: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const benchmarkSetSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/i, "ID must be alphanumeric with dashes"),
  name: z.string().min(3),
  description: z.string().min(10),
  targetRepo: z.string().min(1),
  questions: z.array(evalQuestionSchema).min(1),
  metadata: benchmarkMetadataSchema,
});

// ============================================================================
// Validation Functions
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  path: string;
  message: string;
  code: string;
}

/**
 * Validate a single question
 */
export function validateQuestion(question: unknown): ValidationResult {
  const result = evalQuestionSchema.safeParse(question);

  if (result.success) {
    const warnings = getQuestionWarnings(result.data);
    return { valid: true, errors: [], warnings };
  }

  const errors: ValidationError[] = result.error.errors.map((err) => ({
    path: err.path.join("."),
    message: err.message,
    code: err.code,
  }));

  return { valid: false, errors, warnings: [] };
}

/**
 * Validate a complete benchmark set
 */
export function validateBenchmark(benchmark: unknown): ValidationResult {
  const result = benchmarkSetSchema.safeParse(benchmark);

  if (result.success) {
    const warnings = getBenchmarkWarnings(result.data);
    const duplicateErrors = checkDuplicateIds(result.data);

    if (duplicateErrors.length > 0) {
      return { valid: false, errors: duplicateErrors, warnings };
    }

    return { valid: true, errors: [], warnings };
  }

  const errors: ValidationError[] = result.error.errors.map((err) => ({
    path: err.path.join("."),
    message: err.message,
    code: err.code,
  }));

  return { valid: false, errors, warnings: [] };
}

// ============================================================================
// Warning Generators
// ============================================================================

function getQuestionWarnings(question: EvalQuestion): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  // Check for short ground truth
  if (question.groundTruth.length < 3) {
    warnings.push({
      path: "groundTruth",
      message: "Consider adding more ground truth items for better validation",
      code: "LOW_GROUND_TRUTH",
    });
  }

  // Check for missing critical facts
  const criticalCount = question.groundTruth.filter((g) => g.importance === "critical").length;
  if (criticalCount === 0) {
    warnings.push({
      path: "groundTruth",
      message: "No critical facts defined - consider marking key facts as critical",
      code: "NO_CRITICAL_FACTS",
    });
  }

  // Check for short expected coverage
  if (question.expectedCoverage.length < 2) {
    warnings.push({
      path: "expectedCoverage",
      message: "Consider adding more expected coverage topics",
      code: "LOW_COVERAGE",
    });
  }

  // Check for missing relevant tools
  if (!question.relevantTools || question.relevantTools.length === 0) {
    warnings.push({
      path: "relevantTools",
      message: "Consider specifying which DevAC tools would help answer this question",
      code: "NO_RELEVANT_TOOLS",
    });
  }

  return warnings;
}

function getBenchmarkWarnings(benchmark: BenchmarkSet): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  // Check question count
  if (benchmark.questions.length < 5) {
    warnings.push({
      path: "questions",
      message: "Consider adding more questions for statistically meaningful results",
      code: "LOW_QUESTION_COUNT",
    });
  }

  // Check category distribution
  const categories = new Set(benchmark.questions.map((q) => q.category));
  if (categories.size < 3) {
    warnings.push({
      path: "questions",
      message: "Questions only cover a few categories - consider diversifying",
      code: "LOW_CATEGORY_DIVERSITY",
    });
  }

  // Check difficulty distribution
  const difficulties = benchmark.questions.map((q) => q.difficulty);
  const hasEasy = difficulties.includes("easy");
  const hasMedium = difficulties.includes("medium");
  const hasHard = difficulties.includes("hard");
  if (!(hasEasy && hasMedium && hasHard)) {
    warnings.push({
      path: "questions",
      message: "Questions do not cover all difficulty levels",
      code: "LOW_DIFFICULTY_DIVERSITY",
    });
  }

  // Collect warnings from individual questions
  for (let i = 0; i < benchmark.questions.length; i++) {
    const question = benchmark.questions[i];
    if (question) {
      const questionWarnings = getQuestionWarnings(question);
      for (const w of questionWarnings) {
        warnings.push({
          ...w,
          path: `questions[${i}].${w.path}`,
        });
      }
    }
  }

  return warnings;
}

function checkDuplicateIds(benchmark: BenchmarkSet): ValidationError[] {
  const errors: ValidationError[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < benchmark.questions.length; i++) {
    const question = benchmark.questions[i];
    if (!question) continue;
    const id = question.id;
    if (seenIds.has(id)) {
      errors.push({
        path: `questions[${i}].id`,
        message: `Duplicate question ID: ${id}`,
        code: "DUPLICATE_ID",
      });
    }
    seenIds.add(id);
  }

  return errors;
}

// ============================================================================
// Schema Exports (for external use)
// ============================================================================

export const schemas = {
  question: evalQuestionSchema,
  benchmark: benchmarkSetSchema,
  groundTruth: groundTruthItemSchema,
  evidence: groundTruthEvidenceSchema,
};
