/**
 * Auth Middleware untuk Cloudflare Workers
 */

export async function AuthMiddleware(request: Request, env: any): Promise<Response | undefined> {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response('Unauthorized - No token', { status: 401 });
  }

  const token = authHeader.replace('Bearer ', '');

  // Verify token from KV
  const session = await env.SESSIONS.get(`session:${token}`);
  
  if (!session) {
    return new Response('Unauthorized - Invalid token', { status: 401 });
  }

  // Attach user to request context (optional)
  // @ts-ignore
  request.user = JSON.parse(session);

  return undefined; // Continue to handler
}
