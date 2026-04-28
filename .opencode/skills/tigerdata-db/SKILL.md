---
name: tigerdata-db
description: PostgreSQL database queries via TigerData
license: MIT
compatibility: opencode
---

# TigerData Database (PostgreSQL)

## What It Does
Execute SQL queries against the PostgreSQL database.

## When to Use
- Query data for debugging
- Check database state
- Run migrations
- Analyze schema
- Check user data

## Connection
- Provider: cloud.tigerdata.com
- Uses TIGERDATA_API_KEY environment variable

## Available Actions
- Execute SQL queries
- List tables
- Describe schema
- Check indexes
- Query data

## Best Practices
1. Use read-only queries when possible
2. Always use parameterized queries
3. Check query performance
4. Don't modify production data without backup

## Example
```
Show me all users created this week using tigerdata
```