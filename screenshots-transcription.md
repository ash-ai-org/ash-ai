# Screenshots Transcription

## Screenshot 1: homepage.png — Ash Landing Page

### Navigation Bar
- [Ash logo] **Ash**  |  Docs                                    GitHub [↗]  [Dashboard ↗] (green button)

### Hero Section
# Ash

Deploy Claude agents as production APIs — with sessions, streaming,
sandboxing, and persistence handled for you.

[Get Started] (green button)    [API Reference] (outlined button)

### Feature Cards (3 cards, 2 top + 1 bottom-left)

**Define agents as folders**
An agent is just a folder with a CLAUDE.md file. Add skills, MCP
tools, and permission configs. Deploy with one command.

**Production-ready API**
REST API with SSE streaming, session persistence, pause/resume,
OpenAPI spec, and TypeScript + Python SDKs out of the box.

**Sandboxed execution**
Each session runs in an isolated process with restricted environment,
resource limits, and filesystem isolation.

### Quick Start

```
npm install -g @ash-ai/cli

# Start the server
export ANTHROPIC_API_KEY=sk-ant-...
ash start

# Define and deploy an agent
mkdir my-agent
echo "You are a helpful assistant." > my-agent/CLAUDE.md
ash deploy ./my-agent --name my-agent

# Chat with it
ash session create my-agent
ash session send <SESSION_ID> "Hello!"
```

[Full Quickstart Guide] (green button)

### Footer

DOCUMENTATION          SDKS            COMMUNITY
Getting Started        TypeScript      GitHub [↗]
API Reference          Python          npm [↗]
CLI Reference

Copyright © 2026 Ash. Built with Docusaurus.

---

## Screenshot 2: docs-page.png — Quickstart Page (Full Page, Zoomed Out)

This is a zoomed-out view of the full Quickstart documentation page. The same content is shown in more detail in screenshots 3–5. The visible sections from top to bottom are:

### Left Sidebar
- Dashboard
- GitHub
- npm
- Changelog
- Introduction
- GETTING STARTED (expanded)
  - Installation
  - **Quickstart** (active/highlighted)
  - Key Concepts
- GUIDES >
- SELF-HOSTING >
- API REFERENCE >
- SDKS >
- CLI REFERENCE >
- ARCHITECTURE >

### Main Content (visible sections, top to bottom)

**Quickstart**

Deploy an agent and chat with it. This takes about two minutes,
assuming you have completed Installation.

**1. Define an Agent**

(Code block with mkdir/cat commands to create agent folder and CLAUDE.md)

**2. Deploy and Chat**

(Code blocks showing ash deploy, ash session create, and ash session send commands with example output)

(Green info callout box: tip about using `ash session create` with `--interactive` flag)

**Detailed Flow (Optional)**

(Explanation of what happens under the hood, with code blocks)

**Using the SDKs**

TypeScript and curl tabs with code examples showing SDK usage

**What Just Happened**

(Bullet points explaining the flow with highlighted links to key concepts)

**Next Steps**

(Bullet list of links: Key Concepts, CLI Reference, API Reference, TypeScript SDK, Python SDK)

### Footer
(Same as homepage)

---

## Screenshot 3: sidebar-clean.png — Quickstart Page Top (Sidebar Without External Link Icons)

### Navigation Bar
- [Ash logo] **Ash**  |  Docs                                    GitHub [↗]  [Dashboard ↗] (green button)

### Left Sidebar
- [grid icon] Dashboard
- [GitHub icon] GitHub
- [terminal icon] npm
- [document icon] Changelog
- [document icon] Introduction
- GETTING STARTED (expanded, with chevron ˅)
  - [download icon] Installation
  - [lightning icon] **Quickstart** (highlighted in green/yellow, active page)
  - [squares icon] Key Concepts
- GUIDES >
- SELF-HOSTING >
- API REFERENCE >
- SDKS >
- CLI REFERENCE >
- ARCHITECTURE >

### Breadcrumb
🏠 > Getting Started > Quickstart

### Main Content

# Quickstart                                          [Copy page ▾]

