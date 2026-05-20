// CORS middleware for Cloudflare Workers

export function corsHeaders(origin?: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '3600',
  };
}

// Handle CORS preflight
export function handleCorsPrelight(request: Request): Response | null {
  if (request.method !== 'OPTIONS') {
    return null;
  }
  
  const origin = request.headers.get('Origin') || '*';
  
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}

// Wrap response with CORS headers
export function withCors(response: Response, origin?: string): Response {
  const newHeaders = new Headers(response.headers);
  
  Object.entries(corsHeaders(origin)).forEach(([key, value]) => {
    newHeaders.set(key, value);
  });
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
