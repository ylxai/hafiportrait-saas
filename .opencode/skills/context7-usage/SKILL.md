---
name: context7-usage
description: How to use Context7 MCP for real-time documentation lookup
license: MIT
compatibility: opencode
---

# Context7 MCP - Documentation Lookup

## What It Does
Provides real-time documentation for libraries and frameworks, eliminating hallucinations.

## When to Use
- Looking up Next.js API references
- Checking Tailwind CSS classes
- Finding Prisma schema patterns
- Any framework/library documentation

## How to Use
Add "use context7" to your prompt:

```
How do I implement SSR in Next.js 15? use context7
```

Or search specifically:

```
Show me the latest Tailwind v4 animation classes. use context7
```

## Available Documentation
- Next.js
- React
- Tailwind CSS
- Prisma
- TypeScript
- And many more...

## Tips
- Be specific with your query
- Use framework version if known (e.g., "Next.js 15")
- Combine with code search for best results