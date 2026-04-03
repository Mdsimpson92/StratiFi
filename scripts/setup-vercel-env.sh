#!/bin/bash
# ── Setup Vercel environment variables ────────────────────────────────────────
#
# Usage:
#   1. Replace DATABASE_URL below with your Neon connection string
#   2. Run: bash scripts/setup-vercel-env.sh
#   3. Then: vercel --prod
#
# Prerequisites:
#   - vercel CLI installed and linked (run `vercel` once first)
#   - Neon database created at https://console.neon.tech

set -e

# ══════════════════════════════════════════════════════════════════════════════
# REPLACE THIS with your Neon connection string
# Format: postgresql://user:password@host/dbname?sslmode=require
DATABASE_URL="postgresql://neondb_owner:npg_vZC8uexUg5lI@ep-little-dawn-anxe4jsh.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require"
# ══════════════════════════════════════════════════════════════════════════════

if [[ "$DATABASE_URL" == *"REPLACE_ME"* ]]; then
  echo "ERROR: Replace DATABASE_URL in this script with your Neon connection string first."
  exit 1
fi

# Parse DATABASE_URL into individual components for the pg client
# Format: postgresql://user:password@host:port/dbname?sslmode=require
DB_USER=$(echo "$DATABASE_URL" | sed -n 's|postgresql://\([^:]*\):.*|\1|p')
DB_PASSWORD=$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^:]*:\([^@]*\)@.*|\1|p')
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:/]*\).*|\1|p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*@[^:]*:\([0-9]*\)/.*|\1|p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's|.*/\([^?]*\).*|\1|p')
DB_PORT=${DB_PORT:-5432}

echo "Parsed connection: $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
echo ""

# ── Set env vars in Vercel ────────────────────────────────────────────────────

echo "Setting Vercel environment variables..."

# Database
echo "$DB_HOST"     | vercel env add DB_HOST production --force 2>/dev/null || true
echo "$DB_PORT"     | vercel env add DB_PORT production --force 2>/dev/null || true
echo "$DB_NAME"     | vercel env add DB_NAME production --force 2>/dev/null || true
echo "$DB_USER"     | vercel env add DB_USER production --force 2>/dev/null || true
echo "$DB_PASSWORD" | vercel env add DB_PASSWORD production --force 2>/dev/null || true
echo "true"         | vercel env add DB_SSL production --force 2>/dev/null || true

# Clerk
echo "pk_test_cHJvYmFibGUtY2xhbS02MS5jbGVyay5hY2NvdW50cy5kZXYk" | vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY production --force 2>/dev/null || true
echo "sk_test_LAPxCehGUI4RHpv5JIkFvBV7ij2hXOAhBFewr1ox9j" | vercel env add CLERK_SECRET_KEY production --force 2>/dev/null || true
echo "/sign-in" | vercel env add NEXT_PUBLIC_CLERK_SIGN_IN_URL production --force 2>/dev/null || true
echo "/sign-up" | vercel env add NEXT_PUBLIC_CLERK_SIGN_UP_URL production --force 2>/dev/null || true
echo "/"        | vercel env add NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL production --force 2>/dev/null || true
echo "/"        | vercel env add NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL production --force 2>/dev/null || true

# Plaid
echo "69cde97f617ad0000c5acbaa"      | vercel env add PLAID_CLIENT_ID production --force 2>/dev/null || true
echo "76eedc2655102791eaff3849763d0e" | vercel env add PLAID_SECRET production --force 2>/dev/null || true
echo "sandbox"                        | vercel env add PLAID_ENV production --force 2>/dev/null || true

# VAPID
echo "BCxj7HKKQZ8JytHhv0mUNt_x1zGyfm6hfOSEUvEt3TA82syhPBS37Xzfpc75Ei7MyS4eZAikpEf10UoR4afH7kU" | vercel env add NEXT_PUBLIC_VAPID_PUBLIC_KEY production --force 2>/dev/null || true
echo "LTxMuWmkou0JBk7_6IHzE7tv0hqeO1LaIPuTpcI38lQ" | vercel env add VAPID_PRIVATE_KEY production --force 2>/dev/null || true
echo "mailto:alerts@stratifi.app"                     | vercel env add VAPID_CONTACT production --force 2>/dev/null || true

# Upstash Redis
echo "https://settling-bonefish-90890.upstash.io" | vercel env add UPSTASH_REDIS_REST_URL production --force 2>/dev/null || true
echo "gQAAAAAAAWMKAAIncDE1ZjczZjA2ZDc2ZWU0NDA0OTEzZjQ2YWY5Y2Q3OTIyZHAxOTA4OTA" | vercel env add UPSTASH_REDIS_REST_TOKEN production --force 2>/dev/null || true

# Feature flags
echo "true" | vercel env add FEATURE_PAYWALL production --force 2>/dev/null || true

echo ""
echo "✓ All environment variables set."
echo ""
echo "Next steps:"
echo "  1. Run your migrations against the Neon database:"
echo "     DATABASE_URL=\"$DATABASE_URL\" npx tsx scripts/run-migration.ts migrations/010_create_missing_tables.sql"
echo "     DATABASE_URL=\"$DATABASE_URL\" npx tsx scripts/run-migration.ts migrations/011_support_interactions.sql"
echo "  2. Deploy: vercel --prod"
echo "  3. Copy the deployment URL and:"
echo "     - Add it to Clerk → Allowed Origins"
echo "     - Set NEXT_PUBLIC_APP_URL in Vercel dashboard"
echo "     - Update Stripe webhook URL if using checkout"
