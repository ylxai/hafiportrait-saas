#!/bin/bash

# Cross-platform test database reset script
set -e

# Check if TEST_DATABASE_URL is set
if [ -z "$TEST_DATABASE_URL" ]; then
  echo "❌ Error: TEST_DATABASE_URL environment variable is not set"
  exit 1
fi

echo "🔄 Resetting test database..."

# Drop all tables and re-run migrations
echo "🗑️  Dropping all tables..."
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate reset --force --skip-generate

# Re-seed data
echo "🌱 Re-seeding database..."
DATABASE_URL="$TEST_DATABASE_URL" npx tsx prisma/seed.ts

echo "✅ Test database reset complete!"
