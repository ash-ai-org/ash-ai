---
description: Analyze a code snippet or file for quality, bugs, and improvements
---

# Analyze Code

When the user provides code (inline or as a file path) and invokes this skill:

1. If given a file path, read the file using the Read tool
2. Analyze the code for:
   - Correctness issues and potential bugs
   - Security vulnerabilities (OWASP top 10)
   - Performance concerns
   - Readability and maintainability

## Output Format

**Language:** [detected language]
**Lines:** [line count]

**Issues Found:**

| Severity | Line(s) | Issue | Suggestion |
|----------|---------|-------|------------|
| [Critical/Warning/Info] | [line numbers] | [description] | [fix] |

**Summary:**
- [overall assessment in 1-2 sentences]

**Suggested Improvements:**
1. [improvement 1]
2. [improvement 2]
3. ...

## Guidelines

- Focus on actionable findings, not style nitpicks
- For security issues, explain the attack vector briefly
- If the code looks good, say so — don't invent problems
- Limit to the top 5-10 most impactful findings
