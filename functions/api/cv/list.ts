import { Env, ApiResponse } from '../../utils/types';
import { requireAuth } from '../../middleware/auth';
import { withCors, handleCorsPrelight } from '../../middleware/cors';
import { getCvsByUser } from '../../utils/db';

// GET /api/cv/list
export async function onRequest(context: any): Promise<Response> {
  const { request, env } = context;

  // Handle CORS
  const preflightResponse = handleCorsPrelight(request);
  if (preflightResponse) {
    return preflightResponse;
  }

  // Check method
  if (request.method !== 'GET') {
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

    // Get pagination params
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Get user's CVs
    const cvs = await getCvsByUser(env, auth.userId || '', limit, offset);

    return withCors(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            cvs,
            count: cvs.length,
            limit,
            offset,
          },
        } as ApiResponse),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ),
      request.headers.get('Origin') || undefined
    );
  } catch (error) {
    console.error('List CVs error:', error);

    return withCors(
      new Response(
        JSON.stringify({
          error: 'Failed to list CVs',
          message: error instanceof Error ? error.message : 'Unknown error',
        } as ApiResponse),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      ),
      request.headers.get('Origin') || undefined
    );
  }
}
