import type { Env } from "../../utils/types";
import { withCors } from "../../middleware/cors";
import { searchCvs } from "../../utils/db";

export async function onRequest(context: { request: Request; env: Env }) {
  const { request, env } = context;

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (request.method !== "POST") {
    return withCors(
      new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 }),
      request.headers.get("origin") || "*"
    );
  }

  try {
    const body = await request.json() as {
      query: string;
      industry?: string;
      seniority?: string;
      limit?: number;
    };

    const { query, industry, seniority, limit = 20 } = body;

    if (!query || !query.trim()) {
      return withCors(
        new Response(JSON.stringify({ error: "Query is required" }), { status: 400 }),
        request.headers.get("origin") || "*"
      );
    }

    // Search CVs in database
    const results = await searchCvs(env, {
      text: query,
      industry: industry || undefined,
      seniority: seniority || undefined,
    }, limit);

    // Parse interpretation from query (basic implementation)
    const interpretation = {
      searchText: query,
      industry: industry || undefined,
      seniority: seniority || undefined,
      interpretation: `Searching for candidates matching: ${query}`,
      keywords: query.split(/\s+/).filter(w => w.length > 2),
    };

    // Format results for frontend
    const formattedResults = results.map((cv: any) => ({
      cvId: cv.id,
      score: 75 + Math.random() * 25, // Placeholder scoring
      reason: `Candidate matches search criteria: ${query}`,
    }));

    const response = {
      success: true,
      data: {
        interpretation,
        results: formattedResults,
      },
    };

    return withCors(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
      request.headers.get("origin") || "*"
    );
  } catch (error) {
    console.error("Search error:", error);
    return withCors(
      new Response(
        JSON.stringify({
          error: "Search failed",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      ),
      request.headers.get("origin") || "*"
    );
  }
}
