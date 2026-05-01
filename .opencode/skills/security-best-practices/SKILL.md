---
name: security-best-practices
description: Security patterns and practices
license: MIT
compatibility: opencode
---

# Security Best Practices

## Authentication
- All /api/admin/* routes MUST check session
- Use NextAuth for authentication
- Validate all inputs with Zod

## Secrets
- NEVER commit API keys, tokens, credentials
- Use environment variables
- Add sensitive files to .gitignore

## Input Validation
- Always validate with Zod
- Sanitize user input
- Prevent SQL injection (use Prisma)

## API Security
- Validate VPS_WEBHOOK_SECRET for webhooks
- Rate limiting where appropriate
- CORS configured properly

## Storage Credentials
- Cloudinary/R2 credentials from StorageAccount table
- NOT from .env