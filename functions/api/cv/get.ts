import { Env, ApiResponse } from '../../utils/types';
import { requireAuth } from '../../middleware/auth';
import { withCors, handleCorsPrelight } from '../../middleware/cors';
import { getCv } from '../../utils/db';

// GET /api/cv/:id
export async function onRequest(context: any): Promise<Response> {
  const { request, env, params } = context;

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

    // Get CV ID from URL
    const cvId = params?.id || new URL(request.url).pathname.split('/').pop();

    if (!cvId) {
      return withCors(
        new Response(
          JSON.stringify({ error: 'CV ID required' } as ApiResponse),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        ),
        request.headers.get('Origin') || undefined
      );
    }

    // Get CV
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
    if (cv.uploadedBy !== auth.userId && auth.user?.role !== 'admin') {
      return withCors(
        new Response(
          JSON.stringify({ error: 'Forbidden' } as ApiResponse),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        ),
        request.headers.get('Origin') || undefined
      );
    }

    return withCors(
      new Response(
        JSON.stringify({
          success: true,
          data: cv,
        } as ApiResponse),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ),
      request.headers.get('Origin') || undefined
    );
  } catch (error) {
    console.error('Get CV error:', error);

    return withCors(
      new Response(
        JSON.stringify({
          error: 'Failed to get CV',
          message: error instanceof Error ? error.message : 'Unknown error',
        } as ApiResponse),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      ),
      request.headers.get('Origin') || undefined
    );
  }
}
