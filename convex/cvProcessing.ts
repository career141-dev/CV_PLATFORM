"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://ai-gateway.hercules.app/v1",
  apiKey: process.env.HERCULES_API_KEY,
});

async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  // pdf-parse v2 ESM — call the module directly
  type PdfParseFn = (buf: Buffer) => Promise<{ text: string }>;
  const mod = await import("pdf-parse") as unknown as { default?: PdfParseFn } & PdfParseFn;
  const pdfParse: PdfParseFn = mod.default ?? (mod as unknown as PdfParseFn);
  const data = await pdfParse(Buffer.from(buffer));
  return data.text;
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
      await ctx.runMutation(api.cvs.updateCvStatus, {
        cvId: args.cvId,
        status: "error",
        errorMessage: message,
      });
    }
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
    // Step 1: AI interprets the query
    const interpretResponse = await openai.chat.completions.create({
      model: "openai/gpt-5-mini",
      messages: [
        {
          role: "system",
          content: `You are a talent search assistant. Interpret the user's natural language search query for CV/resume matching.
Return JSON with these fields:
{
  "searchText": "optimized search string combining key skills, titles, industries",
  "industry": "one of: Technology, Finance, Healthcare, FMCG, Retail, Manufacturing, Energy, Education, Consulting, Marketing, Legal, Real Estate, Hospitality, Media, Logistics — or null",
  "seniority": "one of: junior, mid, senior, lead, executive — or null",
  "minYears": number or null,
  "interpretation": "one sentence describing what you are searching for e.g. 'Searching for senior FMCG professionals with supply chain experience and 5+ years'",
  "keywords": ["key1", "key2", "key3"]
}`,
        },
        { role: "user", content: args.query },
      ],
      response_format: { type: "json_object" },
    });

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

    // Step 2: Run the text search
    const rawResults = await ctx.runQuery(api.cvs.searchCvs, {
      query: interp.searchText,
      industry: interp.industry,
      seniority: interp.seniority,
      limit: (args.limit ?? 20) * 2, // fetch extra to allow re-ranking
    });

    if (rawResults.length === 0) {
      return { interpretation: interp, results: [] };
    }

    // Step 3: AI re-ranks results and provides per-candidate relevance reasons
    const candidateSummaries = rawResults.slice(0, 30).map((cv, i) => ({
      index: i,
      name: cv.candidateName ?? cv.fileName,
      title: cv.currentTitle ?? "",
      industry: cv.industry ?? "",
      seniority: cv.seniority ?? "",
      years: cv.yearsOfExperience ?? null,
      location: cv.location ?? "",
      skills: (cv.skills ?? []).slice(0, 10).join(", "),
      summary: cv.summary ?? "",
    }));

    const rankResponse = await openai.chat.completions.create({
      model: "openai/gpt-5-mini",
      messages: [
        {
          role: "system",
          content: `You are a talent matching expert. Given a search query and a list of candidates, rank the most relevant ones and provide a short reason why each matches.
Return JSON: { "ranked": [ { "index": number, "score": 0-100, "reason": "1 sentence why this candidate matches" }, ... ] }
Include only candidates with score > 30. Sort by score descending. Max 20 results.`,
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
