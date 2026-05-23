#!/bin/bash

# Cross-platform test database setup script
set -e

# Check if TEST_DATABASE_URL is set
if [ -z "$TEST_DATABASE_URL" ]; then
  echo "❌ Error: TEST_DATABASE_URL environment variable is not set"
  exit 1
fi

echo "🔧 Setting up test database..."

# Run prisma db push
echo "📦 Running migrations..."
DATABASE_URL="$TEST_DATABASE_URL" npx prisma db push --skip-generate

# Run prisma db seed
echo "🌱 Seeding database..."
DATABASE_URL="$TEST_DATABASE_URL" npx tsx prisma/seed.ts

echo "✅ Test database setup complete!"
