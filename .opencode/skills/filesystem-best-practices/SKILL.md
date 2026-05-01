---
name: filesystem-best-practices
description: Safe file operations using filesystem MCP
license: MIT
compatibility: opencode
---

# Filesystem Best Practices

## What It Does
Provides safe file read/write/search within project scope.

## Allowed Directory
- `/home/ubuntu/hafiportrait-saas`

## Available Actions
- Read files
- Write new files
- Edit existing files
- Search by pattern
- List directories
- Move/rename files
- Delete files

## Best Practices
1. Always use project-relative paths
2. Check file exists before operations
3. Use glob patterns for batch operations
4. Backup before destructive operations

## Example Usage
```
Read the package.json file
Search for all TypeScript files in src/
Write a new component file