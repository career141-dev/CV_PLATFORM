"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { ConvexError } from "convex/values";
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://ai-gateway.hercules.app/v1",
  apiKey: process.env.HERCULES_API_KEY,
});

async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;
  const textParts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    textParts.push(pageText);
  }
  return textParts.join("\n");
}

async function extractTextFromDocx(buffer: ArrayBuffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
  return result.value;
}

async function extractTextFromFile(
  buffer: ArrayBuffer,
  fileType: string
): Promise<string> {
  if (fileType === "pdf") {
    return await extractTextFromPdf(buffer);
  } else if (fileType === "docx" || fileType === "doc") {
    return await extractTextFromDocx(buffer);
  } else {
    // Plain text
    return new TextDecoder().decode(buffer);
  }
}

type CvStructuredData = {
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
};

async function parseCvWithAI(rawText: string): Promise<CvStructuredData> {
  const response = await openai.chat.completions.create({
    model: "openai/gpt-5-mini",
    messages: [
      {
        role: "system",
        content: `You are a CV/resume parser. Extract structured information from the CV text and return JSON.
Return ONLY valid JSON with these fields (omit fields you cannot determine):
{
  "candidateName": "string",
  "email": "string",
  "phone": "string",
  "location": "city, country",
  "currentTitle": "most recent job title",
  "industry": "one of: Technology, Finance, Healthcare, FMCG, Retail, Manufacturing, Energy, Education, Consulting, Marketing, Legal, Real Estate, Hospitality, Media, Logistics, Other",
  "sector": "specific sector within industry e.g. Software, Investment Banking, Pharmaceuticals",
  "seniority": "one of: junior, mid, senior, lead, executive",
  "yearsOfExperience": number,
  "skills": ["skill1", "skill2", ...],
  "languages": ["language1", ...],
  "summary": "2-3 sentence professional summary of this candidate"
}`,
      },
      {
        role: "user",
        content: `Parse this CV:\n\n${rawText.slice(0, 8000)}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content) as CvStructuredData;
  } catch {
    return {};
  }
}

export const processCv = action({
  args: {
    cvId: v.id("cvs"),
    storageId: v.id("_storage"),
    fileType: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    // Mark as processing
    await ctx.runMutation(api.cvs.updateCvStatus, {
      cvId: args.cvId,
      status: "processing",
    });

    try {
      // Download the file from Convex storage
      const url = await ctx.storage.getUrl(args.storageId);
      if (!url) throw new Error("Could not get file URL");

      const response = await fetch(url);
      const buffer = await response.arrayBuffer();

      // Extract text
      const rawText = await extractTextFromFile(buffer, args.fileType);

      if (!rawText || rawText.trim().length < 50) {
        throw new Error("Could not extract sufficient text from file");
      }

      // Parse with AI
      const structured = await parseCvWithAI(rawText);

      // Save everything
      await ctx.runMutation(api.cvs.saveCvData, {
        cvId: args.cvId,
        rawText: rawText.slice(0, 50000), // cap at 50k chars
        candidateName: structured.candidateName,
        email: structured.email,
        phone: structured.phone,
        location: structured.location,
        currentTitle: structured.currentTitle,
        industry: structured.industry,
        sector: structured.sector,
        seniority: structured.seniority,
        yearsOfExperience: structured.yearsOfExperience,
        skills: structured.skills,
        languages: structured.languages,
        summary: structured.summary,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Processing failed";
      // Detect insufficient balance (403) — pause instead of error so user can resume later
      const isInsufficientBalance =
        message.includes("403") ||
        message.toLowerCase().includes("insufficient") ||
        message.toLowerCase().includes("balance");
      await ctx.runMutation(api.cvs.updateCvStatus, {
        cvId: args.cvId,
        status: isInsufficientBalance ? "paused" : "error",
        errorMessage: isInsufficientBalance
          ? "Paused: insufficient AI credits. Top up your balance then click Resume."
          : message,
      });
    }
  },
});

export const resumeProcessing = action({
  args: {},
  handler: async (ctx): Promise<{ resumed: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const pausedCvs = await ctx.runQuery(api.cvs.getPausedCvs, {});
    for (const cv of pausedCvs) {
      // Re-queue each paused CV for processing
      ctx.scheduler.runAfter(0, api.cvProcessing.processCv, {
        cvId: cv._id,
        storageId: cv.storageId,
        fileType: cv.fileType,
      });
    }
    return { resumed: pausedCvs.length };
  },
});

type JobRequirements = {
  title: string;
  requiredSkills: string[];
  preferredSkills: string[];
  minYearsExperience: number | null;
  industry: string | null;
  seniority: string | null;
  location: string | null;
  education: string | null;
  summary: string; // 1-sentence description of the role
};

type CandidateMatchBreakdown = {
  skills: number;       // 0-100
  experience: number;   // 0-100
  seniority: number;    // 0-100
  industry: number;     // 0-100
  location: number;     // 0-100
};

type CandidateMatch = {
  cvId: string;
  overallScore: number;
  breakdown: CandidateMatchBreakdown;
  matchedSkills: string[];
  missingSkills: string[];
  reason: string;
};

export const matchByJobDescription = action({
  args: {
    jobDescription: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    jobRequirements: JobRequirements;
    matches: CandidateMatch[];
  }> => {
    // Run JD parsing and broad candidate fetch IN PARALLEL
    // The broad fetch uses key terms extracted directly from the raw JD text
    // to avoid waiting for the parse to complete before hitting the DB
    const broadTerms = args.jobDescription
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 3 && s.length < 60)
      .slice(0, 4);

    const [parseResponse, ...broadSearches] = await Promise.all([
      // AI: parse JD into structured requirements
      openai.chat.completions.create({
        model: "openai/gpt-5-mini",
        messages: [
          {
            role: "system",
            content: `You are a job description parser. Extract structured hiring requirements from a job description.
Return ONLY valid JSON with these fields (use null if not specified):
{
  "title": "job title",
  "requiredSkills": ["skill1", "skill2", ...],
  "preferredSkills": ["skill1", ...],
  "minYearsExperience": number or null,
  "industry": "one of: Technology, Finance, Healthcare, FMCG, Retail, Manufacturing, Energy, Education, Consulting, Marketing, Legal, Real Estate, Hospitality, Media, Logistics — or null",
  "seniority": "one of: junior, mid, senior, lead, executive — or null",
  "location": "city/country or null",
  "education": "required education level or null",
  "summary": "1 sentence describing this role and ideal candidate"
}`,
          },
          { role: "user", content: args.jobDescription.slice(0, 6000) },
        ],
        response_format: { type: "json_object" },
      }),
      // DB: broad candidate fetches using raw JD terms (no waiting for parse)
      ...broadTerms.map((term) =>
        ctx.runQuery(api.cvs.searchCvs, { query: term, limit: 40 })
      ),
    ]);

    let jobReq: JobRequirements = {
      title: "Position",
      requiredSkills: [],
      preferredSkills: [],
      minYearsExperience: null,
      industry: null,
      seniority: null,
      location: null,
      education: null,
      summary: "Searching for a qualified candidate",
    };

    try {
      const parsed = JSON.parse(
        parseResponse.choices[0]?.message?.content ?? "{}"
      ) as Partial<JobRequirements>;
      jobReq = {
        title: parsed.title ?? "Position",
        requiredSkills: parsed.requiredSkills ?? [],
        preferredSkills: parsed.preferredSkills ?? [],
        minYearsExperience: parsed.minYearsExperience ?? null,
        industry: parsed.industry ?? null,
        seniority: parsed.seniority ?? null,
        location: parsed.location ?? null,
        education: parsed.education ?? null,
        summary: parsed.summary ?? "Searching for a qualified candidate",
      };
    } catch { /* keep defaults */ }

    // Merge broad results + do one targeted search now we know the parsed title/skills
    const targetedSearches = await Promise.all(
      [jobReq.title, ...jobReq.requiredSkills.slice(0, 2)]
        .filter(Boolean)
        .slice(0, 3)
        .map((term) =>
          ctx.runQuery(api.cvs.searchCvs, {
            query: term,
            industry: jobReq.industry ?? undefined,
            seniority: jobReq.seniority ?? undefined,
            limit: 40,
          })
        )
    );

    const seen = new Set<string>();
    const candidates: typeof broadSearches[0] = [];
    for (const batch of [...broadSearches, ...targetedSearches]) {
      for (const cv of batch) {
        if (!seen.has(cv._id)) {
          seen.add(cv._id);
          candidates.push(cv);
        }
      }
    }

    if (candidates.length === 0) {
      return { jobRequirements: jobReq, matches: [] };
    }

    // Compact candidate payload — summary + 300 chars of raw text (was 1000)
    // Smaller payload = faster AI response
    const candidateSummaries = candidates.slice(0, 30).map((cv, i) => ({
      index: i,
      name: cv.candidateName ?? cv.fileName,
      title: cv.currentTitle ?? "",
      industry: cv.industry ?? "",
      seniority: cv.seniority ?? "",
      years: cv.yearsOfExperience ?? null,
      location: cv.location ?? "",
      skills: (cv.skills ?? []).slice(0, 8).join(", "),
      summary: cv.summary ?? "",
      snippet: (cv.rawText ?? "").slice(0, 300),
    }));

    const scoreResponse = await openai.chat.completions.create({
      model: "openai/gpt-5-mini",
      messages: [
        {
          role: "system",
          content: `You are a talent matching expert. Score each candidate against a job description.
For each candidate return a breakdown score (0-100) across 5 dimensions, plus which required skills they have/lack.
Return JSON:
{
  "matches": [
    {
      "index": number,
      "overallScore": 0-100,
      "breakdown": {
        "skills": 0-100,
        "experience": 0-100,
        "seniority": 0-100,
        "industry": 0-100,
        "location": 0-100
      },
      "matchedSkills": ["skill1", ...],
      "missingSkills": ["skill1", ...],
      "reason": "1-2 sentence explanation of fit"
    }
  ]
}
Only include candidates with overallScore > 25. Sort by overallScore descending. Max 20 results.`,
        },
        {
          role: "user",
          content: `Job Requirements:\n${JSON.stringify(jobReq, null, 2)}\n\nCandidates:\n${JSON.stringify(candidateSummaries, null, 2)}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    type ScoreItem = {
      index: number;
      overallScore: number;
      breakdown: CandidateMatchBreakdown;
      matchedSkills: string[];
      missingSkills: string[];
      reason: string;
    };

    let scored: ScoreItem[] = [];
    try {
      const parsed = JSON.parse(
        scoreResponse.choices[0]?.message?.content ?? "{}"
      ) as { matches?: ScoreItem[] };
      scored = parsed.matches ?? [];
    } catch { /* empty */ }

    const matches: CandidateMatch[] = scored
      .filter((s) => s.index >= 0 && s.index < candidates.length)
      .slice(0, args.limit ?? 20)
      .map((s) => ({
        cvId: candidates[s.index]!._id,
        overallScore: s.overallScore,
        breakdown: s.breakdown,
        matchedSkills: s.matchedSkills ?? [],
        missingSkills: s.missingSkills ?? [],
        reason: s.reason,
      }));

    return { jobRequirements: jobReq, matches };
  },
});

type SearchInterpretation = {
  searchText: string;
  industry?: string;
  seniority?: string;
  minYears?: number;
  interpretation: string; // Human-readable explanation of what AI understood
  keywords: string[];
};

export const aiSearch = action({
  args: {
    query: v.string(),
    industry: v.optional(v.string()),
    seniority: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    interpretation: SearchInterpretation;
    results: { cvId: string; score: number; reason: string }[];
  }> => {
    const fetchLimit = (args.limit ?? 20) * 2;

    // Run AI interpretation AND the raw-query DB fetch IN PARALLEL
    // so we don't wait for AI before hitting the database
    const [interpretResponse, rawQueryResults] = await Promise.all([
      openai.chat.completions.create({
        model: "openai/gpt-5-mini",
        messages: [
          {
            role: "system",
            content: `You are a talent search assistant. Interpret the user's natural language search query for CV/resume matching.
Return JSON with these fields:
{
  "searchText": "optimized search string combining key skills, titles, industries, and any specific company names mentioned",
  "industry": "one of: Technology, Finance, Healthcare, FMCG, Retail, Manufacturing, Energy, Education, Consulting, Marketing, Legal, Real Estate, Hospitality, Media, Logistics — or null",
  "seniority": "one of: junior, mid, senior, lead, executive — or null",
  "minYears": number or null,
  "interpretation": "one sentence describing what you are searching for e.g. 'Searching for senior FMCG professionals with supply chain experience and 5+ years'",
  "keywords": ["key1", "key2", ...] — IMPORTANT: always include any specific company names, brand names, or organizations mentioned in the query as individual keywords
}`,
          },
          { role: "user", content: args.query },
        ],
        response_format: { type: "json_object" },
      }),
      // Start fetching with the original query immediately — no need to wait for AI
      ctx.runQuery(api.cvs.searchCvs, { query: args.query, limit: fetchLimit }),
    ]);

    let interp: SearchInterpretation = {
      searchText: args.query,
      interpretation: `Searching for: "${args.query}"`,
      keywords: [],
    };
    try {
      const parsed = JSON.parse(
        interpretResponse.choices[0]?.message?.content ?? "{}"
      ) as Partial<SearchInterpretation>;
      interp = {
        searchText: parsed.searchText ?? args.query,
        industry: args.industry ?? (parsed.industry ?? undefined),
        seniority: args.seniority ?? (parsed.seniority ?? undefined),
        minYears: parsed.minYears ?? undefined,
        interpretation: parsed.interpretation ?? `Searching for: "${args.query}"`,
        keywords: parsed.keywords ?? [],
      };
    } catch {
      // keep defaults
    }

    // Now fetch rewritten + keyword results (these need the parsed interp)
    const additionalResults = await Promise.all([
      interp.searchText !== args.query
        ? ctx.runQuery(api.cvs.searchCvs, {
            query: interp.searchText,
            industry: interp.industry,
            seniority: interp.seniority,
            limit: fetchLimit,
          })
        : Promise.resolve([] as typeof rawQueryResults),
      ...interp.keywords.slice(0, 3).map((kw) =>
        ctx.runQuery(api.cvs.searchCvs, { query: kw, limit: 10 })
      ),
    ]);

    // Merge and deduplicate — original query results first (already fetched)
    const seen = new Set<string>();
    const rawResults: typeof rawQueryResults = [];
    for (const cv of [rawQueryResults, ...additionalResults].flat()) {
      if (!seen.has(cv._id)) {
        seen.add(cv._id);
        rawResults.push(cv);
      }
    }

    if (rawResults.length === 0) {
      return { interpretation: interp, results: [] };
    }

    // Compact payload: summary + 300 chars snippet (was 800) = faster AI response
    const candidateSummaries = rawResults.slice(0, 30).map((cv, i) => ({
      index: i,
      name: cv.candidateName ?? cv.fileName,
      title: cv.currentTitle ?? "",
      industry: cv.industry ?? "",
      seniority: cv.seniority ?? "",
      years: cv.yearsOfExperience ?? null,
      location: cv.location ?? "",
      skills: (cv.skills ?? []).slice(0, 8).join(", "),
      summary: cv.summary ?? "",
      snippet: (cv.rawText ?? "").slice(0, 300),
    }));

    const rankResponse = await openai.chat.completions.create({
      model: "openai/gpt-5-mini",
      messages: [
        {
          role: "system",
          content: `You are a talent matching expert. Given a search query and a list of candidates, rank the most relevant ones and provide a short reason why each matches.
Return JSON: { "ranked": [ { "index": number, "score": 0-100, "reason": "1 sentence why this candidate matches" }, ... ] }
Include only candidates with score > 30. Sort by score descending. Max 20 results.
IMPORTANT: Pay close attention to specific company names mentioned in the query. If a query asks for experience at a specific company, only candidates who have worked at that company should score above 50. Also respect any minimum years of experience requirements — penalise candidates who do not meet them.`,
        },
        {
          role: "user",
          content: `Search query: "${args.query}"\n\nCandidates:\n${JSON.stringify(candidateSummaries, null, 2)}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    type RankItem = { index: number; score: number; reason: string };
    let ranked: RankItem[] = [];
    try {
      const parsed = JSON.parse(
        rankResponse.choices[0]?.message?.content ?? "{}"
      ) as { ranked?: RankItem[] };
      ranked = parsed.ranked ?? [];
    } catch {
      // fallback: return all with default score
      ranked = rawResults.map((_, i) => ({ index: i, score: 70, reason: rawResults[i]?.summary ?? "" }));
    }

    const results = ranked
      .filter((r) => r.index >= 0 && r.index < rawResults.length)
      .slice(0, args.limit ?? 20)
      .map((r) => ({
        cvId: rawResults[r.index]!._id,
        score: r.score,
        reason: r.reason,
      }));

    return { interpretation: interp, results };
  },
});
