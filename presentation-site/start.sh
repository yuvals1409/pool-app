#!/bin/bash
cd "$(dirname "$0")"
PORT="${1:-8765}"
echo ""
echo "  מרכז ספורט נווה עוז — שרת הדגמה"
echo "  פתח בדפדפן: http://127.0.0.1:$PORT/"
echo "  (Ctrl+C לעצירה)"
echo ""
python3 -m http.server "$PORT" --bind 127.0.0.1
