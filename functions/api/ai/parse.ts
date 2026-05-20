import { Env, ApiResponse, CVStructuredData } from '../../utils/types';
import { requireAuth } from '../../middleware/auth';
import { withCors, handleCorsPrelight } from '../../middleware/cors';
import { getFile } from '../../utils/r2';
import { getCv, saveCvData, updateCvStatus } from '../../utils/db';
import OpenAI from 'openai';

// Text extraction functions (from original cvProcessing.ts)
async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  // Note: pdfjs-dist requires specific setup. For Cloudflare Workers,
  // you may need to use a different approach or library.
  // This is a placeholder - adapt based on your needs
  const text = new TextDecoder().decode(buffer);
  return text;
}

async function extractTextFromDocx(buffer: ArrayBuffer): Promise<string> {
  // Note: mammoth also needs adaptation for Cloudflare Workers
  // This is a placeholder
  const text = new TextDecoder().decode(buffer);
  return text;
}

async function extractTextFromFile(
  buffer: ArrayBuffer,
  fileType: string
): Promise<string> {
  if (fileType === 'pdf') {
    return await extractTextFromPdf(buffer);
  } else if (fileType === 'docx' || fileType === 'doc') {
    return await extractTextFromDocx(buffer);
  } else {
    return new TextDecoder().decode(buffer);
  }
}

// OpenAI parsing (SAME as original - NO CHANGES)
async function parseCvWithAI(
  rawText: string,
  openai: OpenAI
): Promise<CVStructuredData> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    messages: [
      {
        role: 'system',
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
        role: 'user',
        content: `Parse this CV:\n\n${rawText.slice(0, 8000)}`,
      },
    ],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content ?? '{}';
  try {
    return JSON.parse(content) as CVStructuredData;
  } catch {
    return {};
  }
}

// POST /api/ai/parse
export async function onRequest(context: any): Promise<Response> {
  const { request, env } = context;

  // Handle CORS
  const preflightResponse = handleCorsPrelight(request);
  if (preflightResponse) {
    return preflightResponse;
  }

  // Check method
  if (request.method !== 'POST') {
    return withCors(
      new Response(
        JSON.stringify({ error: 'Method not allowed' } as ApiResponse),
        { status: 405, headers: { 'Content-Type': 'application/json' } }
      ),
      request.headers.get('Origin') || undefined
    );
  }

  try {
    // Authenticate
    const auth = await requireAuth(request, env);
    if (!auth?.isAuthenticated) {
      return withCors(
        new Response(
          JSON.stringify({ error: 'Unauthorized' } as ApiResponse),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        ),
        request.headers.get('Origin') || undefined
      );
    }

    // Parse request body
    const body = await request.json() as {
      cvId: string;
      storageKey: string;
      fileType: string;
    };

    const { cvId, storageKey, fileType } = body;

    if (!cvId || !storageKey) {
      return withCors(
        new Response(
          JSON.stringify({ error: 'Missing required fields' } as ApiResponse),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        ),
        request.headers.get('Origin') || undefined
      );
    }

    // Get CV record
    const cv = await getCv(env, cvId);
    if (!cv) {
      return withCors(
        new Response(
          JSON.stringify({ error: 'CV not found' } as ApiResponse),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        ),
        request.headers.get('Origin') || undefined
      );
    }

    // Check authorization
    if (cv.uploadedBy !== auth.userId) {
      return withCors(
        new Response(
          JSON.stringify({ error: 'Forbidden' } as ApiResponse),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        ),
        request.headers.get('Origin') || undefined
      );
    }

    // Update status to processing
    await updateCvStatus(env, cvId, 'processing');

    try {
      // Get file from R2
      const fileBuffer = await getFile(env, storageKey);
      if (!fileBuffer) {
        throw new Error('Could not retrieve file');
      }

      // Extract text
      const rawText = await extractTextFromFile(fileBuffer, fileType);

      if (!rawText || rawText.trim().length < 50) {
        throw new Error('Could not extract sufficient text from file');
      }

      // Parse with OpenAI (SAME ENDPOINT - NO CHANGES)
      const openai = new OpenAI({
        apiKey: env.OPENAI_API_KEY,
      });

      const structured = await parseCvWithAI(rawText, openai);

      // Save parsed data
      await saveCvData(env, cvId, structured);

      return withCors(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              cvId,
              structured,
            },
          } as ApiResponse),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        ),
        request.headers.get('Origin') || undefined
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Processing failed';
      const isInsufficientBalance =
        message.includes('403') ||
        message.toLowerCase().includes('insufficient') ||
        message.toLowerCase().includes('balance');

      await updateCvStatus(
        env,
        cvId,
        isInsufficientBalance ? 'paused' : 'error',
        isInsufficientBalance
          ? 'Paused: insufficient AI credits. Top up your balance then retry.'
          : message
      );

      return withCors(
        new Response(
          JSON.stringify({
            error: 'Processing failed',
            message,
          } as ApiResponse),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        ),
        request.headers.get('Origin') || undefined
      );
    }
  } catch (error) {
    console.error('Parse error:', error);

    return withCors(
      new Response(
        JSON.stringify({
          error: 'Parse failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        } as ApiResponse),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      ),
      request.headers.get('Origin') || undefined
    );
  }
}
