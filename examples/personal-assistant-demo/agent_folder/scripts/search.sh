#!/bin/bash
# Quick web search via DuckDuckGo
# Usage: ./scripts/search.sh "your query here"

set -euo pipefail

query="${1:?Usage: search.sh \"query\"}"
encoded=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$query'''))")

curl -sL "https://lite.duckduckgo.com/lite?q=$encoded" \
  -H "User-Agent: Mozilla/5.0 (compatible; AshBot/1.0)" \
  | python3 -c "
import sys, re, html as htmlmod

content = sys.stdin.read()

# Extract result links and snippets from DuckDuckGo Lite
links = re.findall(r'<a[^>]*rel=\"nofollow\"[^>]*href=\"([^\"]+)\"[^>]*class=\"result-link\">(.*?)</a>', content, re.DOTALL)
snippets = re.findall(r'<td class=\"result-snippet\">(.*?)</td>', content, re.DOTALL)

if not links:
    # Fallback: try alternate format
    links = re.findall(r'<a[^>]*class=\"result-link\"[^>]*href=\"([^\"]+)\">(.*?)</a>', content, re.DOTALL)

for i, (url, title) in enumerate(links[:8]):
    clean_title = re.sub(r'<[^>]+>', '', htmlmod.unescape(title)).strip()
    snippet = ''
    if i < len(snippets):
        snippet = re.sub(r'<[^>]+>', '', htmlmod.unescape(snippets[i])).strip()
    print(f'{i+1}. {clean_title}')
    print(f'   {url}')
    if snippet:
        print(f'   {snippet}')
    print()

if not links:
    print('No results found. Try a different query.')
"
