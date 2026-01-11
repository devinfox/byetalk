#!/bin/bash
# Local cron script for processing calls
# Add to crontab: */5 * * * * /path/to/crm/scripts/cron-process-calls.sh

cd "$(dirname "$0")/.."

# Load environment variables
if [ -f .env.local ]; then
  export $(cat .env.local | grep -v '^#' | xargs)
fi

APP_URL="${NEXT_PUBLIC_APP_URL:-http://localhost:3000}"
CRON_SECRET="${CRON_SECRET:-}"

echo "$(date): Running call processing cron job..."

if [ -n "$CRON_SECRET" ]; then
  curl -s -X GET "$APP_URL/api/cron/process-calls" \
    -H "Authorization: Bearer $CRON_SECRET" \
    -H "Content-Type: application/json"
else
  curl -s -X GET "$APP_URL/api/cron/process-calls" \
    -H "Content-Type: application/json"
fi

echo ""
echo "$(date): Cron job completed"
