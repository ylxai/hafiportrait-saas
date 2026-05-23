/**
 * @deprecated Use `@/lib/env.server` for server-side code or `@/lib/env.client` for client components.
 * 
 * This file is retained for backward compatibility only. It re-exports from env.server.
 * New code should import directly from the appropriate module:
 * - Server components/API routes: `import { env } from '@/lib/env.server'`
 * - Client components: `import { clientEnv } from '@/lib/env.client'`
 */
export { env } from './env.server';
