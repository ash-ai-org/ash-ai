---
name: research
description: Research a topic using web search and browsing. Gathers current information, synthesizes findings, and writes a report.
use_when: User asks to research a topic, find information, look something up, or gather data on a subject
allowed-tools: Bash(./scripts/*), Bash(curl:*), Bash(python3:*), WebSearch(*), WebFetch(*), Read, Write
---

# Research

Research a topic and produce a written report.

## Process

1. Use `./scripts/search.sh "$ARGUMENTS"` for a quick web search
2. Use `./scripts/fetch-page.sh <url>` to read the most relevant results
3. Synthesize findings into a clear, concise report
4. Save the report to `research-report.md`
5. Print a summary of key takeaways

## Output Format

The report should be markdown with:
- A title and date
- Executive summary (2-3 sentences)
- Key findings as bullet points
- Sources with URLs
