import { Env } from './utils/types';
import { handleCorsPrelight, withCors } from './middleware/cors';

// Import all API route handlers
import * as uploadHandler from './api/cv/upload';
import * as getHandler from './api/cv/get';
import * as listHandler from './api/cv/list';
import * as parseHandler from './api/ai/parse';
import * as searchHandler from './api/cv/search';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS
    const corsPreflightResponse = handleCorsPrelight(request);
    if (corsPreflightResponse) {
      return corsPreflightResponse;
    }

    // Route to appropriate handler
    if (path.match(/^\/api\/cv\/upload\/?$/)) {
      return withCors(
        await uploadHandler.onRequest({
          request,
          env,
          params: {},
        }),
        request.headers.get('Origin') || undefined
      );
    }

    if (path.match(/^\/api\/cv\/list\/?$/)) {
      return withCors(
        await listHandler.onRequest({
          request,
          env,
          params: {},
        }),
        request.headers.get('Origin') || undefined
      );
    }

    if (path.match(/^\/api\/cv\/([^\/]+)\/?$/)) {
      const match = path.match(/^\/api\/cv\/([^\/]+)\/?$/);
      const cvId = match?.[1];
      return withCors(
        await getHandler.onRequest({
          request,
          env,
          params: { id: cvId },
        }),
        request.headers.get('Origin') || undefined
      );
    }

    if (path.match(/^\/api\/ai\/parse\/?$/)) {
      return withCors(
        await parseHandler.onRequest({
          request,
          env,
          params: {},
        }),
        request.headers.get('Origin') || undefined
      );
    }

    if (path.match(/^\/api\/cv\/search\/?$/)) {
      return withCors(
        await searchHandler.onRequest({
          request,
          env,
        }),
        request.headers.get('Origin') || undefined
      );
    }

    // 404 response
    return withCors(
      new Response(
        JSON.stringify({
          error: 'Not found',
          path,
          message: `Route ${path} not found`,
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      ),
      request.headers.get('Origin') || undefined
    );
  },
} as ExportedHandler<Env>;
