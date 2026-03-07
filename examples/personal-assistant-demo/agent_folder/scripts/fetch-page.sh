#!/bin/bash
# Fetch a webpage and extract readable text content
# Usage: ./scripts/fetch-page.sh <url>

set -euo pipefail

url="${1:?Usage: fetch-page.sh <url>}"

curl -sL "$url" \
  -H "User-Agent: Mozilla/5.0 (compatible; AshBot/1.0)" \
  --max-time 15 \
  | python3 -c "
import sys, re, html as htmlmod

content = sys.stdin.read()

# Remove script, style, nav, header, footer tags and their content
for tag in ['script', 'style', 'nav', 'header', 'footer', 'aside']:
    content = re.sub(f'<{tag}[^>]*>.*?</{tag}>', '', content, flags=re.DOTALL | re.IGNORECASE)

# Remove all HTML tags
text = re.sub(r'<[^>]+>', ' ', content)

# Decode HTML entities
text = htmlmod.unescape(text)

# Normalize whitespace
text = re.sub(r'[ \t]+', ' ', text)
text = re.sub(r'\n\s*\n+', '\n\n', text)
text = text.strip()

# Limit output
lines = text.split('\n')
for line in lines[:200]:
    print(line.strip())

if len(lines) > 200:
    print(f'\n... ({len(lines) - 200} more lines truncated)')
"