Deploy an agent and chat with it. This takes about two minutes,
assuming you have completed [Installation] (link).

## 1. Define an Agent

An agent is a folder with a `CLAUDE.md` file. The `CLAUDE.md` is the system
prompt -- it tells the agent who it is and how to behave.

```
● ● ●  (terminal window dots: red, yellow, green)

mkdir my-agent

cat > my-agent/CLAUDE.md << 'EOF'
You are a helpful coding assistant.
Answer questions about JavaScript and TypeScript.
Keep answers concise. Include working code examples.
EOF
```

That is the only required file. For production agents, you can add
`.claude/settings.json` (tool permissions), `.claude/skills/` (reusable skills),
and `.mcp.json` (MCP server connections). See [Key Concepts] (link) for more.

### Right Sidebar (Table of Contents)
- **1. Define an Agent** (highlighted in green, active)
- 2. Deploy and Chat
- Detailed Flow (Optional)
- Using the SDKs
  - curl
- What Just Happened
- Next Steps

---

## Screenshot 4: sidebar-links.png — Quickstart Page Bottom (Next Steps + Footer)

### Navigation Bar
- [Ash logo] **Ash**  |  Docs                                    GitHub [↗]  [Dashboard ↗] (green button)

### Left Sidebar
- (partially visible at top) Changelog [↗]
- [document icon] Introduction
- GETTING STARTED (expanded, with chevron ˅)
  - [download icon] Installation
  - [lightning icon] **Quickstart** (highlighted in green/yellow, active page)
  - [squares icon] Key Concepts
- GUIDES >
- SELF-HOSTING >
- API REFERENCE >
- SDKS >
- CLI REFERENCE >
- ARCHITECTURE >
- (partially visible) COMPARISONS >

### Main Content (bottom of Quickstart page)

(Partial paragraph visible at top:)
allowlisted variables reach it, and on Linux it runs with cgroup resource limits
and filesystem isolation via bubblewrap.

## Next Steps

- [**Key Concepts**] (link) -- Understand agents, sessions, sandboxes, bridges, and the server
- [**CLI Reference**] (link) -- All commands and flags
- [**API Reference**] (link) -- REST endpoints, SSE format, request/response schemas
- [**TypeScript SDK**] (link) -- Full TypeScript client documentation
- [**Python SDK**] (link) -- Full Python client documentation

[✏️ Edit this page] (link)

### Page Navigation
PREVIOUS                              NEXT
[« Installation]                      [Key Concepts »]

### Right Sidebar (Table of Contents)
- 1. Define an Agent
- 2. Deploy and Chat
- Detailed Flow (Optional)
- Using the SDKs
  - curl
- What Just Happened
- **Next Steps** (highlighted in green, active)

### Footer

DOCUMENTATION          SDKS            COMMUNITY
Getting Started        TypeScript      GitHub [↗]
API Reference          Python          npm [↗]
CLI Reference

Copyright © 2026 Ash. Built with Docusaurus.

---

## Screenshot 5: sidebar-top.png — Quickstart Page Top (Sidebar WITH External Link Icons)

This screenshot is nearly identical to Screenshot 3 (sidebar-clean.png), with one key difference: the top four sidebar items now display external link icons (↗) after their labels.

### Left Sidebar (difference from Screenshot 3 highlighted)
- [grid icon] Dashboard [↗]          ← has external link icon
- [GitHub icon] GitHub [↗]           ← has external link icon
- [terminal icon] npm [↗]            ← has external link icon
- [document icon] Changelog [↗]      ← has external link icon
- [document icon] Introduction
- GETTING STARTED (expanded, with chevron ˅)
  - [download icon] Installation
  - [lightning icon] **Quickstart** (highlighted in green/yellow, active page)
  - [squares icon] Key Concepts
- GUIDES >
- SELF-HOSTING >
- API REFERENCE >
- SDKS >
- CLI REFERENCE >
- ARCHITECTURE >

### Main Content
(Identical to Screenshot 3 — Quickstart page top with "1. Define an Agent" section)

### Right Sidebar (Table of Contents)
(Identical to Screenshot 3)
