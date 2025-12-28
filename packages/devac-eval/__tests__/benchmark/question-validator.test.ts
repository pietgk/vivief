import { describe, expect, it } from "vitest";
import { validateBenchmark, validateQuestion } from "../../src/benchmark/question-validator.js";
import type { BenchmarkSet, EvalQuestion } from "../../src/types.js";

describe("question-validator", () => {
  describe("validateQuestion", () => {
    it("should validate a correct question", () => {
      const question: EvalQuestion = {
        id: "test-001",
        title: "Test Question",
        question: "This is a test question about the codebase?",
        category: "architecture",
        difficulty: "medium",
        expectedCoverage: ["topic1", "topic2"],
        groundTruth: [
          {
            fact: "This is a known fact",
            importance: "critical",
            evidence: [{ filePath: "src/test.ts" }],
          },
        ],
        relevantTools: ["find_symbol"],
        tags: ["test"],
      };

      const result = validateQuestion(question);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject question with invalid ID", () => {
      const question = {
        id: "invalid id with spaces",
        title: "Test Question",
        question: "This is a test question?",
        category: "architecture",
        difficulty: "medium",
        expectedCoverage: ["topic1"],
        groundTruth: [
          {
            fact: "Fact",
            importance: "critical",
            evidence: [{ filePath: "src/test.ts" }],
          },
        ],
        tags: [],
      };

      const result = validateQuestion(question);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should reject question with missing fields", () => {
      const question = {
        id: "test-001",
        // Missing required fields
      };

      const result = validateQuestion(question);
      expect(result.valid).toBe(false);
    });

    it("should generate warnings for incomplete questions", () => {
      const question: EvalQuestion = {
        id: "test-001",
        title: "Test Question",
        question: "This is a test question about the codebase?",
        category: "architecture",
        difficulty: "medium",
        expectedCoverage: ["topic1"], // Only one topic
        groundTruth: [
          {
            fact: "This is a fact",
            importance: "important", // No critical facts
            evidence: [{ filePath: "src/test.ts" }],
          },
        ],
        // No relevantTools
        tags: ["test"],
      };

      const result = validateQuestion(question);
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe("validateBenchmark", () => {
    it("should validate a correct benchmark", () => {
      const benchmark: BenchmarkSet = {
        id: "test-benchmark",
        name: "Test Benchmark",
        description: "A benchmark for testing the validator",
        targetRepo: "test-repo",
        questions: [
          {
            id: "test-001",
            title: "Test Question 1",
            question: "Question one about architecture?",
            category: "architecture",
            difficulty: "easy",
            expectedCoverage: ["topic1", "topic2"],
            groundTruth: [
              {
                fact: "Fact 1",
                importance: "critical",
                evidence: [{ filePath: "src/a.ts" }],
              },
            ],
            tags: [],
          },
          {
            id: "test-002",
            title: "Test Question 2",
            question: "Question two about data flow?",
            category: "data-flow",
            difficulty: "medium",
            expectedCoverage: ["topic3", "topic4"],
            groundTruth: [
              {
                fact: "Fact 2",
                importance: "critical",
                evidence: [{ filePath: "src/b.ts" }],
              },
            ],
            tags: [],
          },
          {
            id: "test-003",
            title: "Test Question 3",
            question: "Question three about implementation?",
            category: "implementation",
            difficulty: "hard",
            expectedCoverage: ["topic5", "topic6"],
            groundTruth: [
              {
                fact: "Fact 3",
                importance: "critical",
                evidence: [{ filePath: "src/c.ts" }],
              },
            ],
            tags: [],
          },
        ],
        metadata: {
          version: "1.0.0",
          createdAt: "2025-12-28",
          updatedAt: "2025-12-28",
        },
      };

      const result = validateBenchmark(benchmark);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject benchmark with duplicate question IDs", () => {
      const benchmark = {
        id: "test-benchmark",
        name: "Test Benchmark",
        description: "A benchmark with duplicate IDs",
        targetRepo: "test-repo",
        questions: [
          {
            id: "test-001",
            title: "Question 1",
            question: "Question one?",
            category: "architecture",
            difficulty: "easy",
            expectedCoverage: ["topic1"],
            groundTruth: [
              { fact: "Fact", importance: "critical", evidence: [{ filePath: "a.ts" }] },
            ],
            tags: [],
          },
          {
            id: "test-001", // Duplicate!
            title: "Question 2",
            question: "Question two?",
            category: "data-flow",
            difficulty: "medium",
            expectedCoverage: ["topic2"],
            groundTruth: [
              { fact: "Fact", importance: "critical", evidence: [{ filePath: "b.ts" }] },
            ],
            tags: [],
          },
        ],
        metadata: {
          version: "1.0.0",
          createdAt: "2025-12-28",
          updatedAt: "2025-12-28",
        },
      };

      const result = validateBenchmark(benchmark);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "DUPLICATE_ID")).toBe(true);
    });
  });
});
