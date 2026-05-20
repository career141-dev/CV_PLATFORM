import { Env, ApiResponse } from '../../utils/types';
import { requireAuth } from '../../middleware/auth';
import { withCors, handleCorsPrelight } from '../../middleware/cors';
import { saveCv } from '../../utils/db';
import { uploadFile, generateStorageKey, calculateFileHash } from '../../utils/r2';

// POST /api/cv/upload
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
    
    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return withCors(
        new Response(
          JSON.stringify({ error: 'No file provided' } as ApiResponse),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        ),
        request.headers.get('Origin') || undefined
      );
    }
    
    // Validate file type
    const fileType = getFileType(file.name);
    if (!['pdf', 'docx', 'txt'].includes(fileType)) {
      return withCors(
        new Response(
          JSON.stringify({ error: 'Invalid file type' } as ApiResponse),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        ),
        request.headers.get('Origin') || undefined
      );
    }
    
    // Read file
    const fileBuffer = await file.arrayBuffer();
    const fileSize = fileBuffer.byteLength;
    
    // Validate file size (max 10MB)
    if (fileSize > 10 * 1024 * 1024) {
      return withCors(
        new Response(
          JSON.stringify({ error: 'File too large' } as ApiResponse),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        ),
        request.headers.get('Origin') || undefined
      );
    }
    
    // Generate storage key and hash
    const storageKey = generateStorageKey(file.name, auth.userId || '');
    const fileHash = await calculateFileHash(fileBuffer);
    
    // Upload to R2
    await uploadFile(env, storageKey, fileBuffer, file.type);
    
    // Save CV record to D1
    const cvId = await saveCv(env, {
      uploadedBy: auth.userId,
      fileName: file.name,
      fileType: fileType as any,
      fileSize,
      storageKey,
      fileHash,
      status: 'uploading',
    });
    
    // Return response
    return withCors(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            cvId,
            storageKey,
            fileName: file.name,
            fileType,
            fileSize,
          },
        } as ApiResponse),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ),
      request.headers.get('Origin') || undefined
    );
  } catch (error) {
    console.error('Upload error:', error);
    
    return withCors(
      new Response(
        JSON.stringify({
          error: 'Upload failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        } as ApiResponse),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      ),
      request.headers.get('Origin') || undefined
    );
  }
}

// Helper: Get file type from filename
function getFileType(fileName: string): string {
  const name = fileName.toLowerCase();
  if (name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.docx') || name.endsWith('.doc')) return 'docx';
  return 'txt';
}
