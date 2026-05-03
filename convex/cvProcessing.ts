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

export const aiSearch = action({
  args: {
    query: v.string(),
    industry: v.optional(v.string()),
    seniority: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ cvId: string; score: number; reason: string }[]> => {
    // First expand/interpret the query with AI
    const interpretResponse = await openai.chat.completions.create({
      model: "openai/gpt-5-mini",
      messages: [
        {
          role: "system",
          content: `You are a CV search assistant. Convert the user's natural language search query into key search terms for finding matching CVs.
Return JSON: { "keywords": ["term1","term2",...], "searchText": "optimized search string", "industry": "industry filter or null", "seniority": "seniority filter or null", "minYears": number or null }`,
        },
        { role: "user", content: args.query },
      ],
      response_format: { type: "json_object" },
    });

    let searchTerms: { searchText: string; industry?: string; seniority?: string } = {
      searchText: args.query,
    };
    try {
      const parsed = JSON.parse(interpretResponse.choices[0]?.message?.content ?? "{}") as {
        searchText?: string;
        industry?: string;
        seniority?: string;
      };
      searchTerms = {
        searchText: parsed.searchText ?? args.query,
        industry: args.industry ?? parsed.industry,
        seniority: args.seniority ?? parsed.seniority,
      };
    } catch {
      // use original query
    }

    // Run search
    const results = await ctx.runQuery(api.cvs.searchCvs, {
      query: searchTerms.searchText,
      industry: searchTerms.industry,
      seniority: searchTerms.seniority,
      limit: args.limit ?? 20,
    });

    return results.map((cv) => ({
      cvId: cv._id,
      score: 1.0,
      reason: cv.summary ?? "",
    }));
  },
});
