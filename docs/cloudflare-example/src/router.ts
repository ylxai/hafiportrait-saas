/**
 * Simple Router untuk Cloudflare Workers
 */

export class Router {
  private routes: Array<{
    method: string;
    pattern: string;
    handler: Function;
    middleware?: Function[];
  }> = [];

  get(pattern: string, handler: Function, middleware?: Function[]) {
    this.routes.push({ method: 'GET', pattern, handler, middleware });
    return this;
  }

  post(pattern: string, handler: Function, middleware?: Function[]) {
    this.routes.push({ method: 'POST', pattern, handler, middleware });
    return this;
  }

  put(pattern: string, handler: Function, middleware?: Function[]) {
    this.routes.push({ method: 'PUT', pattern, handler, middleware });
    return this;
  }

  delete(pattern: string, handler: Function, middleware?: Function[]) {
    this.routes.push({ method: 'DELETE', pattern, handler, middleware });
    return this;
  }

  async handle(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    const pathname = url.pathname;

    // Find matching route
    for (const route of this.routes) {
      if (route.method !== method) continue;

      const match = this.matchPattern(route.pattern, pathname);
      if (match) {
        // Run middleware
        if (route.middleware) {
          for (const mw of route.middleware) {
            const result = await mw(request, env);
            if (result instanceof Response) {
              return result; // Middleware returned error response
            }
          }
        }

        // Run handler
        return await route.handler(request, env, match.params);
      }
    }

    return new Response('Not found', { status: 404 });
  }

  private matchPattern(pattern: string, pathname: string): { params: Record<string, string> } | null {
    // Convert pattern to regex
    // :id -> capture group
    // * -> wildcard
    const paramNames: string[] = [];
    let regexPattern = pattern
      .replace(/:([^/]+)/g, (match, name) => {
        paramNames.push(name);
        return '([^/]+)';
      })
      .replace(/\*/g, '.*');

    regexPattern = '^' + regexPattern + '$';
    const regex = new RegExp(regexPattern);
    const match = pathname.match(regex);

    if (!match) return null;

    const params: Record<string, string> = {};
    paramNames.forEach((name, index) => {
      params[name] = match[index + 1];
    });

    return { params };
  }
}
