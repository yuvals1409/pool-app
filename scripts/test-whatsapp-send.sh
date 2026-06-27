#!/usr/bin/env bash
# בדיקת שליחת hello_world דרך Supabase send-whatsapp
# שימוש:
#   WHATSAPP_SEND_SECRET=your-secret ./scripts/test-whatsapp-send.sh 0552288200

set -euo pipefail

TO="${1:-0552288200}"
SECRET="${WHATSAPP_SEND_SECRET:?Set WHATSAPP_SEND_SECRET}"
PROJECT="bhqknxcrarzqulcojgxk"

curl -sS -X POST \
  "https://${PROJECT}.supabase.co/functions/v1/send-whatsapp" \
  -H "Authorization: Bearer ${SECRET}" \
  -H "Content-Type: application/json" \
  -d "{\"to\":\"${TO}\",\"template\":\"hello_world\",\"language\":\"en_US\"}" \
  | python3 -m json.tool 2>/dev/null || cat

echo ""
