import { Env, AuthContext, User } from '../utils/types';
import { getUser } from '../utils/db';

// Mock JWT verification (replace with real JWT library in production)
export async function verifyToken(token: string): Promise<{ userId: string } | null> {
  // For now, this is a mock. In production, use a JWT library
  // Example: const { jwtVerify } = await import('jose');
  
  if (!token || token.length < 10) {
    return null;
  }
  
  try {
    // Simple base64 decode of payload (NOT secure - for demo only)
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const decoded = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    );
    
    return { userId: decoded.sub };
  } catch {
    return null;
  }
}

// Extract token from request
export function getTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader) return null;
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }
  
  return parts[1];
}

// Middleware: Require authentication
export async function requireAuth(
  request: Request,
  env: Env
): Promise<AuthContext | null> {
  const token = getTokenFromRequest(request);
  
  if (!token) {
    return null;
  }
  
  const verified = await verifyToken(token);
  
  if (!verified) {
    return null;
  }
  
  const user = await getUser(env, verified.userId);
  
  if (!user) {
    return null;
  }
  
  return {
    userId: verified.userId,
    user,
    isAuthenticated: true,
  };
}

// Middleware: Require specific role
export function requireRole(allowedRoles: string[]) {
  return (auth: AuthContext | null) => {
    if (!auth?.user) {
      return false;
    }
    
    return allowedRoles.includes(auth.user.role);
  };
}

// Helper: Create a simple token (for testing)
export function createToken(userId: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    sub: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
  }));
  const signature = btoa('mock-signature');
  
  return `${header}.${payload}.${signature}`;
}
