---
description: Summarize files, URLs, or text into concise bullet points
---

# Summarize

When the user asks you to summarize something:

1. If given a file path, read the file using the Read tool
2. If given a URL, fetch the content using WebFetch
3. If given inline text, use it directly

Then produce a summary with:
- A one-sentence TL;DR
- 3-7 bullet points covering the key points
- Keep each bullet to one sentence

Format the output as:

**TL;DR:** [one sentence]

**Key Points:**
- [point 1]
- [point 2]
- ...
