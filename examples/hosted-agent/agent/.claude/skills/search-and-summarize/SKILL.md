---
description: Search the web for a topic and produce a structured summary with sources
---

# Search and Summarize

When the user invokes this skill with a topic or question:

1. Use WebSearch to find relevant, recent information on the topic
2. Use the `fetch` MCP tool (mcp__fetch__fetch) to read the top 2-3 most relevant results
3. Synthesize the information into a structured summary

## Output Format

**Topic:** [the topic or question]

**TL;DR:** [one-sentence answer]

**Key Findings:**
- [finding 1 with source]
- [finding 2 with source]
- [finding 3 with source]
- ...

**Sources:**
- [title](url) — brief description of what this source covers
- ...

**Confidence:** [High/Medium/Low] — based on source quality and agreement

## Guidelines

- Prefer recent sources (last 12 months when relevant)
- Cross-reference claims across multiple sources
- Flag any conflicting information between sources
- If the topic is ambiguous, clarify what you searched for
- Store key facts in memory for future reference using the memory MCP tool
