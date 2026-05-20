import { Env } from './types';

// Upload file to R2
export async function uploadFile(
  env: Env,
  key: string,
  fileData: ArrayBuffer | ReadableStream<Uint8Array>,
  contentType: string
): Promise<string> {
  const object = await env.BUCKET.put(key, fileData, {
    httpMetadata: {
      contentType: contentType,
    },
  });
  
  return object.key;
}

// Get file from R2
export async function getFile(env: Env, key: string): Promise<ArrayBuffer | null> {
  const object = await env.BUCKET.get(key);
  
  if (!object) return null;
  
  return await object.arrayBuffer();
}

// Get file URL
export async function getFileUrl(env: Env, key: string): Promise<string | null> {
  const object = await env.BUCKET.get(key);
  
  if (!object) return null;
  
  // Return the R2 public URL (if bucket is public) or a signed URL
  return `https://cv-uploads.r2.io/${key}`;
}

// Delete file from R2
export async function deleteFile(env: Env, key: string): Promise<void> {
  await env.BUCKET.delete(key);
}

// Get file size
export async function getFileSize(env: Env, key: string): Promise<number | null> {
  const object = await env.BUCKET.head(key);
  
  if (!object) return null;
  
  return object.size || 0;
}

// List files in bucket
export async function listFiles(
  env: Env,
  prefix?: string,
  limit = 1000
): Promise<string[]> {
  const options: any = { limit };
  
  if (prefix) {
    options.prefix = prefix;
  }
  
  const objects = await env.BUCKET.list(options);
  
  return objects.objects.map(o => o.key);
}

// Copy file
export async function copyFile(
  env: Env,
  sourceKey: string,
  destKey: string
): Promise<void> {
  const source = await env.BUCKET.get(sourceKey);
  
  if (!source) {
    throw new Error(`Source file not found: ${sourceKey}`);
  }
  
  const buffer = await source.arrayBuffer();
  const contentType = source.httpMetadata?.contentType || 'application/octet-stream';
  
  await uploadFile(env, destKey, buffer, contentType);
}

// Generate unique storage key
export function generateStorageKey(fileName: string, userId: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  const sanitized = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  
  return `${userId}/${timestamp}-${random}/${sanitized}`;
}

// Calculate file hash (simple)
export async function calculateFileHash(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
