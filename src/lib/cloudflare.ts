/**
 * Cloudflare Workers Integration for CV Platform
 * This module provides utilities for deploying and managing Cloudflare Workers
 */

export interface CloudflareWorkerEnv {
  ANTHROPIC_API_KEY: string;
  CONVEX_DEPLOYMENT: string;
  ENVIRONMENT: "development" | "production";
}

/**
 * Process CV via Cloudflare Worker
 * This would be deployed as a Cloudflare Worker for edge processing
 */
export async function processCVEdge(
  cvText: string,
  env: CloudflareWorkerEnv
): Promise<{
  candidateName: string;
  email?: string;
  skills: string[];
  summary: string;
}> {
  // This would typically call the Anthropic API from the edge
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `Parse this CV and extract key information: ${cvText}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Cloudflare Worker handler for CV processing
 * Usage: Deploy to Cloudflare Workers
 */
export async function handleCVProcessingRequest(
  request: Request,
  env: CloudflareWorkerEnv
): Promise<Response> {
  // CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  try {
    const { action, payload } = (await request.json()) as {
      action: string;
      payload: Record<string, unknown>;
    };

    let result;

    switch (action) {
      case "process-cv":
        result = await processCVEdge(payload.cvText as string, env);
        break;

      case "health-check":
        result = { status: "ok", timestamp: new Date().toISOString() };
        break;

      default:
        return new Response(
          JSON.stringify({ error: "Unknown action" }),
          { status: 400, headers }
        );
    }

    return new Response(JSON.stringify(result), { status: 200, headers });
  } catch (error) {
    console.error("Worker error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal error",
      }),
      { status: 500, headers }
    );
  }
}

/**
 * Cloudflare Worker code to be deployed
 * Save this as src/workers/cv-processor.ts
 */
export const cloudflareWorkerCode = `
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Process CV endpoint
    if (url.pathname === '/api/process-cv' && request.method === 'POST') {
      const { cvText } = await request.json();

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 2048,
          messages: [
            {
              role: 'user',
              content: \`Extract CV information from: \${cvText}\`,
            },
          ],
        }),
      });

      const data = await response.json();

      return new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};
`;
