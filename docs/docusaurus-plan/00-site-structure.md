# 00 - Site Structure

## Information Architecture

```
ash.dev/docs/
├── Getting Started
│   ├── Introduction                    # What is Ash, why use it
│   ├── Installation                    # Install CLI, prerequisites
│   ├── Quickstart                      # Deploy first agent in 5 min
│   └── Key Concepts                    # Agents, sessions, sandboxes (overview)
│
├── Guides
│   ├── Defining an Agent               # CLAUDE.md, config, skills, MCP
│   ├── Deploying Agents                # ash deploy workflow
│   ├── Managing Sessions               # Create, send, pause, resume, end
│   ├── Streaming Responses             # SSE consumption patterns
│   ├── Working with Files              # Read/list workspace files
│   ├── Authentication                  # API keys, multi-tenant setup
│   └── Monitoring                      # Health checks, metrics, timing
│
├── Self-Hosting
│   ├── Docker (Default)                # ash start, configuration
│   ├── Deploy to AWS EC2               # Production EC2 setup
│   ├── Deploy to Google Cloud          # GCE setup
│   ├── Configuration Reference         # All env vars, defaults
│   └── Multi-Machine Setup             # Coordinator + runner mode
│
├── API Reference
│   ├── Overview                        # Base URL, auth, errors, pagination
│   ├── Agents                          # CRUD endpoints
│   ├── Sessions                        # Lifecycle endpoints
│   ├── Messages                        # Send + SSE stream format
│   ├── Files                           # Workspace file access
│   └── Health & Metrics                # Monitoring endpoints
│
├── SDKs
│   ├── TypeScript SDK                  # AshClient, methods, examples
│   ├── Python SDK                      # Auto-generated client
│   └── Direct API (curl)              # Raw HTTP examples
│
├── CLI Reference
│   ├── ash start / stop / status       # Lifecycle commands
│   ├── ash deploy                      # Agent deployment
│   ├── ash agent                       # Agent management
│   ├── ash session                     # Session management
│   └── ash health                      # Health check
│
├── Architecture
│   ├── System Overview                 # Components, data flow diagram
│   ├── Sandbox Isolation               # Security model, env allowlist
│   ├── Bridge Protocol                 # Unix socket, wire format
│   ├── Session Lifecycle               # State machine, pause/resume
│   ├── Sandbox Pool                    # Pool states, eviction, capacity
│   ├── SSE Backpressure                # Flow control design
│   └── Design Decisions                # ADRs (link to each)
│
└── Contributing
    ├── Development Setup               # Clone, install, build, test
    ├── Project Structure               # Package map, dependency graph
    ├── Testing Guide                   # Unit, integration, isolation, load
    └── Release Process                 # Changesets, versioning, CI
```

## Top Navigation

```
Docs    |    API    |    Blog    |    GitHub
```

- **Docs**: Main documentation (sidebar navigation)
- **API**: OpenAPI/Swagger UI (auto-generated, link to `/docs` endpoint on server)
- **Blog**: Release notes, feature announcements (optional, later)
- **GitHub**: Link to repo

## Sidebar Groups

Docusaurus sidebar config maps to the IA above. Each top-level section is a collapsible category. Pages within are ordered intentionally (not alphabetical).

## Landing Page

The docs landing page (`/docs`) should be the Introduction page, with:
- One-sentence description: "Deploy and orchestrate AI agents with a single CLI command."
- Three cards linking to: Quickstart, API Reference, Self-Hosting
- Architecture diagram (simplified)

## Search

Use Docusaurus built-in search (Algolia DocSearch or local search plugin). No custom search needed initially.

## Versioning

Not needed initially. Ash is pre-1.0. Add versioning when there's a stable release worth snapshotting.
