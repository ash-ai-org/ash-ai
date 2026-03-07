---
name: daily-brief
description: Create a daily briefing on a topic by searching for the latest news and developments.
use_when: User asks for a daily briefing, news summary, morning update, or latest developments on a topic
allowed-tools: Bash(./scripts/*), Bash(curl:*), Bash(python3:*), WebSearch(*), WebFetch(*), Read, Write
---

# Daily Brief

Create a concise daily briefing on a given topic.

## Process

1. Use `./scripts/search.sh "$ARGUMENTS"` to find the latest news
2. Use `./scripts/fetch-page.sh <url>` to read the top 3-5 articles
3. Write a concise briefing with the most important updates
4. Save the briefing to `daily-brief.md`
5. Print the full briefing

## Output Format

```markdown
# Daily Brief: [Topic]
_[Date]_

## Top Stories

### 1. [Headline]
[2-3 sentence summary with key takeaway]

### 2. [Headline]
[2-3 sentence summary with key takeaway]

...

## Key Takeaways
- [Bullet point]
- [Bullet point]

## Sources
- [Source 1](url)
- [Source 2](url)
```
