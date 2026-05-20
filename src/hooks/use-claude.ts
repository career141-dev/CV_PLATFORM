import { useCallback, useState } from "react";

interface CVParsingResult {
  candidateName?: string;
  email?: string;
  phone?: string;
  location?: string;
  currentTitle?: string;
  industry?: string;
  sector?: string;
  seniority?: string;
  yearsOfExperience?: number;
  skills?: string[];
  languages?: string[];
  summary?: string;
}

interface JobMatchResult {
  matchScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  reasoning: string;
}

interface InterviewQuestion {
  question: string;
  category: "experience" | "skills" | "motivation" | "technical";
  difficulty: "easy" | "medium" | "hard";
}

/**
 * Hook for processing CV with Claude AI
 * @deprecated Use /api/ai/parse endpoint instead
 */
export function useClaudeCV() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processCV = useCallback(
    async (
      cvText: string,
      cvId: string
    ): Promise<CVParsingResult | null> => {
      try {
        setLoading(true);
        setError(null);

        // Use OpenAI API via Cloudflare Workers
        const response = await fetch('/api/ai/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rawText: cvText, cvId }),
        });

        if (!response.ok) throw new Error('Failed to process CV');

        const result = await response.json();
        return result.data as CVParsingResult;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to process CV";
        setError(errorMessage);
        console.error("CV processing error:", err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { processCV, loading, error };
}

/**
 * Hook for matching CV to job description
 * @deprecated Placeholder for future implementation
 */
export function useJobMatching() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matchCVToJob = useCallback(
    async (
      cvText: string,
      jobDescription: string,
      jobId: string
    ): Promise<JobMatchResult | null> => {
      try {
        setLoading(true);
        setError(null);
        console.warn("Job matching not yet implemented");
        return null;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to match CV to job";
        setError(errorMessage);
        console.error("Job matching error:", err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { matchCVToJob, loading, error };
}

/**
 * Hook for generating interview questions
 * @deprecated Placeholder for future implementation
 */
export function useInterviewQuestions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateQuestions = useCallback(
    async (
      cvText: string,
      jobDescription: string,
      count?: number
    ): Promise<InterviewQuestion[] | null> => {
      try {
        setLoading(true);
        setError(null);
        console.warn("Interview question generation not yet implemented");
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { generateQuestions, loading, error };
}

/**
 * Combined hook for all Claude AI features
 */
export function useClaudeAI() {
  const { processCV, loading: cvLoading, error: cvError } = useClaudeCV();
  const {
    matchCVToJob,
    loading: matchLoading,
    error: matchError,
  } = useJobMatching();
  const {
    generateQuestions,
    loading: questionsLoading,
    error: questionsError,
  } = useInterviewQuestions();

  return {
    processCV,
    matchCVToJob,
    generateQuestions,
    loading:
      cvLoading ||
      matchLoading ||
      questionsLoading,
    error: cvError || matchError || questionsError,
  };
}
